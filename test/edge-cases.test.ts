// Edge cases found by mutation testing (npm run test:mutation): exact error messages, regex
// anchors, boundaries and inputs that the example and property tests don't reach.
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { describe as describeValue } from '../src/errors.js';
import {
  addWorkdays,
  addWorkingTime,
  createWorkCalendar,
  fromDateHolidays,
  getWorkingHours,
  isWorkday,
  isWorkingTime,
  subtractWorkingTime,
  workingTimeBetween,
  type DateHolidaysSource,
} from '../src/index.js';

const date = Temporal.PlainDate.from('2026-01-05');
const dt = (s: string) => Temporal.PlainDateTime.from(s);
const office = { hours: [['09:00', '17:00']] } as const;

describe('error messages', () => {
  const cases: [string, () => unknown, ErrorConstructor, string][] = [
    [
      'weekend',
      () => isWorkday(date, { weekend: [9 as never] }),
      RangeError,
      'weekend days must be integers 1 (Mon) – 7 (Sun), got 9',
    ],
    [
      'month',
      () => isWorkday(date, { holidays: [{ month: 0, day: 1 }] }),
      RangeError,
      'holiday rule `month` must be an integer from 1 to 12, got 0',
    ],
    [
      'day',
      () => isWorkday(date, { holidays: [{ month: 1, day: 32 }] }),
      RangeError,
      'holiday rule `day` must be an integer from 1 to 31, got 32',
    ],
    [
      'impossible rule',
      () => isWorkday(date, { holidays: [{ month: 2, day: 30 }] }),
      RangeError,
      'invalid date in holiday rule { month: 2, day: 30 }',
    ],
    ['impossible MM-DD', () => isWorkday(date, { holidays: ['02-30'] }), RangeError, 'invalid date "02-30"'],
    ['month 00', () => isWorkday(date, { holidays: ['00-05'] }), RangeError, 'invalid date "00-05"'],
    ['day 00', () => isWorkday(date, { holidays: ['2026-01-00'] }), RangeError, 'invalid date "2026-01-00"'],
    [
      'holiday string',
      () => isWorkday(date, { holidays: ['01-01x'] }),
      RangeError,
      'expected a "YYYY-MM-DD" or "MM-DD" date, got "01-01x"',
    ],
    [
      'date string',
      () => isWorkday(date, { extraWorkdays: ['2026-01-01x'] }),
      RangeError,
      'expected a "YYYY-MM-DD" date, got "2026-01-01x"',
    ],
    [
      'date type',
      () => isWorkday(date, { holidays: [{ date: 5 as never }] }),
      TypeError,
      'expected a "YYYY-MM-DD" string or Temporal.PlainDate, got 5',
    ],
    [
      'observed',
      () => isWorkday(date, { observed: 'sometimes' as never }),
      RangeError,
      "observed must be 'nearest', 'next', 'previous' or 'none', got \"sometimes\"",
    ],
    [
      'rule observed',
      () => isWorkday(date, { holidays: [{ month: 1, day: 1, observed: 5 as never }] }),
      RangeError,
      "holiday rule `observed` must be 'nearest', 'next', 'previous' or 'none', got 5",
    ],
    [
      'offset',
      () => isWorkday(date, { holidays: [{ month: 1, day: 1, offset: 1.5 }] }),
      RangeError,
      'holiday rule `offset` must be an integer from -366 to 366, got 1.5',
    ],
    [
      'from after to',
      () => isWorkday(date, { holidays: [{ month: 1, day: 1, from: 2027, to: 2026 }] }),
      RangeError,
      'holiday rule `from` (2027) is after `to` (2026)',
    ],
    [
      'name',
      () => isWorkday(date, { holidays: [{ month: 1, day: 1, name: 5 as never }] }),
      TypeError,
      'holiday rule `name` must be a string, got 5',
    ],
    [
      'hours',
      () => isWorkingTime(dt('2026-01-05T10:00'), { hours: null as never }),
      TypeError,
      'hours must be an array of ranges or an object by day of week, got null',
    ],
    [
      'specialHours',
      () => isWorkingTime(dt('2026-01-05T10:00'), { ...office, specialHours: [] as never }),
      TypeError,
      'specialHours must be an object keyed by date or a function, got [object Array]',
    ],
    ['options', () => isWorkingTime(dt('2026-01-05T10:00'), 5 as never), TypeError, 'options must be an object, got 5'],
    ['calendar options', () => createWorkCalendar(5 as never), TypeError, 'options must be an object, got 5'],
    [
      'duration',
      () => addWorkingTime(dt('2026-01-05T10:00'), null as never, office),
      TypeError,
      'expected a Temporal.Duration or an object like { hours: 4 }, got null',
    ],
    [
      'duration field',
      () => addWorkingTime(dt('2026-01-05T10:00'), { hours: 1.5 }, office),
      RangeError,
      'duration hours must be an integer, got 1.5',
    ],
    [
      'between options',
      () => workingTimeBetween(dt('2026-01-05T10:00'), dt('2026-01-05T11:00'), office, null as never),
      TypeError,
      'workingTimeBetween options must be an object, got null',
    ],
    [
      'time',
      () => isWorkingTime(dt('2026-01-05T10:00'), { hours: [['x09:00', '17:00']] }),
      RangeError,
      'expected a time like "09:30" (00:00 – 24:00), got "x09:00"',
    ],
    [
      'mixed types',
      () => workingTimeBetween(dt('2026-01-05T10:00'), date as never, office),
      TypeError,
      'start and end must be the same Temporal type, got [object Temporal.PlainDate] for end',
    ],
    [
      'not Temporal',
      () => isWorkday('2026-01-01' as never),
      TypeError,
      'expected a Temporal.PlainDate, PlainDateTime or ZonedDateTime, got "2026-01-01"',
    ],
    [
      'no workday',
      () => addWorkdays(date, 1, { weekend: [1, 2, 3, 4, 5, 6, 7] }),
      RangeError,
      'no workday found within 7320 days',
    ],
    [
      'no working time',
      () => addWorkingTime(dt('2026-01-05T10:00'), { hours: 1 }, { hours: [] }),
      RangeError,
      'no working time found within 7320 days',
    ],
  ];

  it.each(cases)('%s', (_, run, type, message) => {
    expect(run).toThrow(type);
    expect(run).toThrow(`temporal-workdays: ${message}`);
  });

  it('describes numbers and booleans', () => {
    expect(describeValue(1.5)).toBe('1.5');
    expect(describeValue(false)).toBe('false');
  });
});

