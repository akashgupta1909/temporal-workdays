// A deliberately naive model of working time at minute resolution: walk minute by minute
// and count the ones inside working periods. Slow but obviously correct; the property
// tests check the real implementation (nanosecond precision, interval arithmetic) against it.
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import type { DayOfWeek, WorkingTimeOptions } from '../src/index.js';
import { BASE, referenceIsWorkday, type Config, config } from './arbitraries.js';

export const MINUTES_PER_DAY = 1440;
type Range = readonly [number, number]; // minutes of day, [start, end)

export interface HoursConfig extends Config {
  weekly: Record<DayOfWeek, Range[]>;
  special: Record<string, Range[]>;
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Sorted, disjoint, non-touching ranges from random cut points. */
const dayRanges: fc.Arbitrary<Range[]> = fc
  .uniqueArray(fc.integer({ min: 0, max: MINUTES_PER_DAY }), { maxLength: 6 })
  .map((cuts) => {
    const sorted = [...cuts].sort((a, b) => a - b);
    const ranges: Range[] = [];
    for (let i = 0; i + 1 < sorted.length; i += 2) ranges.push([sorted[i]!, sorted[i + 1]!]);
    return ranges;
  });

export const hoursConfig: fc.Arbitrary<HoursConfig> = fc
  .record({
    base: config,
    weekly: fc.tuple(dayRanges, dayRanges, dayRanges, dayRanges, dayRanges, dayRanges, dayRanges),
    special: fc.dictionary(
      fc.integer({ min: 0, max: 120 }).map((n) => BASE.add({ days: n }).toString()),
      dayRanges,
      { maxKeys: 4 },
    ),
  })
  .map(({ base, weekly, special }) => ({
    ...base,
    weekly: { 1: weekly[0], 2: weekly[1], 3: weekly[2], 4: weekly[3], 5: weekly[4], 6: weekly[5], 7: weekly[6] },
    special,
  }))
  // Need some working time every week, or searches would (correctly) give up after 20 years.
  .filter((c) => ([1, 2, 3, 4, 5, 6, 7] as const).some((d) => !c.weekend.includes(d) && c.weekly[d].length > 0));

export function toHoursOptions(c: HoursConfig): WorkingTimeOptions {
  const toText = (ranges: Range[]) => ranges.map(([s, e]) => [fmt(s), fmt(e)] as const);
  return {
    weekend: c.weekend,
    holidays: c.holidays,
    extraWorkdays: c.extraWorkdays,
    hours: Object.fromEntries(Object.entries(c.weekly).map(([d, r]) => [d, toText(r)])),
    specialHours: Object.fromEntries(Object.entries(c.special).map(([d, r]) => [d, toText(r)])),
  };
}

/** Minutes since BASE (2020-01-01T00:00). */
export const minuteArb = (days: number) => fc.integer({ min: 0, max: days * MINUTES_PER_DAY });
export const toDateTime = (m: number) => Temporal.PlainDateTime.from('2020-01-01T00:00').add({ minutes: m });
export const toMinute = (dt: Temporal.PlainDateTime) =>
  Temporal.PlainDateTime.from('2020-01-01T00:00').until(dt, { largestUnit: 'minutes' }).minutes;

export class ReferenceModel {
  readonly #cache = new Map<number, Range[]>();
  constructor(readonly c: HoursConfig) {}

  rangesOnDay(day: number): Range[] {
    let ranges = this.#cache.get(day);
    if (!ranges) {
      const date = BASE.add({ days: day });
      ranges =
        this.c.special[date.toString()] ??
        (referenceIsWorkday(date, this.c) ? this.c.weekly[date.dayOfWeek as DayOfWeek] : []);
      this.#cache.set(day, ranges);
    }
    return ranges;
  }

  isWorking(minute: number): boolean {
    const day = Math.floor(minute / MINUTES_PER_DAY);
    const mod = minute - day * MINUTES_PER_DAY;
    return this.rangesOnDay(day).some(([s, e]) => mod >= s && mod < e);
  }

  add(start: number, n: number): number {
    let m = start;
    if (n > 0) {
      for (let left = n; ; m++) if (this.isWorking(m) && --left === 0) return m + 1;
    }
    for (let left = -n; left > 0;) if (this.isWorking(--m)) left--;
    return m;
  }

  between(a: number, b: number): number {
    if (b < a) return 0 - this.between(b, a); // 0 - x, not -x: avoids -0
    let count = 0;
    for (let m = a; m < b; m++) if (this.isWorking(m)) count++;
    return count;
  }

  rollForward(m: number): number {
    let x = m;
    while (!this.isWorking(x)) x++;
    return x;
  }

  rollBackward(m: number): number {
    if (this.isWorking(m)) return m;
    let x = m - 1;
    while (!this.isWorking(x)) x--;
    return x + 1;
  }
}
