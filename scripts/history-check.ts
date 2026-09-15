import * as os from 'os';
import * as path from 'path';
import { Scanner } from '../src/scanner';
import { buildSnapshot } from '../src/aggregate';
import type { Config } from '../src/config';

const cfg = {
  source: 'transcripts', plan: 'auto', apiPollSeconds: 60, blockTokenLimit: 0, weeklyTokenLimit: 0,
  blockHours: 5, weeklyMode: 'rolling7d', weekStartsOn: 'monday', statusBar: {} as never,
  refreshIntervalMs: 3000, watchFiles: true, claudeDir: '', lookbackDays: 30,
  countInput: true, countOutput: true, countCacheWrites: true, countCacheReads: true,
  includeSubagents: true, projectFilter: 'all',
  cost: { enabled: true, currencySymbol: '$', pricing: {} },
  dashboard: { maxSessions: 5 } as never, notifications: { enabled: true, thresholds: [] }
} as unknown as Config;

(async () => {
  const scanner = new Scanner(path.join(os.homedir(), '.claude', 'projects'));
  await scanner.scan(30);
  const snap = buildSnapshot(scanner.events, cfg, undefined, undefined);
  const peak = Math.max(...snap.history.map((d) => d.counted));
  console.log(`${scanner.events.length} events, ${scanner.scannedFiles} files scanned\n`);
  for (const d of snap.history) {
    const pct = peak ? (d.counted / peak) * 100 : 0;
    const bar = '#'.repeat(Math.round(pct / 4));
    console.log(`  ${d.date}  ${(d.counted / 1e6).toFixed(1).padStart(7)}M  ${pct.toFixed(1).padStart(5)}%  ${bar}`);
  }
  const nonZero = snap.history.filter((d) => d.counted > 0).length;
  console.log(`\n${nonZero} of 30 days have data; oldest event ${new Date(Math.min(...scanner.events.map((e) => e.ts))).toISOString().slice(0, 10)}`);
})();