describe('input formats', () => {
  it('rejects time fractions longer than nanoseconds', () => {
    expect(() => getWorkingHours(date, { hours: [['09:00:00.1234567891', '17:00']] })).toThrow(RangeError);
    expect(getWorkingHours(date, { hours: [['09:00:00.123456789', '17:00']] })).toEqual([
      ['09:00:00.123456789', '17:00'],
    ]);
  });

  it('keeps seconds and sub-second parts of times', () => {
    const hours = [
      ['09:00:00.105', '17:00:30'],
      [Temporal.PlainTime.from('18:00:00.001002003'), '19:00'],
    ] as const;
    expect(getWorkingHours(date, { hours })).toEqual([
      ['09:00:00.105', '17:00:30'],
      ['18:00:00.001002003', '19:00'],
    ]);
  });

  it('accepts a holiday rule limited to a single year', () => {
    const rule = { month: 1, day: 1, from: 2026, to: 2026 };
    expect(isWorkday(Temporal.PlainDate.from('2026-01-01'), { holidays: [rule] })).toBe(false);
    expect(isWorkday(Temporal.PlainDate.from('2027-01-01'), { holidays: [rule] })).toBe(true);
  });

  it('treats a duration of zero calendar units as no time', () => {
    expect(addWorkingTime(dt('2026-11-10T10:00'), { days: 0 }, office).toString()).toBe('2026-11-10T10:00:00');
  });
});

