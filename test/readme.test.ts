// Runs every ```ts block in README.md and docs/**/*.md and checks each `expression // → expected`
// line, so the documentation cannot drift from the code. Import lines are dropped: the names they
// would import come from SCOPE, which includes the libraries the migration guides compare against,
// so side-by-side examples run both libraries for real. Each block runs on its own, so every block
// must be complete. Use ```typescript for code that can't run here (framework glue, for example).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBusinessDays, differenceInBusinessDays, format } from 'date-fns';
import Holidays from 'date-holidays';
import { DateTime } from 'luxon-business-days';
import moment from 'moment-business-days';
import { Temporal } from 'temporal-polyfill/full';
import { afterEach, describe, expect, it } from 'vitest';
import * as lib from '../src/index.js';

const SCOPE: Record<string, unknown> = {
  ...lib,
  Temporal,
  Holidays,
  moment,
  DateTime,
  addBusinessDays,
  differenceInBusinessDays,
  format,
};

const root = fileURLToPath(new URL('..', import.meta.url));
const markdownFiles = (dir: string): string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? entry.name.startsWith('.')
        ? []
        : markdownFiles(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [join(dir, entry.name)]
        : [],
  );
const documents = ['README.md', ...markdownFiles('docs')].map((file) => ({
  file,
  blocks: [...readFileSync(join(root, file), 'utf8').matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] ?? ''),
}));
const CHECK = /^(.*?);?\s*\/\/ → (.*)$/;

function compile(block: string): { code: string; checks: number } {
  let checks = 0;
  const lines = block
    .split('\n')
    .filter((line) => !line.startsWith('import '))
    .map((line) => {
      const m = CHECK.exec(line);
      if (!m) return line;
      checks++;
      return `__check(${m[1] ?? ''}, ${m[2] ?? ''}, ${JSON.stringify(line.trim())});`;
    });
  return { code: lines.join('\n'), checks };
}

afterEach(() => {
  DateTime.local().clearBusinessSetup(); // luxon-business-days configuration is global
});

describe('documentation examples', () => {
  it('finds examples to check', () => {
    expect(documents.find((d) => d.file === 'README.md')?.blocks.length).toBeGreaterThanOrEqual(6);
  });

  for (const { file, blocks } of documents) {
    if (blocks.length === 0) continue;
    const compiled = blocks.map(compile);
    const checks = compiled.reduce((sum, c) => sum + c.checks, 0);
    it(`${file} (${blocks.length} blocks, ${checks} checks)`, () => {
      const check = (actual: unknown, expected: unknown, line: string): void => {
        expect(actual, `${file}: ${line}`).toEqual(expected);
      };
      const names = Object.keys(SCOPE);
      for (const [i, block] of compiled.entries()) {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executing documentation examples is the point
        const run = new Function(...names, '__check', block.code) as (...args: unknown[]) => void;
        try {
          run(...names.map((n) => SCOPE[n]), check);
        } catch (error) {
          throw new Error(`${file}, block ${i + 1}: ${(error as Error).message}`, { cause: error });
        }
      }
    });
  }
});
