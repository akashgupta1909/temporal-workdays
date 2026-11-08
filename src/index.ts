import { dayOfWeekFromEpochDay, daysInMonth, epochDayFromIso, isoFromEpochDay } from './epoch.js';

/**
 * The parts of a `Temporal.PlainDate` this library relies on. Described structurally so that
 * native Temporal, `temporal-polyfill`, `@js-temporal/polyfill` and their TypeScript types all work,
 * with no global `Temporal` type required.
 */
export interface PlainDateLike {
  readonly calendarId: string;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly day: number;
  readonly dayOfWeek: number;
  withCalendar(calendar: 'iso8601'): PlainDateLike;
  add(duration: { days: number }): PlainDateLike;
  toString(): string;
}

/** The parts of a `Temporal.PlainDateTime` / `Temporal.ZonedDateTime` this library relies on. */
export interface DateTimeLike {
  toPlainDate(): PlainDateLike;
  add(duration: { days: number }): DateTimeLike;
}

/** The parts of a `Temporal.PlainMonthDay` this library relies on. */
export interface PlainMonthDayLike {
  readonly calendarId: string;
  readonly monthCode: string;
  readonly day: number;
}

/**
 * Any Temporal value that has a calendar date: `Temporal.PlainDate`, `Temporal.PlainDateTime`
 * or `Temporal.ZonedDateTime`. Every helper returns the same type it was given.
 */
export type DateInput = PlainDateLike | DateTimeLike;

/** ISO day of week: 1 = Monday … 7 = Sunday (same as `Temporal.PlainDate#dayOfWeek`). */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A holiday entry:
 * - `'2026-12-25'` or a `Temporal.PlainDate` — a single date.
 * - `'12-25'` or a `Temporal.PlainMonthDay` — every year on that ISO month/day.
 */
export type HolidayInput = string | PlainDateLike | PlainMonthDayLike;

/**
 * Decides whether a date is a holiday. Receives an ISO-calendar `Temporal.PlainDate`
 * from the same Temporal implementation as the input date. Not called for weekend days.
 */
// Method syntax keeps the parameter bivariant, so `(d: Temporal.PlainDate) => boolean` is accepted.
export type HolidayPredicate = { bivarianceHack(date: PlainDateLike): boolean }['bivarianceHack'];

export interface WorkdayOptions {
  /** Non-working days of the week. Default `[6, 7]` (Saturday, Sunday). */
  weekend?: readonly DayOfWeek[];
  /** Holiday dates, or a function that decides whether a date is a holiday. */
  holidays?: Iterable<HolidayInput> | HolidayPredicate;
  /**
   * Dates that count as workdays even if they fall on the weekend or a holiday
   * (for example, make-up working Saturdays). Single dates only.
   */
  extraWorkdays?: Iterable<string | PlainDateLike>;
}

/** Longest run of consecutive non-workdays we search before giving up (≈ 20 years). */
const MAX_SCAN_DAYS = 366 * 20;

interface Compiled {
  weekend: boolean[]; // index 1..7
  dates: Set<number>; // epoch days
  annual: Set<number>; // month * 100 + day
  predicate: HolidayPredicate | undefined;
  extra: Set<number>; // epoch days
}

const DATE_RE = /^([+-]?\d{4,6})-(\d{2})-(\d{2})$/;
const MONTH_DAY_RE = /^(?:--)?(\d{2})-(\d{2})$/;

function checkDay(year: number, month: number, day: number, source: unknown): void {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`temporal-workdays: invalid date ${JSON.stringify(String(source))}`);
  }
}

function epochDayOfPlainDate(date: PlainDateLike): number {
  const iso = date.calendarId === 'iso8601' ? date : date.withCalendar('iso8601');
  return epochDayFromIso(iso.year, iso.month, iso.day);
}

function isTemporalLike(value: unknown, tag: string): boolean {
  return typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === `[object ${tag}]`;
}

function parseSingleDate(value: unknown): number {
  if (typeof value === 'string') {
    const m = DATE_RE.exec(value);
    if (!m) throw new RangeError(`temporal-workdays: expected "YYYY-MM-DD", got ${JSON.stringify(value)}`);
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    checkDay(y, mo, d, value);
    return epochDayFromIso(y, mo, d);
  }
  if (isTemporalLike(value, 'Temporal.PlainDate')) return epochDayOfPlainDate(value as PlainDateLike);
  throw new TypeError(`temporal-workdays: expected a "YYYY-MM-DD" string or Temporal.PlainDate, got ${String(value)}`);
}

