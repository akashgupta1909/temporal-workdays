import { checkOptionsObject, compileDayCalendar, isIterable } from './day-calendar.js';
import {
  addWorkingTimeWith,
  compileHoursCalendar,
  getWorkingHoursWith,
  isWorkingTimeWith,
  rollBackwardToWorkingTimeWith,
  rollForwardToWorkingTimeWith,
  subtractWorkingTimeWith,
  workingTimeBetweenWith,
} from './hours.js';
import type {
  DateInput,
  DateTimeInput,
  DurationInput,
  DurationOf,
  TimeRangeText,
  WorkdayOptions,
  WorkingTimeOptions,
} from './types.js';
import {
  addWorkdaysWith,
  eachWorkdayWith,
  isHolidayWith,
  isWeekendWith,
  isWorkdayWith,
  nextWorkdayWith,
  previousWorkdayWith,
  rollBackwardWith,
  rollForwardWith,
  subtractWorkdaysWith,
  workdaysBetweenWith,
  workdaysByWeekWith,
  workdaysInMonthWith,
  workdayOfMonthWith,
} from './workdays.js';

/** Workday helpers bound to one configuration. See the standalone functions for details. */
export interface WorkCalendar {
  /** A frozen snapshot of the options the calendar was created with. */
  readonly options: Readonly<WorkdayOptions>;
  isWorkday(date: DateInput): boolean;
  isWeekend(date: DateInput): boolean;
  isHoliday(date: DateInput): boolean;
  addWorkdays<T extends DateInput>(date: T, amount: number): T;
  subtractWorkdays<T extends DateInput>(date: T, amount: number): T;
  nextWorkday<T extends DateInput>(date: T): T;
  previousWorkday<T extends DateInput>(date: T): T;
  rollForward<T extends DateInput>(date: T): T;
  rollBackward<T extends DateInput>(date: T): T;
  workdaysBetween(start: DateInput, end: DateInput): number;
  eachWorkday<T extends DateInput>(start: T, end: DateInput): Generator<T, void>;
  workdaysInMonth<T extends DateInput>(date: T): T[];
  workdayOfMonth(date: DateInput): number;
  workdaysByWeek<T extends DateInput>(start: T, end: DateInput): T[][];
}

/** A calendar created with `hours`: workday helpers plus working-time helpers. */
export interface WorkTimeCalendar extends WorkCalendar {
  readonly options: Readonly<WorkingTimeOptions>;
  isWorkingTime(dateTime: DateTimeInput): boolean;
  addWorkingTime<T extends DateTimeInput>(dateTime: T, duration: DurationInput): T;
  subtractWorkingTime<T extends DateTimeInput>(dateTime: T, duration: DurationInput): T;
  workingTimeBetween<T extends DateTimeInput>(start: T, end: NoInfer<T>): DurationOf<T>;
  rollForwardToWorkingTime<T extends DateTimeInput>(dateTime: T): T;
  rollBackwardToWorkingTime<T extends DateTimeInput>(dateTime: T): T;
  getWorkingHours(date: DateInput): readonly TimeRangeText[];
}

/**
 * Creates helpers bound to one configuration. The options are validated and read
 * immediately (holidays and hours are parsed once), so later changes to the passed-in
 * arrays don't affect the calendar. Prefer this over the standalone functions when the
 * same configuration is used repeatedly. With `hours`, the working-time helpers are included.
 */
export function createWorkCalendar(options: WorkingTimeOptions): WorkTimeCalendar;
export function createWorkCalendar(options?: WorkdayOptions): WorkCalendar;
export function createWorkCalendar(options: WorkdayOptions | WorkingTimeOptions = {}): WorkCalendar {
  checkOptionsObject(options);
  const snapshot = snapshotOptions(options);
  const days = compileDayCalendar(snapshot);
  const calendar: WorkCalendar = {
    options: snapshot,
    isWorkday: (date) => isWorkdayWith(days, date),
    isWeekend: (date) => isWeekendWith(days, date),
    isHoliday: (date) => isHolidayWith(days, date),
    addWorkdays: (date, amount) => addWorkdaysWith(days, date, amount),
    subtractWorkdays: (date, amount) => subtractWorkdaysWith(days, date, amount),
    nextWorkday: (date) => nextWorkdayWith(days, date),
    previousWorkday: (date) => previousWorkdayWith(days, date),
    rollForward: (date) => rollForwardWith(days, date),
    rollBackward: (date) => rollBackwardWith(days, date),
    workdaysBetween: (start, end) => workdaysBetweenWith(days, start, end),
    eachWorkday: (start, end) => eachWorkdayWith(days, start, end),
    workdaysInMonth: (date) => workdaysInMonthWith(days, date),
    workdayOfMonth: (date) => workdayOfMonthWith(days, date),
    workdaysByWeek: (start, end) => workdaysByWeekWith(days, start, end),
  };
  if (!hasHours(snapshot)) return Object.freeze(calendar);

  const hours = compileHoursCalendar(snapshot);
  return Object.freeze({
    ...calendar,
    options: snapshot,
    isWorkingTime: (dateTime) => isWorkingTimeWith(hours, dateTime),
    addWorkingTime: (dateTime, duration) => addWorkingTimeWith(hours, dateTime, duration),
    subtractWorkingTime: (dateTime, duration) => subtractWorkingTimeWith(hours, dateTime, duration),
    workingTimeBetween: (start, end) => workingTimeBetweenWith(hours, start, end),
    rollForwardToWorkingTime: (dateTime) => rollForwardToWorkingTimeWith(hours, dateTime),
    rollBackwardToWorkingTime: (dateTime) => rollBackwardToWorkingTimeWith(hours, dateTime),
    getWorkingHours: (date) => getWorkingHoursWith(hours, date),
  } satisfies WorkTimeCalendar);
}

function hasHours(options: WorkdayOptions): options is WorkingTimeOptions {
  return (options as Partial<WorkingTimeOptions>).hours !== undefined;
}

/**
 * Copies iterables into frozen arrays so the calendar is immune to later mutation.
 * Anything else is passed through unchanged for the compilers to reject.
 */
function snapshotOptions<O extends WorkdayOptions>(options: O): Readonly<O> {
  const copy = <V>(value: V): V => (isIterable(value) ? (Object.freeze(Array.from(value)) as V) : value);
  return Object.freeze({
    ...options,
    weekend: copy(options.weekend),
    holidays: copy(options.holidays),
    extraWorkdays: copy(options.extraWorkdays),
  });
}
