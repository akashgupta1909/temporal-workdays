// Algebraic properties of the day-level API, checked against a slow reference.
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  createWorkCalendar,
  eachWorkday,
  isHoliday,
  isWeekend,
  isWorkday,
  nextWorkday,
  previousWorkday,
  rollBackward,
  rollForward,
  subtractWorkdays,
  workdayOfMonth,
  workdaysBetween,
  workdaysByWeek,
  workdaysInMonth,
} from '../src/index.js';
import { config, plainDate, referenceIsWorkday, toOptions } from './arbitraries.js';

const amount = fc.integer({ min: -40, max: 40 });
const cmp = (a: Temporal.PlainDate, b: Temporal.PlainDate) => Temporal.PlainDate.compare(a, b);

describe('properties', () => {
  it('isWorkday agrees with the reference', () => {
    fc.assert(
      fc.property(config, plainDate, (c, d) => {
        expect(isWorkday(d, toOptions(c))).toBe(referenceIsWorkday(d, c));
      }),
    );
  });

  it('addWorkdays steps exactly |n| reference workdays', () => {
    fc.assert(
      fc.property(config, plainDate, amount, (c, d, n) => {
        let expected = d;
        for (let left = Math.abs(n); left > 0;) {
          expected = expected.add({ days: Math.sign(n) });
          if (referenceIsWorkday(expected, c)) left--;
        }
        expect(addWorkdays(d, n, toOptions(c)).toString()).toBe(expected.toString());
      }),
    );
  });

  it('workdaysBetween inverts addWorkdays for n >= 0', () => {
    fc.assert(
      fc.property(config, plainDate, fc.nat({ max: 40 }), (c, d, n) => {
        const o = toOptions(c);
        expect(workdaysBetween(d, addWorkdays(d, n, o), o)).toBe(n);
      }),
    );
  });

  it('workdaysBetween is antisymmetric and additive', () => {
    fc.assert(
      fc.property(config, plainDate, plainDate, plainDate, (c, a, b, x) => {
        const o = toOptions(c);
        expect(workdaysBetween(a, b, o) + workdaysBetween(b, a, o)).toBe(0);
        expect(workdaysBetween(a, b, o) + workdaysBetween(b, x, o)).toBe(workdaysBetween(a, x, o));
      }),
    );
  });

  it('eachWorkday lists exactly the workdays in [start, end]', () => {
    fc.assert(
      fc.property(config, plainDate, fc.nat({ max: 60 }), (c, start, len) => {
        const o = toOptions(c);
        const end = start.add({ days: len });
        const listed = [...eachWorkday(start, end, o)].map(String);
        const expected: string[] = [];
        for (let x = start; cmp(x, end) <= 0; x = x.add({ days: 1 })) {
          if (referenceIsWorkday(x, c)) expected.push(x.toString());
        }
        expect(listed).toEqual(expected);
        expect(listed.length).toBe(workdaysBetween(start, end, o) + (isWorkday(start, o) ? 1 : 0));
      }),
    );
  });

  it('next/previous/roll land on the nearest workday', () => {
    fc.assert(
      fc.property(config, plainDate, (c, d) => {
        const o = toOptions(c);
        const next = nextWorkday(d, o);
        const prev = previousWorkday(d, o);
        expect(isWorkday(next, o) && isWorkday(prev, o)).toBe(true);
        expect(cmp(prev, d) < 0 && cmp(next, d) > 0).toBe(true);
        expect(workdaysBetween(d, next, o)).toBe(1);
        expect(workdaysBetween(prev, d, o)).toBe(isWorkday(d, o) ? 1 : 0);
        expect(rollForward(d, o).toString()).toBe(isWorkday(d, o) ? d.toString() : next.toString());
        expect(rollBackward(d, o).toString()).toBe(isWorkday(d, o) ? d.toString() : prev.toString());
      }),
    );
  });

  it('a calendar gives the same answers as the standalone functions', () => {
    fc.assert(
      fc.property(config, plainDate, plainDate, amount, (c, a, b, n) => {
        const o = toOptions(c);
        const cal = createWorkCalendar(o);
        const str = (x: { toString(): string }) => x.toString();
        expect(cal.isWorkday(a)).toBe(isWorkday(a, o));
        expect(cal.isWeekend(a)).toBe(isWeekend(a, o));
        expect(cal.isHoliday(a)).toBe(isHoliday(a, o));
        expect(str(cal.addWorkdays(a, n))).toBe(str(addWorkdays(a, n, o)));
        expect(str(cal.subtractWorkdays(a, n))).toBe(str(subtractWorkdays(a, n, o)));
        expect(str(cal.nextWorkday(a))).toBe(str(nextWorkday(a, o)));
        expect(str(cal.previousWorkday(a))).toBe(str(previousWorkday(a, o)));
        expect(str(cal.rollForward(a))).toBe(str(rollForward(a, o)));
        expect(str(cal.rollBackward(a))).toBe(str(rollBackward(a, o)));
        expect(cal.workdaysBetween(a, b)).toBe(workdaysBetween(a, b, o));
        expect([...cal.eachWorkday(a, b)].map(str)).toEqual([...eachWorkday(a, b, o)].map(str));
      }),
    );
  });

  it('workdaysInMonth and workdayOfMonth agree with the reference', () => {
    fc.assert(
      fc.property(config, plainDate, (c, d) => {
        const o = toOptions(c);
        const expected: string[] = [];
        for (let x = d.with({ day: 1 }); x.month === d.month; x = x.add({ days: 1 })) {
          if (referenceIsWorkday(x, c)) expected.push(x.toString());
        }
        expect(workdaysInMonth(d, o).map(String)).toEqual(expected);
        expect(workdayOfMonth(d, o)).toBe(expected.filter((x) => x <= d.toString()).length);
      }),
    );
  });

  it('workdaysByWeek groups workdays by the week that starts after the weekend', () => {
    fc.assert(
      fc.property(config, plainDate, fc.nat({ max: 60 }), (c, start, len) => {
        const o = toOptions(c);
        const end = start.add({ days: len });
        // Reference: the first day d whose previous day is a weekend day and d is not; else Monday.
        const weekend = c.weekend as number[];
        const weekStart =
          [1, 2, 3, 4, 5, 6, 7].find((d) => weekend.includes(d === 1 ? 7 : d - 1) && !weekend.includes(d)) ?? 1;
        const groups = new Map<string, string[]>();
        for (const day of eachWorkday(start, end, o)) {
          const key = day.subtract({ days: (day.dayOfWeek - weekStart + 7) % 7 }).toString();
          groups.set(key, [...(groups.get(key) ?? []), day.toString()]);
        }
        expect(workdaysByWeek(start, end, o).map((w) => w.map(String))).toEqual([...groups.values()]);
      }),
    );
  });
});
