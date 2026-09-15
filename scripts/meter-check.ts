import { meter } from '../src/statusbar';
for (const s of ['ticks', 'bars', 'circles', 'halfblocks', 'blocks']) {
  console.log(`  ${s.padEnd(11)} ${meter(62, 10, s, [])}   ${meter(8, 10, s, [])}`);
}
