import { formatDuration } from '../src/statusbar';
for (const m of [0, 7, 35, 59, 60, 95, 300]) {
  console.log(`  ${String(m).padStart(3)} min -> "${formatDuration(m * 60000)}"`);
}
