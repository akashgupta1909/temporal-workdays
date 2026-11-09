// The README's date-fns section, checked against the real date-fns.
import { addBusinessDays, differenceInBusinessDays, isWeekend as dfnsIsWeekend } from 'date-fns';
import fc from 'fast-check';
import type { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { addWorkdays, isWeekend, workdaysBetween } from '../src/index.js';
import { plainDate, runs } from './arbitraries.js';

const toDate = (d: Temporal.PlainDate) => new Date(d.year, d.month - 1, d.day);
const iso = (d: Date) =>
  `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('migration from date-fns', () => {
  it('addBusinessDays(date, n) → addWorkdays(d, n)', () => {
    fc.assert(
      fc.property(plainDate, fc.integer({ min: -60, max: 60 }), (d, n) => {
        expect(addWorkdays(d, n).toString()).toBe(iso(addBusinessDays(toDate(d), n)));
      }),
      runs(500),
    );
  });

  it('isWeekend(date) → isWeekend(d)', () => {
    fc.assert(
      fc.property(plainDate, (d) => {
        expect(isWeekend(d)).toBe(dfnsIsWeekend(toDate(d)));
      }),
      runs(200),
    );
  });

  it('differenceInBusinessDays(later, earlier): exact translation, and the simple one when both ends are workdays', () => {
    fc.assert(
      fc.property(plainDate, plainDate, (earlier, later) => {
        const theirs = differenceInBusinessDays(toDate(later), toDate(earlier));
        // date-fns counts [earlier, later) going forward but (later, earlier] going backward.
        const exact =
          later.toString() >= earlier.toString()
            ? workdaysBetween(earlier.subtract({ days: 1 }), later.subtract({ days: 1 }))
            : workdaysBetween(earlier, later);
        expect(exact).toBe(theirs);
        if (!isWeekend(earlier) && !isWeekend(later)) expect(workdaysBetween(earlier, later)).toBe(theirs);
      }),
      runs(500),
    );
  });
});
