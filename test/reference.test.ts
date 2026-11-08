// Compares the fast integer implementation against a slow, obviously-correct
// reference built only from Temporal operations, over many random cases.
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { dayOfWeekFromEpochDay, epochDayFromIso, isoFromEpochDay } from '../src/epoch.js';
import { addWorkdays, eachWorkday, workdaysBetween, type DayOfWeek, type WorkdayOptions } from '../src/index.js';

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const EPOCH = Temporal.PlainDate.from('1970-01-01');

describe('epoch-day math matches Temporal', () => {
  it('round-trips and gives the right day of week from 1600 to 2400', () => {
    let date = Temporal.PlainDate.from('1600-01-01');
    let expected = date.since(EPOCH).days;
    const end = Temporal.PlainDate.from('2400-12-31');
    while (Temporal.PlainDate.compare(date, end) <= 0) {
      const ed = epochDayFromIso(date.year, date.month, date.day);
      expect(ed).toBe(expected);
      expect(isoFromEpochDay(ed)).toEqual([date.year, date.month, date.day]);
      expect(dayOfWeekFromEpochDay(ed)).toBe(date.dayOfWeek);
      date = date.add({ days: 1 });
      expected++;
    }
  });
});

function refIsWorkday(date: Temporal.PlainDate, o: { weekend: number[]; holidays: string[]; extra: string[] }) {
  const s = date.toString();
  if (o.extra.includes(s)) return true;
  if (o.weekend.includes(date.dayOfWeek)) return false;
  return !o.holidays.includes(s);
}

describe('random cases match the reference implementation', () => {
  const rand = rng(42);
  const start = Temporal.PlainDate.from('2020-01-01');
  const randomDate = (span: number) => start.add({ days: Math.floor(rand() * span) });

  for (let i = 0; i < 200; i++) {
    const weekend = ([1, 2, 3, 4, 5, 6, 7] as DayOfWeek[]).filter(() => rand() < 0.3);
    if (weekend.length === 7) weekend.pop();
    const holidays = Array.from({ length: Math.floor(rand() * 30) }, () => randomDate(800).toString());
    const extra = Array.from({ length: Math.floor(rand() * 5) }, () => randomDate(800).toString());
    const ref = { weekend, holidays, extra };
    const opts: WorkdayOptions = { weekend, holidays, extraWorkdays: extra };
    const from = randomDate(700);
    const amount = Math.floor(rand() * 60) - 30;

    it(`case ${i}: ${from} ${amount >= 0 ? '+' : ''}${amount} weekend=[${weekend}]`, () => {
      // addWorkdays
      let expected = from;
      for (let left = Math.abs(amount); left > 0; ) {
        expected = expected.add({ days: Math.sign(amount) });
        if (refIsWorkday(expected, ref)) left--;
      }
      const actual = addWorkdays(from, amount, opts);
      expect(actual.toString()).toBe(expected.toString());

      // workdaysBetween over (from, actual]
      const [lo, hi, sign] = Temporal.PlainDate.compare(from, actual) <= 0 ? [from, actual, 1] : [actual, from, -1];
      let count = 0;
      for (let x = lo.add({ days: 1 }); Temporal.PlainDate.compare(x, hi) <= 0; x = x.add({ days: 1 })) {
        if (refIsWorkday(x, ref)) count++;
      }
      expect(workdaysBetween(from, actual, opts)).toBe(sign * count);
      if (amount >= 0) expect(workdaysBetween(from, actual, opts)).toBe(amount);

      // eachWorkday over [lo, hi]
      const each = [...eachWorkday(lo, hi, opts)].map(String);
      const refEach: string[] = [];
      for (let x = lo; Temporal.PlainDate.compare(x, hi) <= 0; x = x.add({ days: 1 })) {
        if (refIsWorkday(x, ref)) refEach.push(x.toString());
      }
      expect(each).toEqual(refEach);
    });
  }
});
