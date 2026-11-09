// Holiday rules (fixed dates, nth weekdays, Easter-relative) and observed-day substitution,
// all on integer epoch days. Each year's holidays are computed once and cached.

import { dayOfWeekFromEpochDay, daysInMonth, epochDayFromIso } from './epoch.js';
import { describe, rangeError, typeError } from './errors.js';
import { epochDayOf, hasBrand, isPlainDate } from './temporal.js';
import type { DayOfWeek, HolidayInput, Observance, PlainMonthDayLike } from './types.js';

type RuleKind =
  | { readonly kind: 'date'; readonly epochDay: number }
  | { readonly kind: 'fixed'; readonly month: number; readonly day: number }
  | { readonly kind: 'nth'; readonly month: number; readonly dayOfWeek: DayOfWeek; readonly week: number }
  | { readonly kind: 'easter'; readonly orthodox: boolean };

export type CompiledRule = RuleKind & {
  readonly offset: number;
  readonly from: number;
  readonly to: number;
  /** `undefined`: use the calendar's setting. */
  readonly observed: Observance | undefined;
};

const DATE_RE = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAY_RE = /^(?:--)?(\d{2})-(\d{2})$/;
const OBSERVANCES: ReadonlySet<string> = new Set(['nearest', 'next', 'previous', 'none']);
const RULE_KEYS: ReadonlySet<string> = new Set([
  'name',
  'offset',
  'from',
  'to',
  'observed',
  'date',
  'month',
  'day',
  'dayOfWeek',
  'week',
  'easter',
  'orthodox',
]);
const NO_YEAR_LIMIT = { from: -Infinity, to: Infinity } as const;

