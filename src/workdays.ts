// Day-level API: which dates are workdays, and stepping/counting by workdays.

import {
  compileDayCalendar,
  countWorkdays,
  isHolidayDay,
  isWeekendDay,
  isWorkdayDay,
  stepWorkdays,
  type DayCalendar,
} from './day-calendar.js';
import { describe, rangeError } from './errors.js';
import { DateFactory, toPlainDate } from './temporal.js';
import type { DateInput, WorkdayOptions } from './types.js';

function shiftDays<T extends DateInput>(date: T, days: number): T {
  return (days === 0 ? date : date.add({ days })) as T;
}

function checkAmount(amount: unknown): asserts amount is number {
  if (!Number.isSafeInteger(amount)) throw rangeError(`amount must be an integer, got ${describe(amount)}`);
}

// --- Implementations on a compiled calendar (shared with createWorkCalendar) ---------------

export function isWeekendWith(cal: DayCalendar, date: DateInput): boolean {
  return isWeekendDay(cal, new DateFactory(toPlainDate(date)).epochDay);
}

export function isHolidayWith(cal: DayCalendar, date: DateInput): boolean {
  const dates = new DateFactory(toPlainDate(date));
  return isHolidayDay(cal, dates.epochDay, dates);
}

export function isWorkdayWith(cal: DayCalendar, date: DateInput): boolean {
  const dates = new DateFactory(toPlainDate(date));
  return isWorkdayDay(cal, dates.epochDay, dates);
}

export function addWorkdaysWith<T extends DateInput>(cal: DayCalendar, date: T, amount: number): T {
  checkAmount(amount);
  const dates = new DateFactory(toPlainDate(date));
  if (amount === 0) return date;
  const target = stepWorkdays(cal, dates.epochDay, Math.abs(amount), amount > 0 ? 1 : -1, dates);
  return shiftDays(date, target - dates.epochDay);
}

export function subtractWorkdaysWith<T extends DateInput>(cal: DayCalendar, date: T, amount: number): T {
  checkAmount(amount);
  return addWorkdaysWith(cal, date, -amount);
}

export function nextWorkdayWith<T extends DateInput>(cal: DayCalendar, date: T): T {
  const dates = new DateFactory(toPlainDate(date));
  return shiftDays(date, stepWorkdays(cal, dates.epochDay, 1, 1, dates) - dates.epochDay);
}

export function previousWorkdayWith<T extends DateInput>(cal: DayCalendar, date: T): T {
  const dates = new DateFactory(toPlainDate(date));
  return shiftDays(date, stepWorkdays(cal, dates.epochDay, 1, -1, dates) - dates.epochDay);
}

export function rollForwardWith<T extends DateInput>(cal: DayCalendar, date: T): T {
  return isWorkdayWith(cal, date) ? date : nextWorkdayWith(cal, date);
}

export function rollBackwardWith<T extends DateInput>(cal: DayCalendar, date: T): T {
  return isWorkdayWith(cal, date) ? date : previousWorkdayWith(cal, date);
}

export function workdaysBetweenWith(cal: DayCalendar, start: DateInput, end: DateInput): number {
  const a = new DateFactory(toPlainDate(start));
  const endDay = new DateFactory(toPlainDate(end)).epochDay;
  return countWorkdays(cal, a.epochDay, endDay, a);
}

export function* eachWorkdayWith<T extends DateInput>(cal: DayCalendar, start: T, end: DateInput): Generator<T, void> {
  const dates = new DateFactory(toPlainDate(start));
  const endDay = new DateFactory(toPlainDate(end)).epochDay;
  for (let day = dates.epochDay; day <= endDay; day++) {
    if (isWorkdayDay(cal, day, dates)) yield shiftDays(start, day - dates.epochDay);
  }
}

// --- Public functions ---------------------------------------------------------------------

/** `true` if the date falls on a configured weekend day (ignores holidays and `extraWorkdays`). */
export function isWeekend(date: DateInput, options?: WorkdayOptions): boolean {
  return isWeekendWith(compileDayCalendar(options), date);
}

/** `true` if the date is a configured holiday and not listed in `extraWorkdays`. */
export function isHoliday(date: DateInput, options?: WorkdayOptions): boolean {
  return isHolidayWith(compileDayCalendar(options), date);
}

/** `true` if the date is a working day: not a weekend day and not a holiday, or listed in `extraWorkdays`. */
export function isWorkday(date: DateInput, options?: WorkdayOptions): boolean {
  return isWorkdayWith(compileDayCalendar(options), date);
}

/**
 * Adds `amount` workdays (negative to go back). The result has the same type as the input,
 * and time of day / time zone are preserved. `amount = 0` returns the input unchanged.
 * Starting on a non-workday, `+1` gives the next workday.
 */
export function addWorkdays<T extends DateInput>(date: T, amount: number, options?: WorkdayOptions): T {
  return addWorkdaysWith(compileDayCalendar(options), date, amount);
}

/** Subtracts `amount` workdays. Same as `addWorkdays(date, -amount)`. */
export function subtractWorkdays<T extends DateInput>(date: T, amount: number, options?: WorkdayOptions): T {
  return subtractWorkdaysWith(compileDayCalendar(options), date, amount);
}

/** The first workday strictly after `date`. */
export function nextWorkday<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return nextWorkdayWith(compileDayCalendar(options), date);
}

/** The last workday strictly before `date`. */
export function previousWorkday<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return previousWorkdayWith(compileDayCalendar(options), date);
}

/** `date` itself if it is a workday, otherwise the next workday after it. */
export function rollForward<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return rollForwardWith(compileDayCalendar(options), date);
}

/** `date` itself if it is a workday, otherwise the previous workday before it. */
export function rollBackward<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return rollBackwardWith(compileDayCalendar(options), date);
}

/**
 * Number of workdays after `start` up to and including `end` — the range `(start, end]`.
 * Negative when `end` is before `start`. Only calendar dates matter; times are ignored.
 *
 * For `amount >= 0`: `workdaysBetween(d, addWorkdays(d, amount)) === amount`.
 */
export function workdaysBetween(start: DateInput, end: DateInput, options?: WorkdayOptions): number {
  return workdaysBetweenWith(compileDayCalendar(options), start, end);
}

/**
 * Yields every workday from `start` to `end`, both inclusive, in ascending order.
 * Values have the type of `start` (time of day / zone preserved). Yields nothing if `end < start`.
 */
export function eachWorkday<T extends DateInput>(
  start: T,
  end: DateInput,
  options?: WorkdayOptions,
): Generator<T, void> {
  // Compile eagerly so that invalid options throw at the call, not on the first next().
  return eachWorkdayWith(compileDayCalendar(options), start, end);
}
