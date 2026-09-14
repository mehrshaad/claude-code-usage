import * as fs from 'fs';
import * as path from 'path';
import type { UsageEvent } from './types';

interface FileState {
  offset: number;
}

interface RawLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  requestId?: string;
  uuid?: string;
  isSidechain?: boolean;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
    };
  };
}

/**
 * Incrementally reads Claude Code transcripts. Only bytes appended since the
 * previous pass are parsed, so a steady-state refresh costs almost nothing even
 * with tens of thousands of transcript files on disk.
 */
export class Scanner {
  private files = new Map<string, FileState>();
  private seen = new Set<string>();
  private eventsById = new Map<string, UsageEvent>();
  public scannedFiles = 0;

  constructor(private projectsDir: string) {}

  reset(): void {
    this.files.clear();
    this.seen.clear();
    this.eventsById.clear();
    this.scannedFiles = 0;
  }

  get events(): UsageEvent[] {
    return [...this.eventsById.values()];
  }

  async scan(lookbackDays: number): Promise<void> {
    const cutoff = Date.now() - lookbackDays * 86_400_000;
    const paths = await this.listTranscripts(cutoff);
    this.scannedFiles = paths.length;
    for (const file of paths) {
      try {
        await this.readFile(file);
      } catch {
        // A transcript can be rotated or removed mid-scan; skip it this pass.
      }
    }
    this.prune(cutoff);
  }

  private async listTranscripts(cutoff: number): Promise<string[]> {
    const out: string[] = [];
    let projects: fs.Dirent[];
    try {
      projects = await fs.promises.readdir(this.projectsDir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const project of projects) {
      if (!project.isDirectory()) { continue; }
      const dir = path.join(this.projectsDir, project.name);
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) { continue; }
        const file = path.join(dir, entry.name);
        try {
          const stat = await fs.promises.stat(file);
          if (stat.mtimeMs < cutoff) { continue; }
          const state = this.files.get(file);
          if (state && stat.size === state.offset) { continue; }
          if (state && stat.size < state.offset) { state.offset = 0; }
          out.push(file);
        } catch {
          continue;
        }
      }
    }
    return out;
  }

  private async readFile(file: string): Promise<void> {
    const state = this.files.get(file) ?? { offset: 0 };
    const handle = await fs.promises.open(file, 'r');
    try {
      const { size } = await handle.stat();
      if (size <= state.offset) {
        this.files.set(file, state);
        return;
      }
      const length = size - state.offset;
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, state.offset);
      const text = buffer.toString('utf8');
      const lastBreak = text.lastIndexOf('\n');
      if (lastBreak === -1) {
        // Partial line only - wait for the rest before advancing.
        this.files.set(file, state);
        return;
      }
      const complete = text.slice(0, lastBreak);
      state.offset += Buffer.byteLength(complete, 'utf8') + 1;
      this.files.set(file, state);
      const project = path.basename(path.dirname(file));
      for (const line of complete.split('\n')) {
        this.ingest(line, project);
      }
    } finally {
      await handle.close();
    }
  }

  private ingest(line: string, projectDir: string): void {
    if (line.length < 2 || !line.includes('"usage"')) { return; }
    let raw: RawLine;
    try {
      raw = JSON.parse(line) as RawLine;
    } catch {
      return;
    }
    if (raw.type !== 'assistant') { return; }
    const usage = raw.message?.usage;
    const model = raw.message?.model;
    if (!usage || !model || model === '<synthetic>') { return; }

    // One logical assistant message is written as several JSONL lines (one per
    // content block) and is copied verbatim into resumed sessions. Both repeats
    // carry the same message id and request id, so key on the pair.
    const key = `${raw.message?.id ?? ''}|${raw.requestId ?? raw.uuid ?? ''}`;
    if (this.seen.has(key)) { return; }
    this.seen.add(key);

    const ts = raw.timestamp ? Date.parse(raw.timestamp) : NaN;
    if (!Number.isFinite(ts)) { return; }

    const creation = usage.cache_creation;
    const total5m = creation?.ephemeral_5m_input_tokens ?? 0;
    const total1h = creation?.ephemeral_1h_input_tokens ?? 0;
    const declared = usage.cache_creation_input_tokens ?? 0;
    // Older transcripts report only the flat total; attribute it to the 5m tier.
    const split = total5m + total1h > 0;

    this.eventsById.set(key, {
      ts,
      model,
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
      cacheWrite5m: split ? total5m : declared,
      cacheWrite1h: split ? total1h : 0,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      sessionId: raw.sessionId ?? '',
      project: projectName(raw.cwd, projectDir),
      isSidechain: raw.isSidechain === true
    });
  }

  private prune(cutoff: number): void {
    for (const [key, event] of this.eventsById) {
      if (event.ts < cutoff) {
        this.eventsById.delete(key);
        this.seen.delete(key);
      }
    }
  }
}

function projectName(cwd: string | undefined, projectDir: string): string {
  if (cwd && cwd !== '/') {
    const base = path.basename(cwd);
    if (base) { return base; }
  }
  const trimmed = projectDir.replace(/^-+/, '').replace(/-+$/, '');
  const parts = trimmed.split('-').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'unknown';
}
