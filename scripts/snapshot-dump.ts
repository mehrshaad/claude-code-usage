import * as os from 'os';
import * as path from 'path';
import { Scanner } from '../src/scanner';
import { buildSnapshot } from '../src/aggregate';
import type { Config } from '../src/config';

// Exactly the defaults from package.json - what an unconfigured instance uses.
const cfg = {
  source: 'auto', plan: 'auto', apiPollSeconds: 60, blockTokenLimit: 0, weeklyTokenLimit: 0,
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
  const peak = Math.max(1, ...snap.history.map((d) => d.counted));
  console.log(`mode=${snap.historyMode}  rows=${snap.history.length}  events=${snap.eventCount}  peak=${(peak / 1e6).toFixed(1)}M`);
  console.log('what the renderer would compute as bar heights (% of the 46px track):');
  for (const d of snap.history) {
    const pct = (d.counted / peak) * 100;
    console.log(`  ${d.label.padEnd(6)} ${(d.counted / 1e6).toFixed(1).padStart(8)}M  ${pct.toFixed(1).padStart(6)}%  ${(pct * 0.46).toFixed(1).padStart(5)}px  ${'#'.repeat(Math.round(pct / 5))}`);
  }
})();
