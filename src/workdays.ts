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
import { dayOfWeekFromEpochDay } from './epoch.js';
import { describe, rangeError } from './errors.js';
import { DateFactory, toPlainDate } from './temporal.js';
import type { DateInput, DayOfWeek, WorkdayOptions } from './types.js';

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

/** The first epoch day of the week containing `epochDay`, for weeks starting on `weekStart`. */
function weekOf(epochDay: number, weekStart: DayOfWeek): number {
  const offset = (dayOfWeekFromEpochDay(epochDay) - weekStart + 7) % 7;
  return epochDay - offset;
}

/**
 * The day a work week starts: the first non-weekend day after the weekend (Monday for
 * Saturday–Sunday, Sunday for Friday–Saturday, Saturday for a Friday-only weekend).
 * Monday when there is no weekend or it is not followed by a workday.
 */
export function weekStartOf(cal: DayCalendar): DayOfWeek {
  for (const d of [1, 2, 3, 4, 5, 6, 7] as const) {
    const before = d === 1 ? 7 : d - 1;
    if (cal.weekend[before] === true && cal.weekend[d] !== true) return d;
  }
  return 1;
}

export function workdaysInMonthWith<T extends DateInput>(cal: DayCalendar, date: T): T[] {
  const plain = toPlainDate(date);
  const first = shiftDays(date, 1 - plain.day);
  return [...eachWorkdayWith(cal, first, shiftDays(date, plain.daysInMonth - plain.day))];
}

export function workdayOfMonthWith(cal: DayCalendar, date: DateInput): number {
  const plain = toPlainDate(date);
  const dates = new DateFactory(plain);
  // Workdays in (day before the 1st, date] = workdays from the 1st up to and including date.
  return countWorkdays(cal, dates.epochDay - plain.day, dates.epochDay, dates);
}

export function workdaysByWeekWith<T extends DateInput>(cal: DayCalendar, start: T, end: DateInput): T[][] {
  const dates = new DateFactory(toPlainDate(start));
  const endDay = new DateFactory(toPlainDate(end)).epochDay;
  const weekStart = weekStartOf(cal);
  const weeks: T[][] = [];
  let week: T[] = [];
  let weekId: number | undefined;
  for (let day = dates.epochDay; day <= endDay; day++) {
    if (!isWorkdayDay(cal, day, dates)) continue;
    const id = weekOf(day, weekStart);
    if (id !== weekId) {
      week = [];
      weeks.push(week);
      weekId = id;
    }
    week.push(shiftDays(start, day - dates.epochDay));
  }
  return weeks;
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

/**
 * Every workday in the month of `date` (in `date`'s own calendar), as the type of `date`
 * with its time of day preserved.
 */
export function workdaysInMonth<T extends DateInput>(date: T, options?: WorkdayOptions): T[] {
  return workdaysInMonthWith(compileDayCalendar(options), date);
}

/**
 * The number of workdays in `date`'s month up to and including `date`: 1 on the month's
 * first workday, and the count so far on a non-workday (0 before the first workday).
 */
export function workdayOfMonth(date: DateInput, options?: WorkdayOptions): number {
  return workdayOfMonthWith(compileDayCalendar(options), date);
}

/**
 * The workdays from `start` to `end` (both inclusive), grouped by week. Weeks start on the
 * first day after the weekend (Monday for Saturday–Sunday, Sunday for Friday–Saturday).
 * Weeks without workdays are left out.
 */
export function workdaysByWeek<T extends DateInput>(start: T, end: DateInput, options?: WorkdayOptions): T[][] {
  return workdaysByWeekWith(compileDayCalendar(options), start, end);
}
