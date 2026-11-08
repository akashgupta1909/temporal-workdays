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

const MS_PER_DAY = 86_400_000;
const EPOCH = Temporal.PlainDate.from('1970-01-01');

describe('epoch-day math', () => {
  // Every day from 1600 to 2400 (~292k days) against the native Date implementation,
  // an independent oracle that is fast enough to check exhaustively. Mismatches are
  // collected rather than asserted one by one, so the loop stays cheap.
  it('matches Date.UTC for every day from 1600 to 2400', () => {
    const first = Date.UTC(1600, 0, 1) / MS_PER_DAY;
    const last = Date.UTC(2400, 11, 31) / MS_PER_DAY;
    const mismatches: string[] = [];
    for (let day = first; day <= last; day++) {
      const d = new Date(day * MS_PER_DAY);
      const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      const [ry, rm, rd] = isoFromEpochDay(day);
      if (epochDayFromIso(y, m, dd) !== day || ry !== y || rm !== m || rd !== dd || dayOfWeekFromEpochDay(day) !== isoDow) {
        mismatches.push(`${y}-${m}-${dd} (epoch day ${day})`);
        if (mismatches.length >= 10) break;
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('matches Temporal on boundary and random dates', () => {
    const rand = rng(7);
    const samples = [
      '0001-01-01', '1582-10-15', '1600-02-29', '1700-02-28', '1900-03-01', '1969-12-31',
      '1970-01-01', '2000-02-29', '2100-02-28', '2400-02-29', '9999-12-31', '-000001-12-31',
    ].map((s) => Temporal.PlainDate.from(s));
    for (let i = 0; i < 500; i++) samples.push(EPOCH.add({ days: Math.floor(rand() * 2_000_000) - 1_000_000 }));
    for (const date of samples) {
      const ed = epochDayFromIso(date.year, date.month, date.day);
      expect(ed, date.toString()).toBe(date.since(EPOCH).days);
      expect(isoFromEpochDay(ed), date.toString()).toEqual([date.year, date.month, date.day]);
      expect(dayOfWeekFromEpochDay(ed), date.toString()).toBe(date.dayOfWeek);
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
