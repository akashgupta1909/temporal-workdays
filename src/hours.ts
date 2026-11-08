// Time-level API: working hours on top of workdays.
//
// Working hours are wall-clock intervals per day. A Timeline maps them to positions on one
// axis: wall-clock time for PlainDateTime, exact time for ZonedDateTime, so that a DST change
// inside working hours counts as the real 7 or 9 hours it lasts. The algorithms then only
// walk sorted periods of bigint positions.

import {
  checkOptionKeys,
  checkOptionsObject,
  compileDayCalendar,
  isWorkdayDay,
  MAX_SCAN_DAYS,
  parseDate,
  type DayCalendar,
} from './day-calendar.js';
import { dayOfWeekFromEpochDay, epochDayFromIso, floorDiv, isoFromEpochDay } from './epoch.js';
import { describe, rangeError, typeError } from './errors.js';
import {
  DateFactory,
  isPlainDate,
  isPlainDateTime,
  isZonedDateTime,
  toIso,
  toPlainDate,
  withCalendarId,
} from './temporal.js';
import {
  formatDayHours,
  NS_PER_DAY,
  NS_PER_HOUR,
  NS_PER_MINUTE,
  NS_PER_SECOND,
  nsOfTime,
  parseDayHours,
  type Interval,
} from './time.js';
import type {
  DateInput,
  DayOfWeek,
  DateTimeFields,
  DateTimeInput,
  DurationInput,
  DurationLike,
  DurationOf,
  PlainDateTimeLike,
  PlainTimeLike,
  SpecialHoursFunction,
  TimeRangeText,
  WorkingTimeOptions,
  ZonedDateTimeLike,
} from './types.js';

// --- Compiled configuration ---------------------------------------------------------------

type Special =
  | { readonly kind: 'none' }
  | { readonly kind: 'table'; readonly byDay: ReadonlyMap<number, readonly Interval[]> }
  | { readonly kind: 'function'; readonly fn: SpecialHoursFunction };

export interface HoursCalendar {
  readonly days: DayCalendar;
  /** Regular intervals by ISO day of week. */
  readonly weekly: Readonly<Record<DayOfWeek, readonly Interval[]>>;
  /** The same, formatted, for passing to special-hours functions. */
  readonly weeklyText: Readonly<Record<DayOfWeek, readonly TimeRangeText[]>>;
  readonly special: Special;
}

function byDayOfWeek<V>(f: (dow: DayOfWeek) => V): Record<DayOfWeek, V> {
  return { 1: f(1), 2: f(2), 3: f(3), 4: f(4), 5: f(5), 6: f(6), 7: f(7) };
}

export const OPTION_KEYS: ReadonlySet<string> = new Set([
  'weekend',
  'holidays',
  'extraWorkdays',
  'hours',
  'specialHours',
]);
const WEEKLY_KEYS: ReadonlySet<string> = new Set(['1', '2', '3', '4', '5', '6', '7', 'default']);
const EMPTY: readonly Interval[] = [];

function compileWeekly(hours: unknown): Record<DayOfWeek, readonly Interval[]> {
  if (hours === undefined) throw typeError('working-time functions need an `hours` option');
  if (Array.isArray(hours)) {
    const uniform = parseDayHours(hours, 'hours');
    return byDayOfWeek(() => uniform);
  }
  if (typeof hours !== 'object' || hours === null) {
    throw typeError(`hours must be an array of ranges or an object by day of week, got ${describe(hours)}`);
  }
  checkOptionKeys(hours, WEEKLY_KEYS);
  const byDay = hours as Readonly<Record<string, unknown>>;
  const fallback = byDay['default'] === undefined ? EMPTY : parseDayHours(byDay['default'], 'hours.default');
  return byDayOfWeek((dow) => (byDay[dow] === undefined ? fallback : parseDayHours(byDay[dow], `hours[${dow}]`)));
}

