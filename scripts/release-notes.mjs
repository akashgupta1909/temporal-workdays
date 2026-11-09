// Prints the CHANGELOG.md section for a version: `node scripts/release-notes.mjs v0.4.0`.
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex((line) => line.startsWith(`## ${version}`));
if (!version || start === -1) {
  console.error(`No "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
console.log(
  lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join('\n')
    .trim(),
);
