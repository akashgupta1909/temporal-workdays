// Compiles `WorkdayOptions` into integer lookups and answers "is this epoch day a workday?".

import { dayOfWeekFromEpochDay, isoFromEpochDay } from './epoch.js';
import { describe, rangeError, typeError } from './errors.js';
import { compileHoliday, holidaysOfYear, parseDate, parseObservance, type CompiledRule } from './holiday-rules.js';
import type { DateFactory } from './temporal.js';
import type { DayOfWeek, HolidayInput, HolidayPredicate, Observance, WorkdayOptions } from './types.js';

/** Longest run of consecutive non-working days searched before giving up (≈ 20 years). */
export const MAX_SCAN_DAYS = 366 * 20;

export interface DayCalendar {
  /** Indexed by ISO day of week 1..7. */
  readonly weekend: readonly boolean[];
  /** Rules that apply every year (fixed dates, nth weekdays, Easter-relative). */
  readonly yearly: readonly CompiledRule[];
  /** One-off date rules, indexed by year. */
  readonly byYear: ReadonlyMap<number, readonly CompiledRule[]>;
  readonly predicate: HolidayPredicate | undefined;
  readonly observed: Observance;
  /** Extra workdays, as epoch days. */
  readonly extra: ReadonlySet<number>;
  /** Holiday epoch days per year, computed on first use. */
  readonly cache: Map<number, ReadonlySet<number>>;
}

/** Every option name any function accepts, so one options object can be shared by all of them. */
export const OPTION_KEYS: ReadonlySet<string> = new Set([
  'weekend',
  'holidays',
  'observed',
  'extraWorkdays',
  'hours',
  'specialHours',
]);

export { parseDate };

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

export function compileDayCalendar(options: WorkdayOptions = {}): DayCalendar {
  checkOptionsObject(options);
  checkOptionKeys(options, OPTION_KEYS);

  const weekend = new Array<boolean>(8).fill(false);
  const weekendDays: unknown = options.weekend ?? [6, 7];
  if (!isIterable(weekendDays)) throw typeError(`weekend must be an array of days, got ${describe(weekendDays)}`);
  for (const d of weekendDays) {
    if (!Number.isInteger(d) || (d as number) < 1 || (d as number) > 7) {
      throw rangeError(`weekend days must be integers 1 (Mon) – 7 (Sun), got ${describe(d)}`);
    }
    weekend[d as DayOfWeek] = true;
  }

  const yearly: CompiledRule[] = [];
  const byYear = new Map<number, CompiledRule[]>();
  let predicate: HolidayPredicate | undefined;
  const holidays: unknown = options.holidays;
  if (typeof holidays === 'function') {
    predicate = holidays as HolidayPredicate;
  } else if (holidays !== undefined) {
    if (!isIterable(holidays)) throw typeError(`holidays must be an array or a function, got ${describe(holidays)}`);
    for (const entry of holidays) {
      const rule = compileHoliday(entry as HolidayInput);
      if (rule.kind === 'date') {
        const year = isoFromEpochDay(rule.epochDay)[0];
        byYear.set(year, [...(byYear.get(year) ?? []), rule]);
      } else {
        yearly.push(rule);
      }
    }
  }
  const observed = options.observed === undefined ? 'none' : parseObservance(options.observed, 'observed');

  const extra = new Set<number>();
  const extraWorkdays: unknown = options.extraWorkdays;
  if (extraWorkdays !== undefined) {
    if (!isIterable(extraWorkdays)) throw typeError(`extraWorkdays must be an array, got ${describe(extraWorkdays)}`);
    for (const entry of extraWorkdays) extra.add(parseDate(entry));
  }

  return { weekend, yearly, byYear, predicate, observed, extra, cache: new Map() };
}

export function isWeekendDay(cal: DayCalendar, epochDay: number): boolean {
  return cal.weekend[dayOfWeekFromEpochDay(epochDay)] === true;
}

const NO_RULES: readonly CompiledRule[] = [];

/** Holiday epoch days of `year` from the listed rules (not the predicate), cached. */
function listedHolidaysOfYear(cal: DayCalendar, year: number): ReadonlySet<number> {
  let days = cal.cache.get(year);
  if (!days) {
    const rulesFor = (y: number): readonly CompiledRule[] => {
      const dated = cal.byYear.get(y);
      return dated ? [...cal.yearly, ...dated] : cal.yearly.length > 0 ? cal.yearly : NO_RULES;
    };
    days = holidaysOfYear(rulesFor, year, cal.observed, (d) => isWeekendDay(cal, d));
    cal.cache.set(year, days);
  }
  return days;
}

/** Holiday check that ignores `extraWorkdays`. */
function isListedHoliday(cal: DayCalendar, epochDay: number, dates: DateFactory): boolean {
  if (
    (cal.yearly.length > 0 || cal.byYear.size > 0) &&
    listedHolidaysOfYear(cal, isoFromEpochDay(epochDay)[0]).has(epochDay)
  ) {
    return true;
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
