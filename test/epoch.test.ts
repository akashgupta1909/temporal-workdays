import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { dayOfWeekFromEpochDay, daysInMonth, epochDayFromIso, isLeapYear, isoFromEpochDay } from '../src/epoch.js';

const MS_PER_DAY = 86_400_000;
const EPOCH = Temporal.PlainDate.from('1970-01-01');

describe('epoch-day math', () => {
  // Every day from 1600 to 2400 (~292k days) against the native Date implementation, an
  // independent oracle fast enough to check exhaustively. Mismatches are collected rather
  // than asserted one by one, so the loop stays cheap.
  it('matches Date.UTC for every day from 1600 to 2400', () => {
    const first = Date.UTC(1600, 0, 1) / MS_PER_DAY;
    const last = Date.UTC(2400, 11, 31) / MS_PER_DAY;
    const mismatches: string[] = [];
    for (let day = first; day <= last && mismatches.length < 10; day++) {
      const d = new Date(day * MS_PER_DAY);
      const [y, m, dd] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
      const isoDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      const [ry, rm, rd] = isoFromEpochDay(day);
      const ok =
        epochDayFromIso(y, m, dd) === day && ry === y && rm === m && rd === dd && dayOfWeekFromEpochDay(day) === isoDow;
      if (!ok) mismatches.push(`${y}-${m}-${dd} (epoch day ${day})`);
    }
    expect(mismatches).toEqual([]);
  });

  it('matches Temporal on boundary dates', () => {
    const boundaries = [
      '-271821-04-19',
      '-000001-12-31',
      '0000-03-01',
      '0001-01-01',
      '1582-10-15',
      '1900-03-01',
      '1969-12-31',
      '1970-01-01',
      '2000-02-29',
      '2100-02-28',
      '9999-12-31',
      '+275760-09-13',
    ];
    for (const s of boundaries) {
      const date = Temporal.PlainDate.from(s);
      const ed = epochDayFromIso(date.year, date.month, date.day);
      expect(ed, s).toBe(date.since(EPOCH).days);
      expect(isoFromEpochDay(ed), s).toEqual([date.year, date.month, date.day]);
      expect(dayOfWeekFromEpochDay(ed), s).toBe(date.dayOfWeek);
    }
  });

  it('round-trips across the whole Temporal date range', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000_000, max: 100_000_000 }), (day) => {
        const [y, m, d] = isoFromEpochDay(day);
        expect(epochDayFromIso(y, m, d)).toBe(day);
        expect(d).toBeLessThanOrEqual(daysInMonth(y, m));
        const date = EPOCH.add({ days: day });
        expect([date.year, date.month, date.day]).toEqual([y, m, d]);
        expect(dayOfWeekFromEpochDay(day)).toBe(date.dayOfWeek);
      }),
      { numRuns: 2000 },
    );
  });

  it('knows leap years', () => {
    expect([1600, 2000, 2024, 2400].every(isLeapYear)).toBe(true);
    expect([1700, 1900, 2023, 2100].some(isLeapYear)).toBe(false);
  });
});
