import type { Config } from './config';
import type { LimitWindow, UsageReport } from './usageApi';
import { costOf, priceFor } from './pricing';
import type {
  DayRow, ModelRow, SessionRow, Snapshot, Totals, UsageEvent, Window
} from './types';

export function emptyTotals(): Totals {
  return {
    input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0,
    counted: 0, raw: 0, cost: 0, messages: 0
  };
}

function add(target: Totals, e: UsageEvent, cfg: Config): void {
  target.input += e.input;
  target.output += e.output;
  target.cacheWrite5m += e.cacheWrite5m;
  target.cacheWrite1h += e.cacheWrite1h;
  target.cacheRead += e.cacheRead;
  target.messages += 1;
  target.raw += e.input + e.output + e.cacheWrite5m + e.cacheWrite1h + e.cacheRead;
  target.counted +=
    (cfg.countInput ? e.input : 0) +
    (cfg.countOutput ? e.output : 0) +
    (cfg.countCacheWrites ? e.cacheWrite5m + e.cacheWrite1h : 0) +
    (cfg.countCacheReads ? e.cacheRead : 0);
  if (cfg.cost.enabled) {
    target.cost += costOf(e, priceFor(e.model, cfg.cost.pricing));
  }
}

function sum(events: UsageEvent[], cfg: Config): Totals {
  const t = emptyTotals();
  for (const e of events) { add(t, e, cfg); }
  return t;
}

