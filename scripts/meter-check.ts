import { meter, formatPercent, formatDuration } from '../src/statusbar';

const cases: [number, number][] = [[8, 17520000], [62, 6420000], [94, 1080000], [112, 1080000], [0, 18000000]];
for (const style of ['ticks', 'halfblocks', 'blocks', 'braille', 'ascii']) {
  console.log(`\n${style}`);
  for (const [p, ms] of cases) {
    const line = `${meter(p, 10, style, [])} ${formatPercent(p)} · ${formatDuration(ms)}`;
    console.log(`  "${line}"  len=${[...line].length}`);
  }
}
console.log('\ncreep check (halfblocks 60 -> 63%):');
for (const p of [60, 60.6, 61.2, 61.9, 62.5, 63]) {
  console.log(`  ${p.toFixed(1).padStart(4)}% ${meter(p, 10, 'halfblocks', [])}`);
}