function compileSpecial(special: unknown): Special {
  if (special === undefined) return { kind: 'none' };
  if (typeof special === 'function') return { kind: 'function', fn: special as SpecialHoursFunction };
  if (typeof special !== 'object' || special === null || Array.isArray(special)) {
    throw typeError(`specialHours must be an object keyed by date or a function, got ${describe(special)}`);
  }
  const byDay = new Map<number, readonly Interval[]>();
  for (const [date, hours] of Object.entries(special)) {
    byDay.set(parseDate(date), parseDayHours(hours, `specialHours[${JSON.stringify(date)}]`));
  }
  return { kind: 'table', byDay };
}

export function compileHoursCalendar(options: WorkingTimeOptions): HoursCalendar {
  checkOptionsObject(options);
  const days = compileDayCalendar(options);
  const weekly = compileWeekly((options as Partial<WorkingTimeOptions> | undefined)?.hours);
  const weeklyText = byDayOfWeek((dow) => formatDayHours(weekly[dow]));
  return { days, weekly, weeklyText, special: compileSpecial(options.specialHours) };
}

/** The working intervals of an epoch day, after weekends, holidays and special hours. */
function intervalsOn(cal: HoursCalendar, epochDay: number, dates: DateFactory): readonly Interval[] {
  const dow = dayOfWeekFromEpochDay(epochDay);
  const workday = isWorkdayDay(cal.days, epochDay, dates);
  const { special } = cal;
  if (special.kind === 'table') {
    const override = special.byDay.get(epochDay);
    if (override) return override;
  } else if (special.kind === 'function') {
    const date = dates.at(epochDay);
    const result = special.fn(date, workday ? cal.weeklyText[dow] : []);
    if (result !== undefined) return parseDayHours(result, `specialHours(${date.toString()})`);
  }
  return workday ? cal.weekly[dow] : EMPTY;
}

// --- Timelines ----------------------------------------------------------------------------
//
// A timeline maps the working periods of a wall-clock day to *positions*: bigint nanoseconds
// on a single axis (wall-clock time for PlainDateTime, exact time for ZonedDateTime). The
// periods of one day come back sorted, non-empty and merged. Across days they can still
// overlap (Samoa skipped 2011-12-30, so that day's periods map onto the 31st), which the
// algorithms handle with a cursor that never moves backwards.

/** A working period `[start, end)` as positions. */
type Period = readonly [start: bigint, end: bigint];

interface Timeline<T> {
  /** Position of the input. */
  readonly origin: bigint;
  /** How far a day's periods can lie outside that day (see ZONED_LOOKAHEAD); 0 for wall-clock time. */
  readonly lookahead: bigint;
  readonly dates: DateFactory;
  /** Position of another value; throws a TypeError unless it is the same Temporal type. */
  positionOf(value: DateTimeInput): bigint;
  /** Working periods of a wall-clock day as positions: sorted, non-empty, merged. */
  periods(day: number, intervals: readonly Interval[]): readonly Period[];
  /** The input's Temporal type at `position`, keeping its calendar (and time zone). */
  at(position: bigint): T;
  /** A Temporal.Duration of `ns` nanoseconds, from the input's implementation. */
  duration(ns: bigint): DurationLike;
}

const BIG_NS_PER_DAY = BigInt(NS_PER_DAY);
const BIG_NS_PER_SECOND = BigInt(NS_PER_SECOND);

function wallFields(day: number, ns: number): DateTimeFields {
  const [year, month, dd] = isoFromEpochDay(day);
  return {
    year,
    month,
    day: dd,
    hour: Math.floor(ns / NS_PER_HOUR),
    minute: Math.floor((ns % NS_PER_HOUR) / NS_PER_MINUTE),
    second: Math.floor((ns % NS_PER_MINUTE) / NS_PER_SECOND),
    millisecond: Math.floor((ns % NS_PER_SECOND) / 1_000_000),
    microsecond: Math.floor((ns % 1_000_000) / 1_000),
    nanosecond: ns % 1_000,
  };
}