function checkDate(year: number, month: number, day: number, source: unknown): void {
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
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

export function parseObservance(value: unknown, where: string): Observance {
  if (typeof value !== 'string' || !OBSERVANCES.has(value)) {
    throw rangeError(`${where} must be 'nearest', 'next', 'previous' or 'none', got ${describe(value)}`);
  }
  return value as Observance;
}

function integerField(rule: Record<string, unknown>, key: string, min: number, max: number): number {
  const v = rule[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw rangeError(`holiday rule \`${key}\` must be an integer from ${min} to ${max}, got ${describe(v)}`);
  }
  return v;
}

function compileRuleObject(rule: Record<string, unknown>): CompiledRule {
  for (const key of Object.keys(rule)) {
    if (!RULE_KEYS.has(key)) throw typeError(`unknown holiday rule field ${JSON.stringify(key)}`);
  }
  if (rule['name'] !== undefined && typeof rule['name'] !== 'string') {
    throw typeError(`holiday rule \`name\` must be a string, got ${describe(rule['name'])}`);
  }
  const offset = rule['offset'] === undefined ? 0 : integerField(rule, 'offset', -366, 366);
  const from = rule['from'] === undefined ? -Infinity : integerField(rule, 'from', -271820, 275759);
  const to = rule['to'] === undefined ? Infinity : integerField(rule, 'to', -271820, 275759);
  if (from > to) throw rangeError(`holiday rule \`from\` (${from}) is after \`to\` (${to})`);
  const observed =
    rule['observed'] === undefined ? undefined : parseObservance(rule['observed'], 'holiday rule `observed`');
  const common = { offset, from, to, observed };

  const shapes = (['date', 'easter', 'dayOfWeek', 'day'] as const).filter((k) => rule[k] !== undefined);
  if (shapes.length !== 1) {
    throw typeError(
      `a holiday rule needs exactly one of { date }, { month, day }, { month, dayOfWeek, week } or { easter }, got ${describe(rule)}`,
    );
  }
  const [shape] = shapes as unknown as [(typeof shapes)[number]];
  switch (shape) {
    case 'date':
      return { kind: 'date', epochDay: parseDate(rule['date']), ...common };
    case 'easter': {
      if (rule['orthodox'] !== undefined && typeof rule['orthodox'] !== 'boolean') {
        throw typeError(`holiday rule \`orthodox\` must be a boolean, got ${describe(rule['orthodox'])}`);
      }
      // `easter` is the offset from Easter Sunday; `offset` adds to it.
      return {
        kind: 'easter',
        orthodox: rule['orthodox'] === true,
        ...common,
        offset: offset + integerField(rule, 'easter', -366, 366),
      };
    }
    case 'dayOfWeek': {
      const month = integerField(rule, 'month', 1, 12);
      const dayOfWeek = integerField(rule, 'dayOfWeek', 1, 7) as DayOfWeek;
      const week = integerField(rule, 'week', -5, 5);
      if (week === 0) throw rangeError('holiday rule `week` must be 1 to 5, or -1 to -5 counting from the end');
      return { kind: 'nth', month, dayOfWeek, week, ...common };
    }
    case 'day': {
      const month = integerField(rule, 'month', 1, 12);
      const day = integerField(rule, 'day', 1, 31);
      checkDate(2000, month, day, rule); // a leap year, so that Feb 29 is accepted
      return { kind: 'fixed', month, day, ...common };
    }
  }
}

/** Compiles one entry of the `holidays` option. */
export function compileHoliday(entry: HolidayInput): CompiledRule {
  const plain = { offset: 0, ...NO_YEAR_LIMIT, observed: undefined };
  if (typeof entry === 'string') {
    const md = MONTH_DAY_RE.exec(entry);
    if (md) {
      const [month, day] = [Number(md[1]), Number(md[2])];
      checkDate(2000, month, day, entry);
      return { kind: 'fixed', month, day, ...plain };
    }
    return { kind: 'date', epochDay: parseDate(entry), ...plain };
  }
  if (isPlainDate(entry)) return { kind: 'date', epochDay: epochDayOf(entry), ...plain };
  if (hasBrand(entry, 'Temporal.PlainMonthDay')) {
    const pmd = entry as PlainMonthDayLike;
    if (pmd.calendarId !== 'iso8601') throw rangeError('Temporal.PlainMonthDay holidays must use the iso8601 calendar');
    return { kind: 'fixed', month: Number(pmd.monthCode.slice(1)), day: pmd.day, ...plain };
  }
  if (typeof entry === 'object' && (entry as unknown) !== null && !Array.isArray(entry)) {
    return compileRuleObject(entry as unknown as Record<string, unknown>);
  }
  throw typeError(
    `expected a holiday date, "MM-DD", Temporal.PlainDate/PlainMonthDay or rule object, got ${describe(entry)}`,
  );
}

// --- Dates of a rule in a year ------------------------------------------------------------

/** Western (Gregorian) Easter Sunday: the anonymous Gregorian algorithm (Meeus/Jones/Butcher). */
export function westernEaster(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return epochDayFromIso(year, month, day);
}

/** Orthodox Easter Sunday as a Gregorian date: Meeus' Julian algorithm, converted via Julian day numbers. */
export function orthodoxEaster(year: number): number {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  // Julian calendar date → Julian day number → epoch day (JDN 2440588 = 1970-01-01).
  const t = Math.floor((14 - month) / 12);
  const y = year + 4800 - t;
  const mm = month + 12 * t - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jdn - 2440588;
}

/** The `week`-th `dayOfWeek` of a month (negative counts from the end), or undefined if it doesn't exist. */
function nthWeekday(year: number, month: number, dayOfWeek: DayOfWeek, week: number): number | undefined {
  const length = daysInMonth(year, month);
  if (week > 0) {
    const first = epochDayFromIso(year, month, 1);
    const day = 1 + ((dayOfWeek - dayOfWeekFromEpochDay(first) + 7) % 7) + (week - 1) * 7;
    return day <= length ? first + day - 1 : undefined;
  }
  const last = epochDayFromIso(year, month, length);
  const day = length - ((dayOfWeekFromEpochDay(last) - dayOfWeek + 7) % 7) + (week + 1) * 7;
  return day >= 1 ? last - (length - day) : undefined;
}

/** The epoch day of `rule` in `year` (the year the rule is evaluated for), or undefined. */
export function ruleDayInYear(rule: CompiledRule, year: number): number | undefined {
  if (year < rule.from || year > rule.to) return undefined;
  let base: number | undefined;
  switch (rule.kind) {
    case 'date':
      // Callers hand date rules only to the year they fall in (see DayCalendar.byYear).
      base = rule.epochDay;
      break;
    case 'fixed':
      base = rule.day <= daysInMonth(year, rule.month) ? epochDayFromIso(year, rule.month, rule.day) : undefined;
      break;
    case 'nth':
      base = nthWeekday(year, rule.month, rule.dayOfWeek, rule.week);
      break;
    case 'easter':
      base = rule.orthodox ? orthodoxEaster(year) : westernEaster(year);
      break;
  }
  return base === undefined ? undefined : base + rule.offset;
}

// --- Observed days ------------------------------------------------------------------------

/** Longest distance searched for a free day to observe a holiday on. */
const MAX_OBSERVE_SHIFT = 14;

function observedDay(
  day: number,
  mode: Observance,
  isWeekend: (d: number) => boolean,
  taken: ReadonlySet<number>,
): number | undefined {
  const free = (d: number): boolean => !isWeekend(d) && !taken.has(d);
  for (let distance = 1; distance <= MAX_OBSERVE_SHIFT; distance++) {
    if (mode === 'next' && free(day + distance)) return day + distance;
    if (mode === 'previous' && free(day - distance)) return day - distance;
    if (mode === 'nearest') {
      const before = free(day - distance);
      const after = free(day + distance);
      // Ties go forward (a Sunday holiday with a Sunday-only weekend moves to Monday).
      if (after) return day + distance;
      if (before) return day - distance;
    }
  }
  return undefined;
}

/**
 * All holiday epoch days that fall in `year`, including observed substitutes. Rules are
 * evaluated for the neighbouring years too, because substitutes can cross a year boundary
 * (US: New Year's Day on Saturday 2022-01-01 was observed on Friday 2021-12-31).
 */
export function holidaysOfYear(
  rulesFor: (year: number) => readonly CompiledRule[],
  year: number,
  defaultObserved: Observance,
  isWeekend: (epochDay: number) => boolean,
): Set<number> {
  const occurrences: { day: number; mode: Observance }[] = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const rule of rulesFor(y)) {
      const day = ruleDayInYear(rule, y);
      if (day !== undefined) occurrences.push({ day, mode: rule.observed ?? defaultObserved });
    }
  }
  occurrences.sort((a, b) => a.day - b.day);
  const taken = new Set(occurrences.map((o) => o.day));
  for (const { day, mode } of occurrences) {
    if (mode === 'none' || !isWeekend(day)) continue;
    const substitute = observedDay(day, mode, isWeekend, taken);
    if (substitute !== undefined) taken.add(substitute);
  }
  const first = epochDayFromIso(year, 1, 1);
  const last = epochDayFromIso(year, 12, 31);
  return new Set([...taken].filter((d) => d >= first && d <= last));
}
