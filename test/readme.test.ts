// Runs every ```ts block in README.md and checks each `expression; // → expected` line,
// so the documentation cannot drift from the code.
import { readFileSync } from 'node:fs';
import Holidays from 'date-holidays';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import * as lib from '../src/index.js';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const blocks = [...readme.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
const CHECK = /^(.*?);\s*\/\/ → (.*)$/;

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

describe('README examples', () => {
  it('has examples to check', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(6);
  });

  blocks.forEach((block, i) => {
    const { code, checks } = compile(block);
    it(`block ${i + 1} (${checks} checks)`, () => {
      const check = (actual: unknown, expected: unknown, line: string): void => {
        expect(actual, line).toEqual(expected);
      };
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executing documentation examples is the point
      const run = new Function(
        'lib',
        'Holidays',
        'Temporal',
        '__check',
        `const {${Object.keys(lib).join(',')}} = lib;\n${code}`,
      ) as (
        library: typeof lib,
        holidays: typeof Holidays,
        temporal: typeof Temporal,
        assert: (actual: unknown, expected: unknown, line: string) => void,
      ) => void;
      run(lib, Holidays, Temporal, check);
    });
  });
});
