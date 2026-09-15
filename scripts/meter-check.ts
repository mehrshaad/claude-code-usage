import { meter, formatPercent, formatDuration } from '../src/statusbar';

for (const style of ['circles', 'halfblocks', 'blocks', 'ticks']) {
  console.log(`\n${style}`);
  for (const p of [0, 8, 15, 50, 62, 94, 112]) {
    console.log(`  ${String(p).padStart(3)}%  "${meter(p, 10, style, [])} ${formatPercent(p, true)} · ${formatDuration(3660000)}"`);
  }
}
console.log('\nlegacy value circleHalves still resolves: ' + meter(62, 10, 'circleHalves', []));
