import * as os from 'os';
import * as path from 'path';
import { Scanner } from '../src/scanner';
import { buildSnapshot } from '../src/aggregate';
import type { Config } from '../src/config';

const base = {
  source: 'auto', plan: 'auto', apiPollSeconds: 60, blockTokenLimit: 0, weeklyTokenLimit: 0,
  blockHours: 5, weeklyMode: 'rolling7d', weekStartsOn: 'monday',
  statusBar: {} as never, refreshIntervalMs: 3000, watchFiles: true, claudeDir: '', lookbackDays: 30,
  countInput: true, countOutput: true, countCacheWrites: true, countCacheReads: true,
  includeSubagents: true, projectFilter: 'all',
  cost: { enabled: true, currencySymbol: '$', pricing: {} },
  dashboard: { defaultRange: 'block', showSessions: true, maxSessions: 5, showModels: true,
    showHistory: true, gaugeStyle: 'bar', numberFont: 'editor', accentColor: '#D97757' },
  notifications: { enabled: true, thresholds: [75, 90] }
} as unknown as Config;

const fmt = (n: number) => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : String(n);

(async () => {
  const scanner = new Scanner(path.join(os.homedir(), '.claude', 'projects'));
  await scanner.scan(30);
  console.log(`${scanner.events.length} messages loaded\n`);
  for (const plan of ['auto', 'pro', 'max5', 'max20', 'none']) {
    const snap = buildSnapshot(scanner.events, { ...base, plan } as Config, undefined, undefined);
    const b = snap.block, w = snap.week;
    console.log(
      `plan=${plan.padEnd(6)} block ${b.hasPercent ? (b.estimated ? '~' : '') + b.percent.toFixed(1) + '%' : 'no meter'}`.padEnd(38) +
      `of ${fmt(snap.blockLimit).padStart(7)}   week ${w.hasPercent ? (w.estimated ? '~' : '') + w.percent.toFixed(1) + '%' : 'no meter'}`.padEnd(34) +
      `of ${fmt(snap.weekLimit)}`
    );
  }
  const snap = buildSnapshot(scanner.events, base, undefined, undefined);
  console.log(`\nblock holds ${fmt(snap.block.totals.counted)} counted tokens, week ${fmt(snap.week.totals.counted)}`);
})();
