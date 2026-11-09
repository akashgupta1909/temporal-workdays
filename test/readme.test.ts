// Runs every ```ts block in README.md and checks each `expression; // → expected` line,
// so the documentation cannot drift from the code. Import lines are dropped; the names
// they would import are provided by SCOPE, including the libraries the migration guides
// compare against, so side-by-side examples run both libraries for real.
import { readFileSync } from 'node:fs';
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

afterEach(() => {
  DateTime.local().clearBusinessSetup(); // luxon-business-days configuration is global
});

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
      const names = Object.keys(SCOPE);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- executing documentation examples is the point
      const run = new Function(...names, '__check', code) as (...args: unknown[]) => void;
      run(...names.map((n) => SCOPE[n]), check);
    });
  });
});