function compile(options: WorkdayOptions | undefined): Compiled {
  const weekendDays = options?.weekend ?? [6, 7];
  const weekend = new Array<boolean>(8).fill(false);
  for (const d of weekendDays) {
    if (!Number.isInteger(d) || d < 1 || d > 7) {
      throw new RangeError(`temporal-workdays: weekend days must be integers 1 (Mon) – 7 (Sun), got ${String(d)}`);
    }
    weekend[d] = true;
  }

  const dates = new Set<number>();
  const annual = new Set<number>();
  let predicate: HolidayPredicate | undefined;
  const holidays = options?.holidays;

  if (typeof holidays === 'function') {
    predicate = holidays;
  } else if (holidays != null) {
    for (const h of holidays) {
      if (typeof h === 'string') {
        const md = MONTH_DAY_RE.exec(h);
        if (md) {
          const [mo, d] = [Number(md[1]), Number(md[2])];
          checkDay(2000, mo, d, h); // leap year so that 02-29 is accepted
          annual.add(mo * 100 + d);
          continue;
        }
        dates.add(parseSingleDate(h));
      } else if (isTemporalLike(h, 'Temporal.PlainMonthDay')) {
        const pmd = h as PlainMonthDayLike;
        if (pmd.calendarId !== 'iso8601') {
          throw new RangeError('temporal-workdays: Temporal.PlainMonthDay holidays must use the iso8601 calendar');
        }
        annual.add(Number(pmd.monthCode.slice(1)) * 100 + pmd.day);
      } else {
        dates.add(parseSingleDate(h));
      }
    }
  }

  const extra = new Set<number>();
  if (options?.extraWorkdays != null) {
    for (const e of options.extraWorkdays) extra.add(parseSingleDate(e));
  }

  return { weekend, dates, annual, predicate, extra };
}

const cache = new WeakMap<object, Compiled>();
const DEFAULT = compile(undefined);

function getCompiled(options: WorkdayOptions | undefined): Compiled {
  if (options === undefined) return DEFAULT;
  let c = cache.get(options);
  if (!c) {
    c = compile(options);
    cache.set(options, c);
  }
  return c;
}

/** Calendar date of the input as an ISO epoch day, plus an ISO PlainDate for predicates. */
function toPlainDate(date: DateInput): PlainDateLike {
  if (date == null || typeof (date as { add?: unknown }).add !== 'function') {
    throw new TypeError('temporal-workdays: expected a Temporal.PlainDate, PlainDateTime or ZonedDateTime');
  }
  return 'toPlainDate' in date ? date.toPlainDate() : date;
}

function isHolidayDay(c: Compiled, epochDay: number, base: PlainDateLike, baseDay: number): boolean {
  if (c.dates.has(epochDay)) return true;
  if (c.annual.size > 0) {
    const [, mo, d] = isoFromEpochDay(epochDay);
    if (c.annual.has(mo * 100 + d)) return true;
  }
  if (c.predicate) {
    const iso = base.calendarId === 'iso8601' ? base : base.withCalendar('iso8601');
    return c.predicate(epochDay === baseDay ? iso : iso.add({ days: epochDay - baseDay }));
  }
  return false;
}

function isWorkdayDay(c: Compiled, epochDay: number, base: PlainDateLike, baseDay: number): boolean {
  if (c.extra.has(epochDay)) return true;
  if (c.weekend[dayOfWeekFromEpochDay(epochDay)]) return false;
  return !isHolidayDay(c, epochDay, base, baseDay);
}

function checkInteger(n: number, name: string): void {
  if (!Number.isInteger(n)) throw new RangeError(`temporal-workdays: ${name} must be an integer, got ${String(n)}`);
}

function noWorkdayError(): RangeError {
  return new RangeError(
    `temporal-workdays: no workday found within ${MAX_SCAN_DAYS} days — check your weekend/holiday configuration`,
  );
}

/** Steps `count` workdays in direction `dir` (+1 / -1) and returns the epoch-day delta from start. */
function step(c: Compiled, base: PlainDateLike, count: number, dir: 1 | -1): number {
  const baseDay = epochDayOfPlainDate(base);
  let day = baseDay;
  let remaining = count;
  let gap = 0;
  while (remaining > 0) {
    day += dir;
    if (isWorkdayDay(c, day, base, baseDay)) {
      remaining--;
      gap = 0;
    } else if (++gap > MAX_SCAN_DAYS) {
      throw noWorkdayError();
    }
  }
  return day - baseDay;
}

