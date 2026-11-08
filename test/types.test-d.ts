// Compile-time tests of the public types (run by `vitest --typecheck`).
import Holidays from 'date-holidays';
import { Temporal } from 'temporal-polyfill';
import { describe, expectTypeOf, it } from 'vitest';
import {
  addWorkdays,
  addWorkingTime,
  createWorkCalendar,
  eachWorkday,
  fromDateHolidays,
  getWorkingHours,
  type HolidayPredicate,
  type SpecialHoursFunction,
  type TimeRangeText,
  type WorkCalendar,
  workdaysBetween,
  workingTimeBetween,
  type WorkingTimeOptions,
  type WorkTimeCalendar,
} from '../src/index.js';

declare const date: Temporal.PlainDate;
declare const dateTime: Temporal.PlainDateTime;
declare const zoned: Temporal.ZonedDateTime;

describe('public types', () => {
  it('return the same Temporal type they are given', () => {
    expectTypeOf(addWorkdays(date, 1)).toEqualTypeOf<Temporal.PlainDate>();
    expectTypeOf(addWorkdays(dateTime, 1)).toEqualTypeOf<Temporal.PlainDateTime>();
    expectTypeOf(addWorkdays(zoned, 1)).toEqualTypeOf<Temporal.ZonedDateTime>();
    expectTypeOf(eachWorkday(zoned, date)).toEqualTypeOf<Generator<Temporal.ZonedDateTime, void>>();
    expectTypeOf(createWorkCalendar().addWorkdays(dateTime, 1)).toEqualTypeOf<Temporal.PlainDateTime>();
    expectTypeOf(workdaysBetween(date, zoned)).toEqualTypeOf<number>();
  });

  it('accept holiday predicates typed with the real Temporal.PlainDate', () => {
    const predicate = (d: Temporal.PlainDate) => d.month === 1;
    expectTypeOf(predicate).toExtend<HolidayPredicate>();
    expectTypeOf(createWorkCalendar({ holidays: predicate })).toEqualTypeOf<WorkCalendar>();
  });

  it('reject non-Temporal values and bad options', () => {
    // @ts-expect-error a JavaScript Date is not a Temporal date
    addWorkdays(new Date(), 1);
    // @ts-expect-error a PlainTime has no date
    addWorkdays(Temporal.PlainTime.from('10:00'), 1);
    // @ts-expect-error amount must be a number
    addWorkdays(date, '1');
    // @ts-expect-error 0 is not an ISO day of week
    createWorkCalendar({ weekend: [0] });
    // @ts-expect-error unknown option
    createWorkCalendar({ holiday: [] });
  });
});

describe('working-time types', () => {
  const options: WorkingTimeOptions = { hours: [['09:00', '17:00']] };

  it("preserve the input type and return the implementation's Duration", () => {
    expectTypeOf(addWorkingTime(zoned, { hours: 1 }, options)).toEqualTypeOf<Temporal.ZonedDateTime>();
    expectTypeOf(
      addWorkingTime(dateTime, Temporal.Duration.from('PT1H'), options),
    ).toEqualTypeOf<Temporal.PlainDateTime>();
    expectTypeOf(workingTimeBetween(zoned, zoned, options)).toEqualTypeOf<Temporal.Duration>();
    expectTypeOf(getWorkingHours(date, options)).toEqualTypeOf<readonly TimeRangeText[]>();
  });

  it('give calendars working-time methods only when hours are configured', () => {
    expectTypeOf(createWorkCalendar(options)).toEqualTypeOf<WorkTimeCalendar>();
    expectTypeOf(createWorkCalendar({ weekend: [5, 6] })).toEqualTypeOf<WorkCalendar>();
    expectTypeOf(createWorkCalendar(options).workingTimeBetween(dateTime, dateTime)).toEqualTypeOf<Temporal.Duration>();
    // @ts-expect-error no hours, no working-time methods
    createWorkCalendar({ weekend: [5, 6] }).addWorkingTime(dateTime, { hours: 1 });
  });

  it('accept PlainTime ranges, weekly maps and typed special-hours functions', () => {
    const special = (d: Temporal.PlainDate, regular: readonly TimeRangeText[]) =>
      d.day === 24 ? regular.slice(0, 1) : undefined;
    expectTypeOf(special).toExtend<SpecialHoursFunction>();
    createWorkCalendar({
      hours: { default: [[Temporal.PlainTime.from('09:00'), '17:00']], 6: [] },
      specialHours: special,
    });
    createWorkCalendar({ hours: [['09:00', '17:00']], specialHours: { '2026-12-24': [['09:00', '13:00']] } });
  });

  it('reject plain dates, mismatched pairs and missing hours', () => {
    // @ts-expect-error working time needs a time of day
    addWorkingTime(date, { hours: 1 }, options);
    // @ts-expect-error start and end must be the same type
    workingTimeBetween(zoned, dateTime, options);
    // @ts-expect-error hours are required
    addWorkingTime(dateTime, { hours: 1 }, {});
    // @ts-expect-error durations are objects, not strings
    addWorkingTime(dateTime, 'PT1H', options);
    // @ts-expect-error 8 is not a day of week
    createWorkCalendar({ hours: { 8: [] } });
  });
});

describe('date-holidays adapter types', () => {
  it('accepts a real date-holidays instance and spreads into options', () => {
    const adapted = fromDateHolidays(new Holidays('DE', 'BY'), { types: ['public', 'bank'] });
    expectTypeOf(createWorkCalendar({ ...adapted, hours: [['09:00', '17:00']] })).toEqualTypeOf<WorkTimeCalendar>();
    expectTypeOf(createWorkCalendar({ ...adapted })).toEqualTypeOf<WorkCalendar>();
    // @ts-expect-error not a date-holidays instance
    fromDateHolidays({ isHoliday: () => false });
  });
});
