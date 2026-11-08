// Public types. Temporal values are described structurally (only the members this
// library uses), so that native Temporal, `temporal-polyfill`, `@js-temporal/polyfill`
// and their TypeScript definitions all work without a global `Temporal` type.

/** The parts of a `Temporal.PlainDate` this library relies on. */
export interface PlainDateLike {
  readonly calendarId: string;
  readonly year: number;
  readonly month: number;
  readonly monthCode: string;
  readonly day: number;
  readonly dayOfWeek: number;
  readonly daysInMonth: number;
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

/** Which days are workdays. */
export interface WorkdayOptions {
  /** Non-working days of the week. Default `[6, 7]` (Saturday, Sunday). */
  readonly weekend?: readonly DayOfWeek[] | undefined;
  /** Holiday dates, or a function that decides whether a date is a holiday. */
  readonly holidays?: Iterable<HolidayInput> | HolidayPredicate | undefined;
  /**
   * Dates that count as workdays even if they fall on the weekend or a holiday
   * (for example, make-up working Saturdays). Single dates only.
   */
  readonly extraWorkdays?: Iterable<string | PlainDateLike> | undefined;
}

// --- Working hours -----------------------------------------------------------------------

/** The parts of a `Temporal.PlainTime` this library relies on. */
export interface PlainTimeLike {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  readonly microsecond: number;
  readonly nanosecond: number;
}

/** Calendar and clock fields, as accepted by `Temporal.PlainDateTime#with`. */
export interface DateTimeFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
  nanosecond: number;
}

/** A duration of clock time. `Temporal.Duration` and plain objects such as `{ hours: 4 }` both fit. */
export interface DurationInput {
  readonly years?: number | undefined;
  readonly months?: number | undefined;
  readonly weeks?: number | undefined;
  readonly days?: number | undefined;
  readonly hours?: number | undefined;
  readonly minutes?: number | undefined;
  readonly seconds?: number | undefined;
  readonly milliseconds?: number | undefined;
  readonly microseconds?: number | undefined;
  readonly nanoseconds?: number | undefined;
}

/** The parts of a `Temporal.Duration` this library relies on. */
export interface DurationLike {
  add(other: { seconds: number; nanoseconds: number }): DurationLike;
  round(options: { largestUnit: 'hours' }): DurationLike;
}

/** The parts of a `Temporal.PlainDateTime` this library relies on. */
export interface PlainDateTimeLike extends PlainTimeLike {
  readonly calendarId: string;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  withCalendar(calendar: string): PlainDateTimeLike;
  with(fields: DateTimeFields): PlainDateTimeLike;
  /** Only ever called as `x.until(x)` to obtain a zero Duration; `never` accepts every implementation's signature. */
  until(other: never): DurationLike;
  toPlainDate(): PlainDateLike;
  add(duration: { days: number }): PlainDateTimeLike;
}

/** The parts of a `Temporal.ZonedDateTime` this library relies on. */
export interface ZonedDateTimeLike extends PlainTimeLike {
  readonly calendarId: string;
  readonly timeZoneId: string;
  readonly epochNanoseconds: bigint;
  readonly offsetNanoseconds: number;
  readonly year: number;
  readonly month: number;
  readonly day: number;
  withCalendar(calendar: string): ZonedDateTimeLike;
  withTimeZone(timeZone: string): ZonedDateTimeLike;
  with(fields: DateTimeFields, options: { disambiguation: 'compatible'; offset: 'ignore' }): ZonedDateTimeLike;
  /** Only ever called as `x.until(x)` to obtain a zero Duration; `never` accepts every implementation's signature. */
  until(other: never): DurationLike;
  toPlainDate(): PlainDateLike;
  add(duration: { days?: number; seconds?: number; nanoseconds?: number }): ZonedDateTimeLike;
  getTimeZoneTransition(direction: 'next' | 'previous'): ZonedDateTimeLike | null;
}

/** A date with a time of day: `Temporal.PlainDateTime` or `Temporal.ZonedDateTime`. */
export type DateTimeInput = PlainDateTimeLike | ZonedDateTimeLike;

/** The `Temporal.Duration` type of the Temporal implementation that `T` comes from. */
export type DurationOf<T> = T extends { until(...args: never[]): infer D } ? D : never;

/** A time of day: `'HH:MM'`, `'HH:MM:SS'`, `'HH:MM:SS.fffffffff'` or a `Temporal.PlainTime`. */
export type TimeInput = string | PlainTimeLike;

/** A working period within one day, `[start, end)`. `'24:00'` is allowed as an end. */
export type TimeRange = readonly [start: TimeInput, end: TimeInput];

/** The working periods of one day, e.g. `[['09:00', '12:00'], ['13:00', '17:00']]`. */
export type DayHours = readonly TimeRange[];

/** A normalized working period as returned by this library, e.g. `['09:00', '17:30']`. */
export type TimeRangeText = readonly [start: string, end: string];

/** Hours per ISO day of week (1 = Monday … 7 = Sunday); `default` applies to days not listed. */
export type WeeklyHours = Readonly<Partial<Record<DayOfWeek, DayHours>>> & { readonly default?: DayHours };

/** The same hours on every workday, or hours per day of week. */
export type WorkingHours = DayHours | WeeklyHours;

/**
 * Decides the hours of a specific date. Receives an ISO `Temporal.PlainDate` and that date's
 * regular hours (empty on weekends and holidays). Return `undefined` to keep the regular hours,
 * `[]` to close, or other hours.
 */
export type SpecialHoursFunction = {
  bivarianceHack(date: PlainDateLike, regular: readonly TimeRangeText[]): DayHours | undefined;
}['bivarianceHack'];

/** Hours for specific dates, keyed by `'YYYY-MM-DD'` (`[]` = closed), or a function. */
export type SpecialHours = Readonly<Record<string, DayHours>> | SpecialHoursFunction;

/** Workdays plus working hours, for the working-time functions. */
export interface WorkingTimeOptions extends WorkdayOptions {
  /** Working hours on workdays. Weekends and holidays have no working hours. */
  readonly hours: WorkingHours;
  /** Overrides for specific dates (half days, extended hours, closures). Takes precedence over everything else. */
  readonly specialHours?: SpecialHours | undefined;
}
