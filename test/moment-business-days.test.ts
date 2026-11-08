// The README's migration table, checked against the real moment-business-days over random
// working weeks and holiday lists. Each test is one row of the table: if a documented
// translation ever disagrees with moment-business-days, this fails.
import fc from 'fast-check';
import type { Moment as MomentValue } from 'moment';
import moment from 'moment-business-days';
import type { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  isHoliday,
  isWorkday,
  nextWorkday,
  previousWorkday,
  subtractWorkdays,
  workdayOfMonth,
  workdaysBetween,
  workdaysByWeek,
  workdaysInMonth,
  type WorkdayOptions,
} from '../src/index.js';
import { dateString, plainDate, runs } from './arbitraries.js';

const FORMAT = 'YYYY-MM-DD';

/** A moment-business-days locale configuration, and the same thing as temporal-workdays options. */
const scenario = fc
  .record({
    // moment numbers days 0 (Sunday) … 6 (Saturday).
    workingWeekdays: fc.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1 }),
    holidays: fc.array(dateString, { maxLength: 40 }),
  })
  .map(({ workingWeekdays, holidays }) => {
    // The translation shown in the README.
    const working = workingWeekdays.map((day) => (day === 0 ? 7 : day));
    const weekend = ([1, 2, 3, 4, 5, 6, 7] as const).filter((day) => !working.includes(day));
    const options: WorkdayOptions = { weekend, holidays };
    return { workingWeekdays, holidays, options };
  });

function configureMoment(s: { workingWeekdays: number[]; holidays: string[] }): void {
  moment.updateLocale('en', {
    workingWeekdays: s.workingWeekdays,
    holidays: s.holidays,
    holidayFormat: FORMAT,
    // Its default search limit of 7 days silently returns a non-business day; we have none.
    nextBusinessDayLimit: 1000,
    prevBusinessDayLimit: 1000,
  });
}

const m = (date: Temporal.PlainDate) => moment(date.toString(), FORMAT);
const iso = (x: moment.Moment) => x.format(FORMAT);
// moment-business-days' typings omit businessDiff's `relative` argument, which its code supports.
declare module 'moment' {
  interface Moment {
    businessDiff(other: MomentValue, relative?: boolean): number;
  }
}

describe('migration from moment-business-days', () => {
  it('isBusinessDay() → isWorkday(d), isHoliday() → isHoliday(d)', () => {
    fc.assert(
      fc.property(scenario, plainDate, (s, d) => {
        configureMoment(s);
        expect(isWorkday(d, s.options)).toBe(m(d).isBusinessDay());
        expect(isHoliday(d, s.options)).toBe(m(d).isHoliday());
      }),
      runs(200),
    );
  });

  it('businessAdd(n) / businessSubtract(n) → addWorkdays / subtractWorkdays', () => {
    fc.assert(
      fc.property(scenario, plainDate, fc.integer({ min: -30, max: 30 }), (s, d, n) => {
        configureMoment(s);
        expect(addWorkdays(d, n, s.options).toString()).toBe(iso(m(d).businessAdd(n)));
        expect(subtractWorkdays(d, n, s.options).toString()).toBe(iso(m(d).businessSubtract(n)));
      }),
      runs(200),
    );
  });

  it('nextBusinessDay() / prevBusinessDay() → nextWorkday / previousWorkday', () => {
    fc.assert(
      fc.property(scenario, plainDate, (s, d) => {
        configureMoment(s);
        expect(nextWorkday(d, s.options).toString()).toBe(iso(m(d).nextBusinessDay()));
        expect(previousWorkday(d, s.options).toString()).toBe(iso(m(d).prevBusinessDay()));
      }),
      runs(200),
    );
  });

  it('a.businessDiff(b, true) → workdaysBetween(b.subtract(1 day), a.subtract(1 day))', () => {
    fc.assert(
      fc.property(scenario, plainDate, plainDate, (s, a, b) => {
        configureMoment(s);
        const before = (x: Temporal.PlainDate) => x.subtract({ days: 1 });
        const exact = workdaysBetween(before(b), before(a), s.options);
        // `+ 0` turns moment's -0 (it negates an empty count) into 0; temporal-workdays never returns -0.
        expect(exact).toBe(m(a).businessDiff(m(b), true) + 0);
        expect(Math.abs(exact)).toBe(m(a).businessDiff(m(b)));
        // The simple translation, workdaysBetween(b, a), agrees whenever both ends are workdays.
        if (isWorkday(a, s.options) && isWorkday(b, s.options)) {
          expect(workdaysBetween(b, a, s.options)).toBe(exact);
        }
      }),
      runs(200),
    );
  });

  it('monthBusinessDays() → workdaysInMonth(d)', () => {
    fc.assert(
      fc.property(scenario, plainDate, (s, d) => {
        configureMoment(s);
        expect(workdaysInMonth(d, s.options).map(String)).toEqual(m(d).monthBusinessDays().map(iso));
      }),
      runs(100),
    );
  });

  it('businessDaysIntoMonth() → workdayOfMonth(d), except before the month’s first workday', () => {
    fc.assert(
      fc.property(scenario, plainDate, (s, d) => {
        configureMoment(s);
        const ours = workdayOfMonth(d, s.options);
        // moment falls back to the previous business day, which may be in the previous month.
        if (ours > 0) expect(ours).toBe(m(d).businessDaysIntoMonth());
      }),
      runs(200),
    );
  });

  it('monthBusinessWeeks() / businessWeeksBetween(e) → workdaysByWeek (Mon–Fri, no holidays)', () => {
    // moment's week functions ignore holidays and workingWeekdays and add an empty trailing
    // week when a month ends on a weekend, so only the plain Monday–Friday case is comparable.
    const plain = { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] };
    fc.assert(
      fc.property(plainDate, fc.nat({ max: 70 }), (d, len) => {
        configureMoment(plain);
        const nonEmpty = (weeks: moment.Moment[][]) => weeks.filter((w) => w.length > 0).map((w) => w.map(iso));
        const first = d.with({ day: 1 });
        const last = d.with({ day: d.daysInMonth });
        expect(workdaysByWeek(first, last).map((w) => w.map(String))).toEqual(nonEmpty(m(d).monthBusinessWeeks()));
        const end = d.add({ days: len });
        expect(workdaysByWeek(d, end).map((w) => w.map(String))).toEqual(nonEmpty(m(d).businessWeeksBetween(m(end))));
      }),
      runs(200),
    );
  });
});
