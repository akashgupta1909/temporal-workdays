// Compile-time tests of the public types (run by `vitest --typecheck`).
import { Temporal } from 'temporal-polyfill';
import { describe, expectTypeOf, it } from 'vitest';
import {
  addWorkdays,
  createWorkCalendar,
  eachWorkday,
  type HolidayPredicate,
  type WorkCalendar,
  workdaysBetween,
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
