// fast-check generators shared by the property tests.
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import type { DayOfWeek, WorkdayOptions } from '../src/index.js';

export const BASE = Temporal.PlainDate.from('2020-01-01');
/** Dates spread over ~3 years so holidays generated in the same span actually hit. */
export const SPAN_DAYS = 1100;

export const plainDate = fc.integer({ min: 0, max: SPAN_DAYS }).map((n) => BASE.add({ days: n }));

/** Any weekend except "every day", which has no workdays at all. */
export const weekend = fc
  .subarray<DayOfWeek>([1, 2, 3, 4, 5, 6, 7])
  .filter((days) => days.length < 7)
  .map((days) => days);

export const dateString = plainDate.map((d) => d.toString());

export interface Config {
  weekend: DayOfWeek[];
  holidays: string[];
  extraWorkdays: string[];
}

export const config: fc.Arbitrary<Config> = fc.record({
  weekend,
  holidays: fc.array(dateString, { maxLength: 60 }),
  extraWorkdays: fc.array(dateString, { maxLength: 6 }),
});

export function toOptions(c: Config): WorkdayOptions {
  return { weekend: c.weekend, holidays: c.holidays, extraWorkdays: c.extraWorkdays };
}

/** Obviously-correct reference built only from Temporal operations. */
export function referenceIsWorkday(date: Temporal.PlainDate, c: Config): boolean {
  const s = date.toString();
  if (c.extraWorkdays.includes(s)) return true;
  if ((c.weekend as number[]).includes(date.dayOfWeek)) return false;
  return !c.holidays.includes(s);
}

/** Property-test run counts, scaled by FC_SCALE for occasional deep runs (FC_SCALE=20 npm test). */
export function runs(base: number): { numRuns: number } {
  const scale = Number(process.env['FC_SCALE'] ?? 1);
  return { numRuns: Math.max(1, Math.round(base * (Number.isFinite(scale) && scale > 0 ? scale : 1))) };
}