function shift<T extends DateInput>(date: T, days: number): T {
  return (days === 0 ? date : date.add({ days })) as T;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** `true` if the date falls on a configured weekend day (ignores holidays and `extraWorkdays`). */
export function isWeekend(date: DateInput, options?: WorkdayOptions): boolean {
  return getCompiled(options).weekend[toPlainDate(date).dayOfWeek] === true;
}

/** `true` if the date is a configured holiday and not listed in `extraWorkdays`. */
export function isHoliday(date: DateInput, options?: WorkdayOptions): boolean {
  const c = getCompiled(options);
  const base = toPlainDate(date);
  const day = epochDayOfPlainDate(base);
  return !c.extra.has(day) && isHolidayDay(c, day, base, day);
}

/** `true` if the date is a working day: not a weekend day and not a holiday, or listed in `extraWorkdays`. */
export function isWorkday(date: DateInput, options?: WorkdayOptions): boolean {
  const c = getCompiled(options);
  const base = toPlainDate(date);
  const day = epochDayOfPlainDate(base);
  return isWorkdayDay(c, day, base, day);
}

/**
 * Adds `amount` workdays (negative to go back). The result has the same type as the input,
 * and time of day / time zone are preserved. `amount = 0` returns the input unchanged.
 * Starting on a non-workday, `+1` gives the next workday.
 */
export function addWorkdays<T extends DateInput>(date: T, amount: number, options?: WorkdayOptions): T {
  checkInteger(amount, 'amount');
  if (amount === 0) return date;
  const c = getCompiled(options);
  return shift(date, step(c, toPlainDate(date), Math.abs(amount), amount > 0 ? 1 : -1));
}

/** Subtracts `amount` workdays. Same as `addWorkdays(date, -amount)`. */
export function subtractWorkdays<T extends DateInput>(date: T, amount: number, options?: WorkdayOptions): T {
  checkInteger(amount, 'amount');
  return addWorkdays(date, -amount, options);
}

/** The first workday strictly after `date`. */
export function nextWorkday<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return shift(date, step(getCompiled(options), toPlainDate(date), 1, 1));
}

/** The last workday strictly before `date`. */
export function previousWorkday<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return shift(date, step(getCompiled(options), toPlainDate(date), 1, -1));
}

/** `date` itself if it is a workday, otherwise the next workday after it. */
export function rollForward<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return isWorkday(date, options) ? date : nextWorkday(date, options);
}

/** `date` itself if it is a workday, otherwise the previous workday before it. */
export function rollBackward<T extends DateInput>(date: T, options?: WorkdayOptions): T {
  return isWorkday(date, options) ? date : previousWorkday(date, options);
}

/**
 * Number of workdays after `start` up to and including `end` — the range `(start, end]`.
 * Negative when `end` is before `start`. Only calendar dates matter; times are ignored.
 *
 * For `amount >= 0`: `workdaysBetween(d, addWorkdays(d, amount)) === amount`.
 */
export function workdaysBetween(start: DateInput, end: DateInput, options?: WorkdayOptions): number {
  const c = getCompiled(options);
  const a = toPlainDate(start);
  const b = toPlainDate(end);
  const aDay = epochDayOfPlainDate(a);
  const bDay = epochDayOfPlainDate(b);
  if (aDay === bDay) return 0;
  const [lo, hi, base, baseDay, sign] = aDay < bDay ? [aDay, bDay, a, aDay, 1] : [bDay, aDay, b, bDay, -1];
  let count = 0;
  for (let day = lo + 1; day <= hi; day++) {
    if (isWorkdayDay(c, day, base, baseDay)) count++;
  }
  return sign * count;
}

/**
 * Yields every workday from `start` to `end`, both inclusive, in ascending order.
 * Values have the type of `start` (time of day / zone preserved). Yields nothing if `end < start`.
 */
export function* eachWorkday<T extends DateInput>(start: T, end: DateInput, options?: WorkdayOptions): Generator<T> {
  const c = getCompiled(options);
  const base = toPlainDate(start);
  const baseDay = epochDayOfPlainDate(base);
  const endDay = epochDayOfPlainDate(toPlainDate(end));
  for (let day = baseDay; day <= endDay; day++) {
    if (isWorkdayDay(c, day, base, baseDay)) yield shift(start, day - baseDay);
  }
}

/** A set of workday helpers bound to one configuration. Holidays are parsed once. */
export interface WorkCalendar {
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
  eachWorkday<T extends DateInput>(start: T, end: DateInput): Generator<T>;
}

/**
 * Creates helpers bound to one configuration. The options are validated and copied
 * immediately, so later changes to the passed-in arrays don't affect the calendar.
 */
export function createWorkCalendar(options: WorkdayOptions = {}): WorkCalendar {
  const frozen: WorkdayOptions = Object.freeze({
    weekend: options.weekend ? Object.freeze([...options.weekend]) : undefined,
    holidays: typeof options.holidays === 'function' || options.holidays == null ? options.holidays : Object.freeze([...options.holidays]),
    extraWorkdays: options.extraWorkdays ? Object.freeze([...options.extraWorkdays]) : undefined,
  });
  cache.set(frozen, compile(frozen)); // validate eagerly
  return Object.freeze({
    options: frozen,
    isWorkday: (d) => isWorkday(d, frozen),
    isWeekend: (d) => isWeekend(d, frozen),
    isHoliday: (d) => isHoliday(d, frozen),
    addWorkdays: (d, n) => addWorkdays(d, n, frozen),
    subtractWorkdays: (d, n) => subtractWorkdays(d, n, frozen),
    nextWorkday: (d) => nextWorkday(d, frozen),
    previousWorkday: (d) => previousWorkday(d, frozen),
    rollForward: (d) => rollForward(d, frozen),
    rollBackward: (d) => rollBackward(d, frozen),
    workdaysBetween: (a, b) => workdaysBetween(a, b, frozen),
    eachWorkday: (a, b) => eachWorkday(a, b, frozen),
  } satisfies WorkCalendar);
}
