import { StatusBar } from '../src/statusbar';
import type { Config } from '../src/config';
import type { Snapshot, Totals } from '../src/types';
const vscode = require('vscode');

const totals = (n: number): Totals => ({
  input: 1, output: 1, cacheWrite5m: 1, cacheWrite1h: 0, cacheRead: n,
  counted: n, raw: n, cost: 12.5, messages: 7
});

function snapshot(hasPercent: boolean): Snapshot {
  const win = (p: number) => ({
    start: Date.now() - 6e5, end: Date.now() + 7.2e6, totals: totals(121e6),
    limit: 0, percent: hasPercent ? p : 0, hasPercent, remainingMs: 7.2e6
  });
  return {
    block: win(62.4), week: win(28), today: totals(121e6),
    session: { sessionId: 'a', project: 'proj', lastTs: Date.now(), active: true, totals: totals(136e6) },
    models: [], sessions: [], history: [], burnPerMin: 1.8e6, burnSeries: new Array(24).fill(1),
    projectedExhaustionMs: undefined, scannedFiles: 3, eventCount: 22738, lastUpdate: Date.now(),
    costEnabled: true, source: hasPercent ? 'account' : 'transcripts', opusWeek: undefined, sonnetWeek: undefined
  } as Snapshot;
}

const base = {
  statusBar: { enabled: true, alignment: 'right', priority: 100, metric: 'block', showMeter: true,
    meterWidth: 10, meterStyle: 'halfblocks', showPercent: true, showReset: true, showTokens: false,
    showCost: false, showIcon: true, useColors: true, warnThreshold: 60, dangerThreshold: 85,
    clickAction: 'openDashboard' },
  cost: { enabled: true, currencySymbol: '$', pricing: {} },
  weeklyMode: 'rolling7d'
} as unknown as Config;

const cfg = (metric: string): Config =>
  ({ ...base, statusBar: { ...base.statusBar, metric } }) as Config;

let failures = 0;
for (const hasPercent of [true, false]) {
  console.log(`\naccount connected: ${hasPercent}`);
  for (const metric of ['block', 'week', 'today', 'session']) {
    const bar = new StatusBar(cfg(metric));
    bar.update(snapshot(hasPercent));
    const text = vscode.__item.text;
    const empty = !text || !text.trim();
    if (empty) { failures++; }
    console.log(`  ${empty ? 'FAIL' : ' ok '}  ${metric.padEnd(8)} "${text}"`);
    bar.dispose();
  }
}

// The reported sequence: change the metric via settings after a cycle.
console.log('\ncycle then change the setting:');
const bar = new StatusBar(cfg('block'));
bar.update(snapshot(false));
console.log(`  after cycle x1      "${(bar.cycle(), vscode.__item.text)}"`);
bar.updateConfig(cfg('today'));
console.log(`  after set = today   "${vscode.__item.text}"`);
bar.updateConfig(cfg('block'));
console.log(`  after set = block   "${vscode.__item.text}"`);
if (!vscode.__item.text.trim()) { failures++; }

console.log(`\n${failures ? failures + ' FAILURES' : 'all metrics render non-empty text'}`);