/** Wall-clock position: nanoseconds since 1970-01-01T00:00 as if it were UTC. */
function wallPosition(day: number, ns: number): bigint {
  return BigInt(day) * BIG_NS_PER_DAY + BigInt(ns);
}

function wallDay(v: PlainTimeLike & { year: number; month: number; day: number }): number {
  return epochDayFromIso(v.year, v.month, v.day);
}

function durationFrom(zero: DurationLike, ns: bigint): DurationLike {
  return zero
    .add({ seconds: Number(ns / BIG_NS_PER_SECOND), nanoseconds: Number(ns % BIG_NS_PER_SECOND) })
    .round({ largestUnit: 'hours' });
}

/** Sorts periods by start, drops empty ones and merges overlapping or touching ones. */
function normalizePeriods(periods: Period[]): Period[] {
  periods.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const merged: [bigint, bigint][] = [];
  for (const [start, end] of periods) {
    if (end <= start) continue;
    const last = merged.at(-1);
    if (last && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

class PlainTimeline implements Timeline<PlainDateTimeLike> {
  readonly origin: bigint;
  readonly lookahead = 0n;
  readonly dates: DateFactory;
  readonly #iso: PlainDateTimeLike;
  readonly #calendarId: string;

  constructor(value: PlainDateTimeLike) {
    this.#calendarId = value.calendarId;
    this.#iso = toIso(value);
    this.origin = wallPosition(wallDay(this.#iso), nsOfTime(this.#iso));
    this.dates = new DateFactory(this.#iso.toPlainDate());
  }

  positionOf(value: DateTimeInput): bigint {
    if (!isPlainDateTime(value)) throw mixedTypesError(value);
    const iso = toIso(value);
    return wallPosition(wallDay(iso), nsOfTime(iso));
  }

  periods(day: number, intervals: readonly Interval[]): readonly Period[] {
    // Wall-clock intervals of one day are already sorted, disjoint and non-empty.
    return intervals.map(([start, end]) => [wallPosition(day, start), wallPosition(day, end)]);
  }

  at(position: bigint): PlainDateTimeLike {
    const day = floorDiv(position, BIG_NS_PER_DAY);
    const fields = wallFields(Number(day), Number(position - day * BIG_NS_PER_DAY));
    return withCalendarId(this.#iso.with(fields), this.#calendarId);
  }

  duration(ns: bigint): DurationLike {
    return durationFrom(this.#iso.until(this.#iso as never), ns);
  }
}

/**
 * A time zone's UTC offset is constant between transitions, so inside such a segment a wall
 * time converts to exact time with integer arithmetic. Segments are shrunk by this margin:
 * UTC offsets differ by at most 26 hours, so a wall time whose instant lies more than 48 hours
 * from any transition can be neither skipped nor repeated, and the arithmetic result is exactly
 * what Temporal's `'compatible'` disambiguation returns.
 */
const SEGMENT_MARGIN = 48n * BigInt(NS_PER_HOUR);
const FOREVER = 2n ** 100n;

interface OffsetSegment {
  /** Exact-time bounds `[start, end)`, already shrunk by the margin, with a constant offset. */
  readonly start: bigint;
  readonly end: bigint;
  readonly offset: bigint;
}

/**
 * How far a ZonedDateTime period can lie from its wall-clock day: UTC offsets span 26 hours
 * and a skipped wall time moves forward by at most a day (Samoa skipped 2011-12-30).
 */
const ZONED_LOOKAHEAD = 48n * BigInt(NS_PER_HOUR);

class ZonedTimeline implements Timeline<ZonedDateTimeLike> {
  readonly origin: bigint;
  readonly lookahead = ZONED_LOOKAHEAD;
  readonly dates: DateFactory;
  readonly #iso: ZonedDateTimeLike;
  readonly #calendarId: string;
  #segment: OffsetSegment | undefined;

  constructor(value: ZonedDateTimeLike) {
    this.#calendarId = value.calendarId;
    this.#iso = toIso(value);
    this.origin = this.#iso.epochNanoseconds;
    this.dates = new DateFactory(this.#iso.toPlainDate());
  }

  positionOf(value: DateTimeInput): bigint {
    if (!isZonedDateTime(value)) throw mixedTypesError(value);
    return value.epochNanoseconds;
  }

  periods(day: number, intervals: readonly Interval[]): readonly Period[] {
    // Skipped wall times move forward, so mapped periods can shrink to nothing, change
    // order or overlap (02:30–02:45 → 03:30–03:45 overlaps 03:00–04:00): normalize.
    return normalizePeriods(intervals.map(([start, end]) => [this.#exact(day, start), this.#exact(day, end)]));
  }

  /** Exact time of a wall-clock time; skipped times move forward, repeated times use the earlier. */
  #exact(day: number, ns: number): bigint {
    const wall = wallPosition(day, ns);
    const segment = this.#segment;
    if (segment) {
      const candidate = wall - segment.offset;
      if (candidate >= segment.start && candidate < segment.end) return candidate;
    }
    const d = Number(floorDiv(wall, BIG_NS_PER_DAY)); // normalizes 24:00 to the next day
    const fields = wallFields(d, Number(wall - BigInt(d) * BIG_NS_PER_DAY));
    const zdt = this.#iso.with(fields, { disambiguation: 'compatible', offset: 'ignore' });
    this.#segment = segmentAround(zdt);
    return zdt.epochNanoseconds;
  }

  at(position: bigint): ZonedDateTimeLike {
    // Exact-time arithmetic; seconds + nanoseconds keeps every field a safe integer.
    const delta = position - this.origin;
    const result = this.#iso.add({
      seconds: Number(delta / BIG_NS_PER_SECOND),
      nanoseconds: Number(delta % BIG_NS_PER_SECOND),
    });
    return withCalendarId(result, this.#calendarId);
  }

  duration(ns: bigint): DurationLike {
    return durationFrom(this.#iso.until(this.#iso as never), ns);
  }
}

/** The constant-offset segment containing `zdt`, shrunk by SEGMENT_MARGIN next to real transitions. */
function segmentAround(zdt: ZonedDateTimeLike): OffsetSegment {
  // 'previous' is strictly before its receiver: ask from 1 ns later so that a transition at
  // exactly `zdt` (where 'compatible' puts every skipped wall time) is found.
  const previous = zdt.add({ nanoseconds: 1 }).getTimeZoneTransition('previous');
  const next = zdt.getTimeZoneTransition('next');
  return {
    start: previous ? previous.epochNanoseconds + SEGMENT_MARGIN : -FOREVER,
    end: next ? next.epochNanoseconds - SEGMENT_MARGIN : FOREVER,
    offset: BigInt(zdt.offsetNanoseconds),
  };
}

/** `pending ∪ periods`, sorted and merged. Appends without re-sorting in the common case. */
function addPeriods(pending: Period[], periods: readonly Period[]): Period[] {
  const first = periods[0];
  const last = periods.at(-1);
  if (first === undefined || last === undefined) return pending;
  const pendingFirst = pending[0];
  const pendingLast = pending.at(-1);
  if (pendingFirst === undefined || pendingLast === undefined) return [...periods];
  if (first[0] > pendingLast[1]) return pending.concat(periods);
  if (last[1] < pendingFirst[0]) return periods.concat(pending);
  return normalizePeriods([...pending, ...periods]);
}

function mixedTypesError(value: unknown): TypeError {
  return typeError(`start and end must be the same Temporal type, got ${describe(value)} for end`);
}

/** Runs `run` with the timeline for `value`'s type. */
function withTimeline<R>(value: DateTimeInput, run: <T>(tl: Timeline<T>) => R): R {
  if (isZonedDateTime(value)) return run(new ZonedTimeline(value));
  if (isPlainDateTime(value)) return run(new PlainTimeline(value));
  throw typeError(
    `expected a Temporal.PlainDateTime or ZonedDateTime, got ${describe(value)}` +
      (isPlainDate(value) ? ' (use the workday functions for dates)' : ''),
  );
}

function noWorkingTimeError(): RangeError {
  return rangeError(`no working time found within ${MAX_SCAN_DAYS} days — check the hours/holiday configuration`);
}

/**
 * Visits working periods in time order (reverse order when `dir` is -1), starting around
 * `from`, until `visit` returns a value. Days are read ahead into a buffer, and a period is
 * only emitted once no later day can produce an earlier one, so emitted periods are globally
 * sorted and merged even when DST shifts move periods across midnight. Throws when
 * MAX_SCAN_DAYS consecutive days have no working time, instead of looping forever.
 */
function scan<T, R>(
  cal: HoursCalendar,
  tl: Timeline<T>,
  from: bigint,
  dir: 1 | -1,
  visit: (period: Period) => R | undefined,
): R {
  let pending: Period[] = [];
  let day = Number(floorDiv(from - BigInt(dir) * tl.lookahead, BIG_NS_PER_DAY));
  for (let idle = 0; ; day += dir) {
    const periods = tl.periods(day, intervalsOn(cal, day, tl.dates));
    idle = periods.length === 0 ? idle + 1 : 0;
    if (idle > MAX_SCAN_DAYS) throw noWorkingTimeError();
    pending = addPeriods(pending, periods);
    // Every later day's periods lie beyond this frontier.
    const frontier = dir === 1 ? wallPosition(day + 1, 0) - tl.lookahead : wallPosition(day, 0) + tl.lookahead;
    for (;;) {
      const next = dir === 1 ? pending[0] : pending.at(-1);
      if (next === undefined || (dir === 1 ? next[0] >= frontier : next[1] <= frontier)) break;
      if (dir === 1) pending.shift();
      else pending.pop();
      const result = visit(next);
      if (result !== undefined) return result;
    }
  }
}

// --- Durations ----------------------------------------------------------------------------

const CALENDAR_UNITS = ['years', 'months', 'weeks', 'days'] as const;
const TIME_UNITS = [
  ['hours', BigInt(NS_PER_HOUR)],
  ['minutes', BigInt(NS_PER_MINUTE)],
  ['seconds', BigInt(NS_PER_SECOND)],
  ['milliseconds', 1_000_000n],
  ['microseconds', 1_000n],
  ['nanoseconds', 1n],
] as const;

/** Total nanoseconds of a clock-time duration. Calendar units are rejected: they have no fixed length. */
export function durationToNs(duration: DurationInput): bigint {
  if (typeof duration !== 'object' || (duration as unknown) === null) {
    throw typeError(`expected a Temporal.Duration or an object like { hours: 4 }, got ${describe(duration)}`);
  }
  let seen = false;
  for (const unit of CALENDAR_UNITS) {
    const value = duration[unit];
    if (value === undefined) continue;
    seen = true;
    if (value !== 0) throw rangeError(`${unit} are not supported in working time; use addWorkdays for whole days`);
  }
  let total = 0n;
  let sign = 0;
  for (const [unit, nsPerUnit] of TIME_UNITS) {
    const value: unknown = duration[unit];
    if (value === undefined) continue;
    seen = true;
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw rangeError(`duration ${unit} must be an integer, got ${describe(value)}`);
    }
    if (value === 0) continue;
    if (sign !== 0 && Math.sign(value) !== sign) throw rangeError('duration fields must all have the same sign');
    sign = Math.sign(value);
    total += BigInt(value) * nsPerUnit;
  }
  if (!seen) throw typeError('duration needs at least one of hours, minutes, seconds, … (e.g. { hours: 4 })');
  return total;
}

/** The duration with every field negated (validated later by durationToNs). */
function negate(duration: DurationInput): DurationInput {
  if (typeof duration !== 'object' || (duration as unknown) === null) return duration;
  const negated: Record<string, unknown> = {};
  for (const unit of [...CALENDAR_UNITS, ...TIME_UNITS.map(([u]) => u)]) {
    const value: unknown = duration[unit];
    negated[unit] = typeof value === 'number' ? -value : value;
  }
  return negated;
}

// --- Algorithms ---------------------------------------------------------------------------
// All on positions. `cursor` is the furthest position already accounted for; clipping every
// period to it makes overlapping periods (possible across DST-shifted days) count once.

function isWorkingPosition<T>(cal: HoursCalendar, tl: Timeline<T>, position: bigint): boolean {
  const first = Number(floorDiv(position - tl.lookahead, BIG_NS_PER_DAY));
  const last = Number(floorDiv(position + tl.lookahead, BIG_NS_PER_DAY));
  for (let day = first; day <= last; day++) {
    for (const [start, end] of tl.periods(day, intervalsOn(cal, day, tl.dates))) {
      if (position >= start && position < end) return true;
    }
  }
  return false;
}

function addForward<T>(cal: HoursCalendar, tl: Timeline<T>, total: bigint): T {
  let cursor = tl.origin;
  let remaining = total;
  return scan(cal, tl, tl.origin, 1, ([start, end]) => {
    const from = start > cursor ? start : cursor;
    if (end <= from) return undefined;
    if (remaining <= end - from) return tl.at(from + remaining);
    remaining -= end - from;
    cursor = end;
    return undefined;
  });
}

function addBackward<T>(cal: HoursCalendar, tl: Timeline<T>, total: bigint): T {
  let cursor = tl.origin;
  let remaining = total;
  return scan(cal, tl, tl.origin, -1, ([start, end]) => {
    const to = end < cursor ? end : cursor;
    if (to <= start) return undefined;
    if (remaining <= to - start) return tl.at(to - remaining);
    remaining -= to - start;
    cursor = start;
    return undefined;
  });
}

/** Working nanoseconds in `[a, b)`, for `a <= b`. */
function workingNsBetween<T>(cal: HoursCalendar, tl: Timeline<T>, a: bigint, b: bigint): bigint {
  let total = 0n;
  let cursor = a;
  scan(cal, tl, a, 1, ([start, end]) => {
    if (start >= b) return true; // periods come in time order: nothing more can overlap
    const from = start > cursor ? start : cursor;
    const to = end < b ? end : b;
    if (to > from) {
      total += to - from;
      cursor = to;
    }
    return undefined;
  });
  return total;
}

function rollForwardPosition<T>(cal: HoursCalendar, tl: Timeline<T>): T | undefined {
  if (isWorkingPosition(cal, tl, tl.origin)) return undefined;
  return scan(cal, tl, tl.origin, 1, ([start]) => (start > tl.origin ? tl.at(start) : undefined));
}

function rollBackwardPosition<T>(cal: HoursCalendar, tl: Timeline<T>): T | undefined {
  if (isWorkingPosition(cal, tl, tl.origin)) return undefined;
  return scan(cal, tl, tl.origin, -1, ([, end]) => (end <= tl.origin ? tl.at(end) : undefined));
}

// --- Implementations on a compiled calendar (shared with createWorkCalendar) ---------------

export function isWorkingTimeWith(cal: HoursCalendar, dateTime: DateTimeInput): boolean {
  return withTimeline(dateTime, (tl) => isWorkingPosition(cal, tl, tl.origin));
}

export function addWorkingTimeWith<T extends DateTimeInput>(
  cal: HoursCalendar,
  dateTime: T,
  duration: DurationInput,
): T {
  const total = durationToNs(duration);
  return withTimeline(dateTime, (tl) => {
    if (total === 0n) return dateTime;
    return (total > 0n ? addForward(cal, tl, total) : addBackward(cal, tl, -total)) as unknown as T;
  });
}

export function subtractWorkingTimeWith<T extends DateTimeInput>(
  cal: HoursCalendar,
  dateTime: T,
  duration: DurationInput,
): T {
  return addWorkingTimeWith(cal, dateTime, negate(duration));
}

export function workingTimeBetweenWith<T extends DateTimeInput>(cal: HoursCalendar, start: T, end: T): DurationOf<T> {
  return withTimeline(start, (tl) => {
    const a = tl.origin;
    const b = tl.positionOf(end);
    const ns = a <= b ? workingNsBetween(cal, tl, a, b) : -workingNsBetween(cal, tl, b, a);
    return tl.duration(ns) as DurationOf<T>;
  });
}

export function rollForwardToWorkingTimeWith<T extends DateTimeInput>(cal: HoursCalendar, dateTime: T): T {
  return withTimeline(dateTime, (tl) => rollForwardPosition(cal, tl) as T | undefined) ?? dateTime;
}

export function rollBackwardToWorkingTimeWith<T extends DateTimeInput>(cal: HoursCalendar, dateTime: T): T {
  return withTimeline(dateTime, (tl) => rollBackwardPosition(cal, tl) as T | undefined) ?? dateTime;
}

export function getWorkingHoursWith(cal: HoursCalendar, date: DateInput): readonly TimeRangeText[] {
  const dates = new DateFactory(toPlainDate(date));
  return formatDayHours(intervalsOn(cal, dates.epochDay, dates));
}

// --- Public functions ---------------------------------------------------------------------

/** `true` if `dateTime` is inside working hours (periods are `[start, end)`: 17:00 is not working time in 09:00–17:00). */
export function isWorkingTime(dateTime: DateTimeInput, options: WorkingTimeOptions): boolean {
  return isWorkingTimeWith(compileHoursCalendar(options), dateTime);
}

/**
 * Adds working time: only time inside working hours counts. Negative durations go back.
 * Starting outside working hours, counting begins at the next working period. Landing
 * exactly at the end of a period returns that end (`16:00 + 1h` → `17:00`, not the next morning).
 *
 * The result has the type of the input. For `ZonedDateTime`, elapsed time is exact across DST changes.
 */
export function addWorkingTime<T extends DateTimeInput>(
  dateTime: T,
  duration: DurationInput,
  options: WorkingTimeOptions,
): T {
  return addWorkingTimeWith(compileHoursCalendar(options), dateTime, duration);
}

/** Subtracts working time. Landing exactly at the start of a period returns that start. */
export function subtractWorkingTime<T extends DateTimeInput>(
  dateTime: T,
  duration: DurationInput,
  options: WorkingTimeOptions,
): T {
  return subtractWorkingTimeWith(compileHoursCalendar(options), dateTime, duration);
}

/**
 * Working time in `[start, end)` as a `Temporal.Duration` balanced up to hours (e.g. `PT27H30M`);
 * negative when `end` is before `start`. Use `.total('hours')` for a number.
 */
export function workingTimeBetween<T extends DateTimeInput>(
  start: T,
  end: NoInfer<T>,
  options: WorkingTimeOptions,
): DurationOf<T> {
  return workingTimeBetweenWith(compileHoursCalendar(options), start, end);
}

/** `dateTime` itself if it is working time, otherwise the start of the next working period. */
export function rollForwardToWorkingTime<T extends DateTimeInput>(dateTime: T, options: WorkingTimeOptions): T {
  return rollForwardToWorkingTimeWith(compileHoursCalendar(options), dateTime);
}

/** `dateTime` itself if it is working time, otherwise the end of the previous working period. */
export function rollBackwardToWorkingTime<T extends DateTimeInput>(dateTime: T, options: WorkingTimeOptions): T {
  return rollBackwardToWorkingTimeWith(compileHoursCalendar(options), dateTime);
}

/** The working periods of a date after weekends, holidays and special hours, e.g. `[['09:00', '17:00']]`. */
export function getWorkingHours(date: DateInput, options: WorkingTimeOptions): readonly TimeRangeText[] {
  return getWorkingHoursWith(compileHoursCalendar(options), date);
}
