// Compiles `WorkdayOptions` into integer lookups and answers "is this epoch day a workday?".

import { dayOfWeekFromEpochDay, daysInMonth, epochDayFromIso, isoFromEpochDay } from './epoch.js';
import { describe, rangeError, typeError } from './errors.js';
import { epochDayOf, hasBrand, isPlainDate, type DateFactory } from './temporal.js';
import type { DayOfWeek, HolidayInput, HolidayPredicate, PlainMonthDayLike, WorkdayOptions } from './types.js';

/** Longest run of consecutive non-working days searched before giving up (≈ 20 years). */
export const MAX_SCAN_DAYS = 366 * 20;

export interface DayCalendar {
  /** Indexed by ISO day of week 1..7. */
  readonly weekend: readonly boolean[];
  /** Single-date holidays, as epoch days. */
  readonly dates: ReadonlySet<number>;
  /** Annual holidays, as `month * 100 + day`. */
  readonly annual: ReadonlySet<number>;
  readonly predicate: HolidayPredicate | undefined;
  /** Extra workdays, as epoch days. */
  readonly extra: ReadonlySet<number>;
}

const DATE_RE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY_RE = /^(?:--)?(\d{2})-(\d{2})$/;
const WORKDAY_OPTION_KEYS: ReadonlySet<string> = new Set(['weekend', 'holidays', 'extraWorkdays']);

function checkDate(year: number, month: number, day: number, source: unknown): void {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw rangeError(`invalid date ${describe(source)}`);
  }
}

/** Parses a single calendar date: `'YYYY-MM-DD'` (or extended `±YYYYYY-MM-DD`) or a `Temporal.PlainDate`. */
export function parseDate(value: unknown): number {
  if (typeof value === 'string') {
    const m = DATE_RE.exec(value);
    if (!m) throw rangeError(`expected a "YYYY-MM-DD" date, got ${describe(value)}`);
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    checkDate(year, month, day, value);
    return epochDayFromIso(year, month, day);
  }
  if (isPlainDate(value)) return epochDayOf(value);
  throw typeError(`expected a "YYYY-MM-DD" string or Temporal.PlainDate, got ${describe(value)}`);
}

function addHoliday(entry: HolidayInput, dates: Set<number>, annual: Set<number>): void {
  if (typeof entry === 'string') {
    const md = MONTH_DAY_RE.exec(entry);
    if (md) {
      const [month, day] = [Number(md[1]), Number(md[2])];
      checkDate(2000, month, day, entry); // a leap year, so that 02-29 is accepted
      annual.add(month * 100 + day);
      return;
    }
  } else if (hasBrand(entry, 'Temporal.PlainMonthDay')) {
    const pmd = entry as PlainMonthDayLike;
    if (pmd.calendarId !== 'iso8601') {
      throw rangeError('Temporal.PlainMonthDay holidays must use the iso8601 calendar');
    }
    annual.add(Number(pmd.monthCode.slice(1)) * 100 + pmd.day);
    return;
  }
  dates.add(parseDate(entry));
}

export function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<Iterable<unknown>>)[Symbol.iterator] === 'function'
  );
}

/** Throws a TypeError for anything in `options` that is not one of `allowed` (catches typos in JS). */
export function checkOptionKeys(options: object, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw typeError(`unknown option ${JSON.stringify(key)}`);
  }
}

export function checkOptionsObject(options: unknown): asserts options is object | undefined {
  if (options !== undefined && (typeof options !== 'object' || options === null)) {
    throw typeError(`options must be an object, got ${describe(options)}`);
  }
}

export function compileDayCalendar(options: WorkdayOptions = {}, allowedKeys = WORKDAY_OPTION_KEYS): DayCalendar {
  checkOptionsObject(options);
  checkOptionKeys(options, allowedKeys);

  const weekend = new Array<boolean>(8).fill(false);
  const weekendDays: unknown = options.weekend ?? [6, 7];
  if (!isIterable(weekendDays)) throw typeError(`weekend must be an array of days, got ${describe(weekendDays)}`);
  for (const d of weekendDays) {
    if (!Number.isInteger(d) || (d as number) < 1 || (d as number) > 7) {
      throw rangeError(`weekend days must be integers 1 (Mon) – 7 (Sun), got ${describe(d)}`);
    }
    weekend[d as DayOfWeek] = true;
  }

  const dates = new Set<number>();
  const annual = new Set<number>();
  let predicate: HolidayPredicate | undefined;
  const holidays: unknown = options.holidays;
  if (typeof holidays === 'function') {
    predicate = holidays as HolidayPredicate;
  } else if (holidays !== undefined) {
    if (!isIterable(holidays)) throw typeError(`holidays must be an array or a function, got ${describe(holidays)}`);
    for (const entry of holidays) addHoliday(entry as HolidayInput, dates, annual);
  }

  const extra = new Set<number>();
  const extraWorkdays: unknown = options.extraWorkdays;
  if (extraWorkdays !== undefined) {
    if (!isIterable(extraWorkdays)) throw typeError(`extraWorkdays must be an array, got ${describe(extraWorkdays)}`);
    for (const entry of extraWorkdays) extra.add(parseDate(entry));
  }

  return { weekend, dates, annual, predicate, extra };
}

export function isWeekendDay(cal: DayCalendar, epochDay: number): boolean {
  return cal.weekend[dayOfWeekFromEpochDay(epochDay)] === true;
}

/** Holiday check that ignores `extraWorkdays`. */
function isListedHoliday(cal: DayCalendar, epochDay: number, dates: DateFactory): boolean {
  if (cal.dates.has(epochDay)) return true;
  if (cal.annual.size > 0) {
    const [, month, day] = isoFromEpochDay(epochDay);
    if (cal.annual.has(month * 100 + day)) return true;
  }
  return Boolean(cal.predicate?.(dates.at(epochDay)));
}

export function isHolidayDay(cal: DayCalendar, epochDay: number, dates: DateFactory): boolean {
  return !cal.extra.has(epochDay) && isListedHoliday(cal, epochDay, dates);
}

export function isWorkdayDay(cal: DayCalendar, epochDay: number, dates: DateFactory): boolean {
  if (cal.extra.has(epochDay)) return true;
  if (isWeekendDay(cal, epochDay)) return false;
  return !isListedHoliday(cal, epochDay, dates);
}

export function noWorkdayError(): RangeError {
  return rangeError(`no workday found within ${MAX_SCAN_DAYS} days — check the weekend/holiday configuration`);
}

/**
 * The epoch day `count` workdays away from `from` in direction `dir`, not counting `from`.
 * Throws instead of looping forever when a configuration has no workdays.
 */
export function stepWorkdays(cal: DayCalendar, from: number, count: number, dir: 1 | -1, dates: DateFactory): number {
  let day = from;
  let remaining = count;
  let gap = 0;
  while (remaining > 0) {
    day += dir;
    if (isWorkdayDay(cal, day, dates)) {
      remaining--;
      gap = 0;
    } else if (++gap > MAX_SCAN_DAYS) {
      throw noWorkdayError();
    }
  }
  return day;
}

/** Number of workdays in the epoch-day range `(from, to]`; negative when `to < from`. */
export function countWorkdays(cal: DayCalendar, from: number, to: number, dates: DateFactory): number {
  const [lo, hi, sign] = from <= to ? [from, to, 1] : [to, from, -1];
  let count = 0;
  for (let day = lo + 1; day <= hi; day++) {
    if (isWorkdayDay(cal, day, dates)) count++;
  }
  return count === 0 ? 0 : sign * count; // never -0
}
