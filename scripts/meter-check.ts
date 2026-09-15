import { meter } from '../src/statusbar';
const rows: [string, string][] = [];
for (const style of ['ticks', 'circles', 'halfblocks', 'blocks', 'braille', 'ascii']) {
  rows.push([style, meter(62, 10, style, [])]);
}
for (const [s, g] of rows) { console.log(`  ${s.padEnd(11)} ${g}`); }