export function filterEvents(events: UsageEvent[], cfg: Config, workspace: string | undefined): UsageEvent[] {
  return events.filter((e) => {
    if (!cfg.includeSubagents && e.isSidechain) { return false; }
    if (cfg.projectFilter === 'currentWorkspace' && workspace && e.project !== workspace) { return false; }
    return true;
  });
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts: number, weekStartsOn: 'sunday' | 'monday'): number {
  const d = new Date(startOfDay(ts));
  const shift = weekStartsOn === 'monday' ? (d.getDay() + 6) % 7 : d.getDay();
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

/**
 * Rebuilds the rolling usage blocks. A block opens at its first message and runs
 * for blockHours; a gap of a full block also opens a new
 * one. The window is anchored to the exact first message rather than the top of
 * the hour: Claude Code reports resets on the minute ("resets 1:40pm").
 */
export function currentBlock(events: UsageEvent[], now: number, blockHours: number): { start: number; end: number; events: UsageEvent[] } {
  const span = blockHours * 3_600_000;
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  let start = 0;
  let last = 0;
  let bucket: UsageEvent[] = [];
  for (const e of sorted) {
    if (!bucket.length || e.ts >= start + span || e.ts - last >= span) {
      start = e.ts;
      bucket = [];
    }
    bucket.push(e);
    last = e.ts;
  }
  if (!bucket.length || now >= start + span) {
    return { start: now, end: now + span, events: [] };
  }
  return { start, end: start + span, events: bucket };
}

function makeWindow(
  start: number, end: number, totals: Totals, limit: number, now: number,
  reported: LimitWindow | undefined
): Window {
  if (reported) {
    const resetAt = reported.resetsAt ?? end;
    return {
      start, end: resetAt, totals, limit,
      percent: reported.utilization, hasPercent: true,
      remainingMs: Math.max(0, resetAt - now)
    };
  }
  const percent = limit > 0 ? Math.min(999, (totals.counted / limit) * 100) : 0;
  return {
    start, end, totals, limit, percent, hasPercent: limit > 0,
    remainingMs: Math.max(0, end - now)
  };
}

export function buildSnapshot(
  allEvents: UsageEvent[],
  cfg: Config,
  workspace: string | undefined,
  report: UsageReport | undefined,
  now = Date.now()
): Snapshot {
  const events = filterEvents(allEvents, cfg, workspace);

  const block = currentBlock(events, now, cfg.blockHours);
  const blockTotals = sum(block.events, cfg);

  const weekStart = cfg.weeklyMode === 'rolling7d'
    ? now - 7 * 86_400_000
    : startOfWeek(now, cfg.weekStartsOn);
  const weekEnd = cfg.weeklyMode === 'rolling7d' ? now + 7 * 86_400_000 : weekStart + 7 * 86_400_000;
  const weekEvents = events.filter((e) => e.ts >= weekStart);
  const weekTotals = sum(weekEvents, cfg);

  const blockLimit = cfg.blockTokenLimit;
  const weekLimit = cfg.weeklyTokenLimit;

  const dayStart = startOfDay(now);
  const today = sum(events.filter((e) => e.ts >= dayStart), cfg);

  const sessions = buildSessions(events, cfg, now);
  const session = sessions.find((s) => s.active) ?? sessions[0];

  const models = buildModels(block.events.length ? block.events : weekEvents, cfg);
  const history = buildHistory(events, cfg, now);
  const { burnPerMin, series } = burn(block.events, now);

  const remainingTokens = Math.max(0, blockLimit - blockTotals.counted);
  const projected = burnPerMin > 0 && blockLimit > 0
    ? Math.min(block.end - now, (remainingTokens / burnPerMin) * 60_000)
    : undefined;

  const snapshot: Snapshot = {
    block: makeWindow(block.start, block.end, blockTotals, blockLimit, now, report?.fiveHour),
    week: makeWindow(weekStart, weekEnd, weekTotals, weekLimit, now, report?.sevenDay),
    today,
    session,
    models,
    sessions: sessions.slice(0, cfg.dashboard.maxSessions),
    history,
    burnPerMin,
    burnSeries: series,
    projectedExhaustionMs: projected,
    scannedFiles: 0,
    eventCount: events.length,
    lastUpdate: now,
    costEnabled: cfg.cost.enabled,
    source: report ? 'account' : 'transcripts',
    opusWeek: report?.sevenDayOpus?.utilization,
    sonnetWeek: report?.sevenDaySonnet?.utilization
  };
  return snapshot;
}

function buildSessions(events: UsageEvent[], cfg: Config, now: number): SessionRow[] {
  const map = new Map<string, SessionRow>();
  for (const e of events) {
    let row = map.get(e.sessionId);
    if (!row) {
      row = { sessionId: e.sessionId, project: e.project, lastTs: 0, active: false, totals: emptyTotals() };
      map.set(e.sessionId, row);
    }
    if (e.ts > row.lastTs) { row.lastTs = e.ts; row.project = e.project; }
    add(row.totals, e, cfg);
  }
  const rows = [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
  for (const row of rows) { row.active = now - row.lastTs < 10 * 60_000; }
  return rows;
}

function buildModels(events: UsageEvent[], cfg: Config): ModelRow[] {
  const map = new Map<string, Totals>();
  for (const e of events) {
    let t = map.get(e.model);
    if (!t) { t = emptyTotals(); map.set(e.model, t); }
    add(t, e, cfg);
  }
  return [...map.entries()]
    .map(([model, totals]) => ({ model, totals }))
    .sort((a, b) => b.totals.counted - a.totals.counted);
}

function buildHistory(events: UsageEvent[], cfg: Config, now: number): DayRow[] {
  const map = new Map<string, Totals>();
  for (const e of events) {
    const key = new Date(e.ts).toISOString().slice(0, 10);
    let t = map.get(key);
    if (!t) { t = emptyTotals(); map.set(key, t); }
    add(t, e, cfg);
  }
  const rows: DayRow[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const t = map.get(date);
    rows.push({ date, counted: t?.counted ?? 0, cost: t?.cost ?? 0 });
  }
  return rows;
}

function burn(events: UsageEvent[], now: number): { burnPerMin: number; series: number[] } {
  const buckets = 24;
  const bucketMs = 60_000;
  const series = new Array<number>(buckets).fill(0);
  const windowStart = now - buckets * bucketMs;
  let recent = 0;
  for (const e of events) {
    if (e.ts < windowStart) { continue; }
    const idx = Math.min(buckets - 1, Math.floor((e.ts - windowStart) / bucketMs));
    const tokens = e.input + e.output + e.cacheWrite5m + e.cacheWrite1h + e.cacheRead;
    series[idx] += tokens;
    if (now - e.ts <= 15 * bucketMs) { recent += tokens; }
  }
  return { burnPerMin: recent / 15, series };
}
