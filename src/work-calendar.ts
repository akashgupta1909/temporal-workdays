import { checkOptionsObject, compileDayCalendar, isIterable } from './day-calendar.js';
import type { DateInput, WorkdayOptions } from './types.js';
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
}

/**
 * Creates helpers bound to one configuration. The options are validated and read
 * immediately (holidays are parsed once), so later changes to the passed-in arrays
 * don't affect the calendar. Prefer this over the standalone functions when the same
 * configuration is used repeatedly.
 */
export function createWorkCalendar(options: WorkdayOptions = {}): WorkCalendar {
  checkOptionsObject(options);
  const snapshot = snapshotOptions(options);
  const cal = compileDayCalendar(snapshot);
  return Object.freeze({
    options: snapshot,
    isWorkday: (date) => isWorkdayWith(cal, date),
    isWeekend: (date) => isWeekendWith(cal, date),
    isHoliday: (date) => isHolidayWith(cal, date),
    addWorkdays: (date, amount) => addWorkdaysWith(cal, date, amount),
    subtractWorkdays: (date, amount) => subtractWorkdaysWith(cal, date, amount),
    nextWorkday: (date) => nextWorkdayWith(cal, date),
    previousWorkday: (date) => previousWorkdayWith(cal, date),
    rollForward: (date) => rollForwardWith(cal, date),
    rollBackward: (date) => rollBackwardWith(cal, date),
    workdaysBetween: (start, end) => workdaysBetweenWith(cal, start, end),
    eachWorkday: (start, end) => eachWorkdayWith(cal, start, end),
  } satisfies WorkCalendar);
}

/**
 * Copies iterables into frozen arrays so the calendar is immune to later mutation.
 * Anything else is passed through unchanged for compileDayCalendar to reject.
 */
function snapshotOptions(options: WorkdayOptions): Readonly<WorkdayOptions> {
  const copy = <V>(value: V): V => (isIterable(value) ? (Object.freeze(Array.from(value)) as V) : value);
  return Object.freeze({
    ...options,
    weekend: copy(options.weekend),
    holidays: copy(options.holidays),
    extraWorkdays: copy(options.extraWorkdays),
  });
}
