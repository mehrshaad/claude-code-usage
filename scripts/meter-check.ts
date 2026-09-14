import { meter, formatPercent, formatDuration } from '../src/statusbar';

const cases: [number, number][] = [[8, 17520000], [62, 6420000], [94, 1080000], [112, 1080000], [0, 18000000]];
for (const style of ['circles', 'circleHalves', 'ticks', 'halfblocks']) {
  console.log(`\n${style}`);
  for (const [p, ms] of cases) {
    const line = `${meter(p, 10, style, [])} ${formatPercent(p)} · ${formatDuration(ms)}`;
    console.log(`  "${line}"  len=${[...line].length}`);
  }
}
console.log('\n5-segment circles at 62%: ' + meter(62, 5, 'circles', []));
