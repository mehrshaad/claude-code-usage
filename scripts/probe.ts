import * as os from 'os';
import * as path from 'path';
import { Scanner } from '../src/scanner';
import { buildSnapshot } from '../src/aggregate';
import type { Config } from '../src/config';

const cfg = {
  plan: 'max20', blockTokenLimit: 0, weeklyTokenLimit: 0, autoCalibrate: true,
  blockHours: 5, weeklyMode: 'rolling7d', weekStartsOn: 'monday',
  statusBar: {} as never,
  refreshIntervalMs: 3000, watchFiles: true, claudeDir: '', lookbackDays: 30,
  countInput: true, countOutput: true, countCacheWrites: true, countCacheReads: true,
  includeSubagents: true, projectFilter: 'all',
  cost: { enabled: true, currencySymbol: '$', pricing: {} },
  dashboard: { defaultRange: 'block', showSessions: true, maxSessions: 8, showModels: true, showHistory: true, accentColor: '#D97757' },
  notifications: { enabled: true, thresholds: [75, 90] }
} as unknown as Config;

const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;

(async () => {
  const dir = path.join(os.homedir(), '.claude', 'projects');
  const scanner = new Scanner(dir);
  const t0 = Date.now();
  await scanner.scan(cfg.lookbackDays);
  const cold = Date.now() - t0;
  const t1 = Date.now();
  await scanner.scan(cfg.lookbackDays);
  const warm = Date.now() - t1;

  const { snapshot } = buildSnapshot(scanner.events, cfg, undefined, { block: 0, week: 0 });
  console.log(`scan cold=${cold}ms warm=${warm}ms files=${scanner.scannedFiles} events=${scanner.events.length}`);
  console.log(`block  ${new Date(snapshot.block.start).toLocaleTimeString()} -> ${new Date(snapshot.block.end).toLocaleTimeString()}  ${fmt(snapshot.block.totals.counted)} tok  $${snapshot.block.totals.cost.toFixed(2)}  ${snapshot.block.percent.toFixed(1)}%  msgs=${snapshot.block.totals.messages}`);
  console.log(`week   ${fmt(snapshot.week.totals.counted)} tok  $${snapshot.week.totals.cost.toFixed(2)}  ${snapshot.week.percent.toFixed(1)}%`);
  console.log(`today  ${fmt(snapshot.today.counted)} tok  $${snapshot.today.cost.toFixed(2)}  msgs=${snapshot.today.messages}`);
  console.log(`burn   ${fmt(snapshot.burnPerMin)} tok/min`);
  console.log('models:');
  for (const m of snapshot.models) { console.log(`  ${m.model.padEnd(20)} ${fmt(m.totals.counted).padStart(8)}  $${m.totals.cost.toFixed(2)}  msgs=${m.totals.messages}`); }
  console.log('sessions:');
  for (const s of snapshot.sessions.slice(0, 5)) { console.log(`  ${s.active ? '*' : ' '} ${s.project.padEnd(22)} ${fmt(s.totals.counted).padStart(8)}  $${s.totals.cost.toFixed(2)}`); }
  const last7 = snapshot.history.slice(-7);
  console.log('last 7 days:');
  for (const d of last7) { console.log(`  ${d.date}  ${fmt(d.counted).padStart(8)}  $${d.cost.toFixed(2)}`); }
})();
