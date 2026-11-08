// Times of day as integer nanoseconds since midnight, and normalized daily intervals.

import { describe, rangeError, typeError } from './errors.js';
import { hasBrand } from './temporal.js';
import type { PlainTimeLike, TimeInput, TimeRange, TimeRangeText } from './types.js';

export const NS_PER_SECOND = 1_000_000_000;
export const NS_PER_MINUTE = 60 * NS_PER_SECOND;
export const NS_PER_HOUR = 60 * NS_PER_MINUTE;
export const NS_PER_DAY = 24 * NS_PER_HOUR;

/** A half-open interval `[start, end)` within one day, in nanoseconds since midnight. */
export type Interval = readonly [start: number, end: number];

const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?$/;

export function nsOfDay(hour: number, minute: number, second = 0, subsecondNs = 0): number {
  return hour * NS_PER_HOUR + minute * NS_PER_MINUTE + second * NS_PER_SECOND + subsecondNs;
}

/** Nanoseconds since midnight of a `Temporal.PlainTime`/`PlainDateTime`/`ZonedDateTime`. */
export function nsOfTime(t: PlainTimeLike): number {
  return nsOfDay(t.hour, t.minute, t.second, t.millisecond * 1_000_000 + t.microsecond * 1_000 + t.nanosecond);
}

/** Parses `'HH:MM'`, `'HH:MM:SS'`, `'HH:MM:SS.fffffffff'` or a `Temporal.PlainTime`. `24:00` is midnight at the end. */
export function parseTime(value: TimeInput): number {
  if (typeof value === 'string') {
    const m = TIME_RE.exec(value);
    if (m) {
      const [hour, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
      const subsecond = Number((m[4] ?? '').padEnd(9, '0'));
      const ns = nsOfDay(hour, minute, second, subsecond);
      if (minute < 60 && second < 60 && ns <= NS_PER_DAY) return ns;
    }
    throw rangeError(`expected a time like "09:30" (00:00 – 24:00), got ${describe(value)}`);
  }
  if (hasBrand(value, 'Temporal.PlainTime')) return nsOfTime(value);
  throw typeError(`expected a "HH:MM" string or Temporal.PlainTime, got ${describe(value)}`);
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Shortest of `HH:MM`, `HH:MM:SS`, `HH:MM:SS.fff…` that represents `ns` exactly. */
export function formatTime(ns: number): string {
  const hour = Math.floor(ns / NS_PER_HOUR);
  const minute = Math.floor((ns % NS_PER_HOUR) / NS_PER_MINUTE);
  const second = Math.floor((ns % NS_PER_MINUTE) / NS_PER_SECOND);
  const fraction = ns % NS_PER_SECOND;
  let text = `${pad(hour)}:${pad(minute)}`;
  if (second !== 0 || fraction !== 0) text += `:${pad(second)}`;
  if (fraction !== 0) text += `.${pad(fraction, 9).replace(/0+$/, '')}`;
  return text;
}

/**
 * Validates and normalizes one day's ranges: sorted, non-empty, non-overlapping, with
 * touching ranges merged. Throws on `start >= end` or on overlaps (likely a typo).
 */
export function parseDayHours(value: unknown, where: string): readonly Interval[] {
  if (!Array.isArray(value))
    throw typeError(`${where} must be an array of [start, end] ranges, got ${describe(value)}`);
  const ranges = (value as readonly unknown[]).map((range): Interval => {
    if (!Array.isArray(range) || range.length !== 2) {
      throw typeError(`${where}: each range must be a [start, end] pair, got ${describe(range)}`);
    }
    const [start, end] = range as unknown as TimeRange;
    const interval: Interval = [parseTime(start), parseTime(end)];
    if (interval[0] >= interval[1]) {
      throw rangeError(`${where}: range start must be before its end, got ${describe(start)}–${describe(end)}`);
    }
    return interval;
  });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start < last[1]) {
      throw rangeError(
        `${where}: ranges overlap (${formatTime(last[0])}–${formatTime(last[1])} and ${formatTime(start)}–${formatTime(end)})`,
      );
    }
    if (last?.[1] === start) last[1] = end;
    else merged.push([start, end]);
  }
  return merged;
}

export function formatDayHours(intervals: readonly Interval[]): readonly TimeRangeText[] {
  return intervals.map(([start, end]) => [formatTime(start), formatTime(end)] as const);
}
