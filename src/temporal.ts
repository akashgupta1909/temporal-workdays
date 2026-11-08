// Runtime helpers for working with Temporal values from any implementation.

import { epochDayFromIso } from './epoch.js';
import { describe, typeError } from './errors.js';
import type { DateInput, PlainDateLike } from './types.js';

/** The `Symbol.toStringTag` brand of a Temporal object, e.g. `'Temporal.PlainDate'`. */
export function hasBrand(value: unknown, brand: string): boolean {
  return typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === `[object ${brand}]`;
}

export function isPlainDate(value: unknown): value is PlainDateLike {
  return hasBrand(value, 'Temporal.PlainDate');
}

/** The calendar date of a PlainDate / PlainDateTime / ZonedDateTime input. */
export function toPlainDate(date: DateInput): PlainDateLike {
  if (isPlainDate(date)) return date;
  if (hasBrand(date, 'Temporal.PlainDateTime') || hasBrand(date, 'Temporal.ZonedDateTime')) {
    return date.toPlainDate();
  }
  throw typeError(`expected a Temporal.PlainDate, PlainDateTime or ZonedDateTime, got ${describe(date)}`);
}

export function toIsoDate(date: PlainDateLike): PlainDateLike {
  return date.calendarId === 'iso8601' ? date : date.withCalendar('iso8601');
}

/** Days since 1970-01-01 of the date's ISO calendar date. */
export function epochDayOf(date: PlainDateLike): number {
  const iso = toIsoDate(date);
  return epochDayFromIso(iso.year, iso.month, iso.day);
}

/**
 * Turns epoch days back into ISO `PlainDate`s of the same Temporal implementation as
 * a reference date. Only used when user code (a holiday predicate) needs a real date.
 */
export class DateFactory {
  readonly #iso: PlainDateLike;
  readonly #epochDay: number;

  constructor(reference: PlainDateLike) {
    this.#iso = toIsoDate(reference);
    this.#epochDay = epochDayFromIso(this.#iso.year, this.#iso.month, this.#iso.day);
  }

  get epochDay(): number {
    return this.#epochDay;
  }

  at(epochDay: number): PlainDateLike {
    return epochDay === this.#epochDay ? this.#iso : this.#iso.add({ days: epochDay - this.#epochDay });
  }
}