describe('working time edges', () => {
  it('counts overlap between a night shift and the next morning once', () => {
    const options = {
      hours: [
        ['22:00', '10:00'],
        ['08:00', '12:00'],
      ],
    } as const;
    // Tuesday: 00:00–12:00 (Monday's shift, then the morning) and 22:00–24:00.
    expect(workingTimeBetween(dt('2026-11-10T00:00'), dt('2026-11-11T00:00'), options).toString()).toBe('PT14H');
    expect(isWorkingTime(dt('2026-11-10T11:00'), options)).toBe(true);
    expect(addWorkingTime(dt('2026-11-10T07:00'), { hours: 4 }, options).toString()).toBe('2026-11-10T11:00:00');
    expect(subtractWorkingTime(dt('2026-11-10T12:00'), { hours: 5 }, options).toString()).toBe('2026-11-10T07:00:00');
  });

  it('ignores pauses outside the range', () => {
    const a = dt('2026-11-10T10:00');
    const b = dt('2026-11-10T15:00');
    const pauses = [
      [dt('2026-11-09T10:00'), dt('2026-11-09T12:00')],
      [dt('2026-11-11T10:00'), dt('2026-11-11T12:00')],
    ] as const;
    expect(workingTimeBetween(a, b, office, { pauses }).toString()).toBe('PT5H');
    expect(workingTimeBetween(b, a, office, { pauses }).toString()).toBe('-PT5H');
  });

  it('adds working time spanning decades', () => {
    const always = { hours: [['00:00', '24:00']], weekend: [] } as const;
    expect(addWorkingTime(dt('2026-01-01T00:00'), { hours: 24 * 365 * 30 }, always).toString()).toBe(
      '2055-12-25T00:00:00',
    );
  });
});

describe('date-holidays entries', () => {
  const source = (date: string, hours: number): DateHolidaysSource => ({
    getHolidays: () => [{ date, type: 'public', start: new Date(0), end: new Date(hours * 3600_000) }],
  });
  const hoursOn = (entry: string, hours: number, day = '2026-06-01') =>
    getWorkingHours(Temporal.PlainDate.from(day), { ...fromDateHolidays(source(entry, hours)), ...office });
  const holidayOn = (entry: string, hours: number) =>
    !isWorkday(Temporal.PlainDate.from('2026-06-01'), fromDateHolidays(source(entry, hours)));

  it('applies shifts with minutes, in both directions', () => {
    expect(hoursOn('2026-06-01 00:00:00 +1230', 2)).toEqual([
      ['09:00', '12:30'],
      ['14:30', '17:00'],
    ]);
    expect(hoursOn('2026-06-01 16:00:00 -0530', 2)).toEqual([
      ['09:00', '10:30'],
      ['12:30', '17:00'],
    ]);
  });

  it('keeps seconds in start times', () => {
    expect(hoursOn('2026-06-01 13:00:30', 1)).toEqual([
      ['09:00', '13:00:30'],
      ['14:00:30', '17:00'],
    ]);
  });

  it('rejects dates with extra text', () => {
    expect(() => hoursOn('x2026-06-01 13:00:00', 1)).toThrow('unexpected date-holidays date "x2026-06-01 13:00:00"');
    expect(() => hoursOn('2026-06-01 13:00:00 +0100x', 1)).toThrow(/unexpected date-holidays date/);
  });

  it('treats a holiday ending within 90 minutes of midnight as ending at midnight', () => {
    // DST days are 23 or 25 hours long, so date-holidays reports such lengths for whole-day holidays.
    expect(holidayOn('2026-06-01 00:00:00', 23)).toBe(true);
    expect(holidayOn('2026-06-01 00:00:00', 22.5 + 1 / 60)).toBe(true);
    expect(holidayOn('2026-06-01 00:00:00', 22.5)).toBe(false);
    expect(hoursOn('2026-06-01 00:00:00', 25.5, '2026-06-02')).toEqual([['09:00', '17:00']]);
  });
});
