// Adapter for the `date-holidays` package (https://www.npmjs.com/package/date-holidays).
//
// It is duck-typed, so this library does not depend on date-holidays. Holidays are read
// from `getHolidays(year)` and its `date` strings ("2026-12-24 14:00:00"), which give the
// local date and time in the holiday's own region whatever the machine's time zone is.
// (`isHoliday(date)` is avoided: it interprets dates in the machine's time zone.)

import { epochDayFromIso, floorDiv } from './epoch.js';
import { describe, rangeError, typeError } from './errors.js';
import { epochDayOf, toIsoDate } from './temporal.js';
import {
  formatDayHours,
  type Interval,
  NS_PER_DAY,
  NS_PER_HOUR,
  NS_PER_MINUTE,
  parseDayHours,
  subtractInterval,
} from './time.js';
import type { HolidayPredicate, PlainDateLike, SpecialHoursFunction, TimeRangeText } from './types.js';

/** The parts of a `date-holidays` holiday this adapter uses. */
export interface DateHolidaysEntry {
  /** Local start, `'YYYY-MM-DD hh:mm:ss'`, optionally with a `' -0600'`-style shift (eve-start holidays). */
  readonly date: string;
  /** `'public'`, `'bank'`, `'school'`, `'optional'` or `'observance'`. */
  readonly type: string;
  readonly start: Date;
  readonly end: Date;
}

/** The parts of a `date-holidays` `Holidays` instance this adapter uses. */
export interface DateHolidaysSource {
  getHolidays(year: number): readonly DateHolidaysEntry[];
}

export interface FromDateHolidaysOptions {
  /** Holiday types that close the business. Default `['public']`. */
  readonly types?: readonly string[] | undefined;
}

/** Spread into calendar options: `createWorkCalendar({ ...fromDateHolidays(hd), hours })`. */
export interface DateHolidaysOptions {
  /** `true` for dates that a holiday covers completely. */
  readonly holidays: HolidayPredicate;
  /** Regular hours minus partial-day closures (e.g. closing at 14:00 on Christmas Eve). */
  readonly specialHours: SpecialHoursFunction;
}

const ENTRY_DATE_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?: ([+-])(\d{2})(\d{2}))?$/;
const DAY = BigInt(NS_PER_DAY);
/** Holidays spanning a DST change last 23 or 25 hours; ends this close to midnight snap to it. */
const SNAP = 90n * BigInt(NS_PER_MINUTE);

/** What the loaded holidays cover. */
interface Coverage {
  /** Dates covered completely, as epoch days. */
  readonly full: Set<number>;
  /** Partial closures per epoch day, in nanoseconds since midnight. */
  readonly partial: Map<number, Interval[]>;
}

/** The holiday as a wall-clock span `[start, end)` in nanoseconds since 1970-01-01T00:00 (wall). */
function wallSpan(entry: DateHolidaysEntry): [bigint, bigint] {
  const m = ENTRY_DATE_RE.exec(entry.date);
  if (!m) throw rangeError(`unexpected date-holidays date ${describe(entry.date)}`);
  const n = (i: number): number => Number(m[i]);
  const shiftSign = m[7] === '-' ? -1 : 1;
  const shift = m[7] === undefined ? 0 : shiftSign * (n(8) * NS_PER_HOUR + n(9) * NS_PER_MINUTE);
  const timeNs = n(4) * NS_PER_HOUR + n(5) * NS_PER_MINUTE + n(6) * 1_000_000_000 + shift;
  const start = BigInt(epochDayFromIso(n(1), n(2), n(3))) * DAY + BigInt(timeNs);
  const durationMs = entry.end.getTime() - entry.start.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw rangeError(`date-holidays entry ${describe(entry.date)} has no valid start/end`);
  }
  let end = start + BigInt(durationMs) * 1_000_000n;
  const nearestMidnight = floorDiv(end + DAY / 2n, DAY) * DAY;
  const distance = end - nearestMidnight;
  if (distance !== 0n && distance > -SNAP && distance < SNAP) end = nearestMidnight;
  return [start, end];
}

function addSpan(data: Coverage, [start, end]: [bigint, bigint]): void {
  for (let day = floorDiv(start, DAY); day * DAY < end; day++) {
    const dayStart = day * DAY;
    const from = start > dayStart ? start - dayStart : 0n;
    const to = end < dayStart + DAY ? end - dayStart : DAY;
    const epochDay = Number(day);
    if (from === 0n && to === DAY) {
      data.full.add(epochDay);
    } else {
      const list = data.partial.get(epochDay) ?? [];
      list.push([Number(from), Number(to)]);
      data.partial.set(epochDay, list);
    }
  }
}

/**
 * Turns a `date-holidays` instance into `holidays` and `specialHours` options:
 *
 * ```ts
 * import Holidays from 'date-holidays';
 * const cal = createWorkCalendar({
 *   ...fromDateHolidays(new Holidays('DE', 'BY'), { types: ['public', 'bank'] }),
 *   hours: [['09:00', '17:00']],
 * });
 * ```
 *
 * Days a holiday covers completely are holidays. Days it covers partly (Christmas Eve from
 * 14:00) stay workdays with reduced hours. Holidays that `date-holidays` starts on the
 * evening before (Hijri and Hebrew calendar holidays) are taken as it reports them.
 * Results are cached per year.
 */
export function fromDateHolidays(
  source: DateHolidaysSource,
  options: FromDateHolidaysOptions = {},
): DateHolidaysOptions {
  if (typeof (source as Partial<DateHolidaysSource> | null)?.getHolidays !== 'function') {
    throw typeError(`expected a date-holidays instance (with getHolidays), got ${describe(source)}`);
  }
  const typesOption: unknown = options.types ?? ['public'];
  if (!Array.isArray(typesOption) || !typesOption.every((t) => typeof t === 'string')) {
    throw typeError(`types must be an array of strings, got ${describe(typesOption)}`);
  }
  const types = new Set<string>(typesOption);

  const loaded = new Set<number>();
  const known: Coverage = { full: new Set(), partial: new Map() };
  // A holiday dated in one year can reach into the previous one (eve-start on Jan 1) or the next.
  const ensure = (date: PlainDateLike): number => {
    const iso = toIsoDate(date);
    for (const year of [iso.year - 1, iso.year, iso.year + 1]) {
      if (loaded.has(year)) continue;
      loaded.add(year);
      for (const entry of source.getHolidays(year)) {
        if (types.has(entry.type)) addSpan(known, wallSpan(entry));
      }
    }
    return epochDayOf(iso);
  };

  return {
    holidays: (date) => known.full.has(ensure(date)),
    specialHours: (date, regular: readonly TimeRangeText[]) => {
      const day = ensure(date);
      if (known.full.has(day)) return undefined;
      const closures = known.partial.get(day);
      if (!closures) return undefined;
      let open = parseDayHours(regular, 'regular hours');
      for (const [from, to] of closures) open = subtractInterval(open, from, to);
      return formatDayHours(open);
    },
  };
}
