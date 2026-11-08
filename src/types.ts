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
