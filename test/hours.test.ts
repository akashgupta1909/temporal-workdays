import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkingTime,
  addWorkdays,
  createWorkCalendar,
  getWorkingHours,
  isWorkday,
  isWorkingTime,
  rollBackwardToWorkingTime,
  rollForwardToWorkingTime,
  subtractWorkingTime,
  workingTimeBetween,
  type WorkingTimeOptions,
} from '../src/index.js';

// January 2024: Mon 1 … Fri 5, Sat 6, Sun 7, Mon 8.
const dt = (s: string) => Temporal.PlainDateTime.from(s);
const zdt = (s: string) => Temporal.ZonedDateTime.from(s);
const str = (x: { toString(): string }) => x.toString();
const office: WorkingTimeOptions = { hours: [['09:00', '17:00']] };
const withLunch: WorkingTimeOptions = {
  hours: [
    ['09:00', '12:00'],
    ['13:00', '17:00'],
  ],
};

describe('addWorkingTime', () => {
  it('adds within a day and carries over to the next workday', () => {
    expect(str(addWorkingTime(dt('2024-01-01T10:00'), { hours: 2 }, office))).toBe('2024-01-01T12:00:00');
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), { hours: 2 }, office))).toBe('2024-01-02T10:00:00');
    expect(str(addWorkingTime(dt('2024-01-05T16:00'), { hours: 2 }, office))).toBe('2024-01-08T10:00:00');
  });

  it('lands on the end of a period rather than the start of the next', () => {
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), { hours: 1 }, office))).toBe('2024-01-01T17:00:00');
    expect(str(addWorkingTime(dt('2024-01-01T09:00'), { hours: 8 }, office))).toBe('2024-01-01T17:00:00');
  });

  it('starts counting at the next period when outside working hours', () => {
    expect(str(addWorkingTime(dt('2024-01-01T07:00'), { minutes: 30 }, office))).toBe('2024-01-01T09:30:00');
    expect(str(addWorkingTime(dt('2024-01-06T12:00'), { minutes: 30 }, office))).toBe('2024-01-08T09:30:00');
  });

  it('skips breaks', () => {
    expect(str(addWorkingTime(dt('2024-01-01T11:30'), { hours: 1 }, withLunch))).toBe('2024-01-01T13:30:00');
  });

  it('goes backwards for negative durations, landing on period starts', () => {
    expect(str(addWorkingTime(dt('2024-01-08T10:00'), { hours: -2 }, office))).toBe('2024-01-05T16:00:00');
    expect(str(addWorkingTime(dt('2024-01-08T10:00'), { hours: -1 }, office))).toBe('2024-01-08T09:00:00');
    expect(str(subtractWorkingTime(dt('2024-01-01T13:30'), { hours: 1 }, withLunch))).toBe('2024-01-01T11:30:00');
    expect(str(subtractWorkingTime(dt('2024-01-01T10:00'), { hours: -1 }, office))).toBe('2024-01-01T11:00:00');
  });

  it('returns the input unchanged for a zero duration', () => {
    const sat = dt('2024-01-06T03:00');
    expect(addWorkingTime(sat, { hours: 0 }, office)).toBe(sat);
    expect(subtractWorkingTime(sat, Temporal.Duration.from('PT0S'), office)).toBe(sat);
  });

  it('accepts Temporal.Duration and sub-second precision', () => {
    const d = Temporal.Duration.from('PT1H30M0.000000001S');
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), d, office))).toBe('2024-01-02T09:30:00.000000001');
    expect(str(addWorkingTime(dt('2024-01-01T09:00'), { days: 0, hours: 1 }, office))).toBe('2024-01-01T10:00:00');
  });

  it('respects holidays, weekends and extra workdays', () => {
    const o: WorkingTimeOptions = { ...office, holidays: ['2024-01-02'], extraWorkdays: ['2024-01-06'] };
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), { hours: 2 }, o))).toBe('2024-01-03T10:00:00');
    expect(str(addWorkingTime(dt('2024-01-05T16:00'), { hours: 2 }, o))).toBe('2024-01-06T10:00:00');
  });

  it('handles midnight boundaries and 24:00', () => {
    const allDay: WorkingTimeOptions = { hours: [['00:00', '24:00']], weekend: [] };
    expect(str(addWorkingTime(dt('2024-01-01T23:00'), { hours: 1 }, allDay))).toBe('2024-01-02T00:00:00');
    expect(str(addWorkingTime(dt('2024-01-01T23:00'), { hours: 49 }, allDay))).toBe('2024-01-04T00:00:00');
    expect(str(subtractWorkingTime(dt('2024-01-02T00:00'), { hours: 1 }, allDay))).toBe('2024-01-01T23:00:00');
  });

  it('works before 1970 (negative epoch positions)', () => {
    expect(str(addWorkingTime(dt('1969-12-31T16:00'), { hours: 2 }, office))).toBe('1970-01-01T10:00:00');
    expect(str(subtractWorkingTime(dt('1900-03-01T10:00'), { hours: 2 }, office))).toBe('1900-02-28T16:00:00');
    const z = addWorkingTime(zdt('1969-12-31T16:00[America/New_York]'), { hours: 2 }, office);
    expect(str(z)).toBe('1970-01-01T10:00:00-05:00[America/New_York]');
  });

  it('keeps non-ISO calendars', () => {
    const r = addWorkingTime(dt('2024-01-05T16:00').withCalendar('hebrew'), { hours: 2 }, office);
    expect(r.calendarId).toBe('hebrew');
    expect(str(r.withCalendar('iso8601'))).toBe('2024-01-08T10:00:00');
  });
});

describe('ZonedDateTime', () => {
  // New York: DST starts Sun 2024-03-10 02:00 (23h day), ends Sun 2024-11-03 02:00 (25h day).
  const nonstop: WorkingTimeOptions = { hours: [['00:00', '24:00']], weekend: [] };

  it('counts exact elapsed time across DST changes', () => {
    const spring = workingTimeBetween(
      zdt('2024-03-10T00:00[America/New_York]'),
      zdt('2024-03-11T00:00[America/New_York]'),
      nonstop,
    );
    expect(str(spring)).toBe('PT23H');
    const fall = workingTimeBetween(
      zdt('2024-11-03T00:00[America/New_York]'),
      zdt('2024-11-04T00:00[America/New_York]'),
      nonstop,
    );
    expect(str(fall)).toBe('PT25H');
    // PlainDateTime has no time zone: every day is 24 wall-clock hours.
    expect(str(workingTimeBetween(dt('2024-03-10T00:00'), dt('2024-03-11T00:00'), nonstop))).toBe('PT24H');
  });

  it('adds exact time through a DST gap inside working hours', () => {
    const night: WorkingTimeOptions = { hours: [['01:00', '04:00']], weekend: [] };
    // 01:00–04:00 on the spring-forward night is only 2 real hours.
    const r = addWorkingTime(zdt('2024-03-10T01:00[America/New_York]'), { hours: 2 }, night);
    expect(str(r)).toBe('2024-03-10T04:00:00-04:00[America/New_York]');
    const r2 = addWorkingTime(zdt('2024-03-10T01:00[America/New_York]'), { hours: 3 }, night);
    expect(str(r2)).toBe('2024-03-11T02:00:00-04:00[America/New_York]');
  });

  it('drops working periods that fall entirely into a DST gap', () => {
    // 02:00–03:00 does not exist on 2024-03-10 in New York.
    const o: WorkingTimeOptions = {
      weekend: [],
      hours: [
        ['02:00', '03:00'],
        ['09:00', '10:00'],
      ],
    };
    const day = workingTimeBetween(
      zdt('2024-03-10T00:00[America/New_York]'),
      zdt('2024-03-11T00:00[America/New_York]'),
      o,
    );
    expect(str(day)).toBe('PT1H');
  });

  it('counts periods that overlap after a DST shift only once', () => {
    // 02:30–02:45 is skipped and moves to 03:30–03:45, inside 03:00–04:00.
    const o: WorkingTimeOptions = {
      weekend: [],
      hours: [
        ['02:30', '02:45'],
        ['03:00', '04:00'],
      ],
    };
    const day = workingTimeBetween(
      zdt('2024-03-10T00:00[America/New_York]'),
      zdt('2024-03-11T00:00[America/New_York]'),
      o,
    );
    expect(str(day)).toBe('PT1H');
    // 02:00–02:30 and 02:30–… both move by an hour and collide with the real 03:00–03:30.
    const o2: WorkingTimeOptions = {
      weekend: [],
      hours: [
        ['02:00', '02:15'],
        ['03:00', '03:30'],
      ],
    };
    const day2 = workingTimeBetween(
      zdt('2024-03-10T00:00[America/New_York]'),
      zdt('2024-03-11T00:00[America/New_York]'),
      o2,
    );
    expect(str(day2)).toBe('PT30M');
  });

  it('handles Samoa skipping 2011-12-30 entirely', () => {
    // The skipped day's periods map onto the 31st and must not be counted twice or out of order.
    const o: WorkingTimeOptions = {
      weekend: [],
      hours: [
        ['09:00', '10:00'],
        ['20:00', '21:00'],
      ],
    };
    const start = zdt('2011-12-29T00:00[Pacific/Apia]');
    const end = zdt('2012-01-01T00:00[Pacific/Apia]');
    expect(str(workingTimeBetween(start, end, o))).toBe('PT4H');
    expect(str(rollForwardToWorkingTime(zdt('2011-12-31T05:00[Pacific/Apia]'), o))).toBe(
      '2011-12-31T09:00:00+14:00[Pacific/Apia]',
    );
    expect(str(addWorkingTime(zdt('2011-12-29T20:30[Pacific/Apia]'), { hours: 1 }, o))).toBe(
      '2011-12-31T09:30:00+14:00[Pacific/Apia]',
    );
  });

  it('keeps the wall-clock time and zone of the input', () => {
    const r = addWorkingTime(zdt('2024-03-08T16:00[America/New_York]'), { hours: 2 }, office);
    expect(str(r)).toBe('2024-03-11T10:00:00-04:00[America/New_York]');
  });

  it('measures between instants in different zones using the start zone', () => {
    const start = zdt('2024-01-01T09:00[Europe/London]');
    const end = zdt('2024-01-01T12:00[America/New_York]'); // = 17:00 London
    expect(str(workingTimeBetween(start, end, office))).toBe('PT8H');
  });

  it('keeps non-ISO calendars and rolls to period boundaries', () => {
    const z = zdt('2024-01-05T16:00[Europe/Paris]').withCalendar('japanese');
    const r = addWorkingTime(z, { hours: 2 }, office);
    expect(r.calendarId).toBe('japanese');
    expect(str(r.withCalendar('iso8601'))).toBe('2024-01-08T10:00:00+01:00[Europe/Paris]');
    expect(str(rollForwardToWorkingTime(zdt('2024-01-06T12:00[Europe/Paris]'), office))).toBe(
      '2024-01-08T09:00:00+01:00[Europe/Paris]',
    );
    expect(str(rollBackwardToWorkingTime(zdt('2024-01-06T12:00[Europe/Paris]'), office))).toBe(
      '2024-01-05T17:00:00+01:00[Europe/Paris]',
    );
  });

  it('measures zero, forward and backward spans', () => {
    const a = zdt('2024-01-01T10:00[UTC]');
    const b = zdt('2024-01-02T10:00[UTC]');
    expect(str(workingTimeBetween(a, a, office))).toBe('PT0S');
    expect(str(workingTimeBetween(a, b, office))).toBe('PT8H');
    expect(str(workingTimeBetween(b, a, office))).toBe('-PT8H');
  });

  it('works in fractional-offset zones', () => {
    const r = addWorkingTime(zdt('2024-01-05T16:30[Asia/Kathmandu]'), { hours: 1 }, office);
    expect(str(r)).toBe('2024-01-08T09:30:00+05:45[Asia/Kathmandu]');
  });
});

describe('workingTimeBetween', () => {
  it('returns a Duration balanced up to hours', () => {
    const d = workingTimeBetween(dt('2024-01-01T09:00'), dt('2024-01-08T13:30'), office);
    expect(d).toBeInstanceOf(Temporal.Duration);
    expect(str(d)).toBe('PT44H30M');
    expect(d.total('hours')).toBe(44.5);
  });

  it('is negative when end is before start, and zero for no working time', () => {
    expect(str(workingTimeBetween(dt('2024-01-02T10:00'), dt('2024-01-01T16:00'), office))).toBe('-PT2H');
    expect(str(workingTimeBetween(dt('2024-01-06T10:00'), dt('2024-01-07T10:00'), office))).toBe('PT0S');
    expect(workingTimeBetween(dt('2024-01-07T10:00'), dt('2024-01-06T10:00'), office).sign).toBe(0);
  });

  it('converts non-ISO calendar inputs', () => {
    const a = dt('2024-01-01T09:00').withCalendar('hebrew');
    const b = dt('2024-01-02T09:00').withCalendar('hebrew');
    expect(str(workingTimeBetween(a, b, office))).toBe('PT8H');
  });

  it('rejects mixed input types', () => {
    expect(() => workingTimeBetween(dt('2024-01-01T09:00'), zdt('2024-01-01T09:00[UTC]') as never, office)).toThrow(
      /same Temporal type/,
    );
    expect(() => workingTimeBetween(zdt('2024-01-01T09:00[UTC]'), dt('2024-01-01T09:00') as never, office)).toThrow(
      /same Temporal type/,
    );
  });
});

describe('isWorkingTime / roll', () => {
  it('treats periods as [start, end)', () => {
    expect(isWorkingTime(dt('2024-01-01T09:00'), office)).toBe(true);
    expect(isWorkingTime(dt('2024-01-01T16:59:59.999999999'), office)).toBe(true);
    expect(isWorkingTime(dt('2024-01-01T17:00'), office)).toBe(false);
    expect(isWorkingTime(dt('2024-01-06T12:00'), office)).toBe(false);
  });

  it('rolls to the next period start / previous period end', () => {
    const inside = dt('2024-01-01T10:00');
    expect(rollForwardToWorkingTime(inside, office)).toBe(inside);
    expect(rollBackwardToWorkingTime(inside, office)).toBe(inside);
    expect(str(rollForwardToWorkingTime(dt('2024-01-01T12:30'), withLunch))).toBe('2024-01-01T13:00:00');
    expect(str(rollBackwardToWorkingTime(dt('2024-01-01T12:30'), withLunch))).toBe('2024-01-01T12:00:00');
    expect(str(rollForwardToWorkingTime(dt('2024-01-05T17:00'), office))).toBe('2024-01-08T09:00:00');
    expect(str(rollBackwardToWorkingTime(dt('2024-01-08T08:00'), office))).toBe('2024-01-05T17:00:00');
    expect(str(rollBackwardToWorkingTime(dt('2024-01-01T17:00'), office))).toBe('2024-01-01T17:00:00');
  });
});

describe('hours configuration', () => {
  it('supports per-weekday hours with a default', () => {
    const o: WorkingTimeOptions = { hours: { default: [['09:00', '17:00']], 5: [['09:00', '13:00']] } };
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-04'), o)).toEqual([['09:00', '17:00']]);
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-05'), o)).toEqual([['09:00', '13:00']]);
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-06'), o)).toEqual([]); // weekend
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-04'), { hours: { 1: [['09:00', '10:00']] } })).toEqual([]);
  });

  it('normalizes ranges: sorts, merges touching ones, keeps precision, accepts PlainTime', () => {
    const o: WorkingTimeOptions = {
      hours: [
        ['13:00', '17:00:30.5'],
        [Temporal.PlainTime.from('09:00'), '12:00'],
        ['12:00', '13:00'],
      ],
    };
    expect(getWorkingHours(dt('2024-01-01T00:00'), o)).toEqual([['09:00', '17:00:30.5']]);
    expect(getWorkingHours(dt('2024-01-01T00:00'), { hours: [['08:15:07', '24:00']] })).toEqual([
      ['08:15:07', '24:00'],
    ]);
  });

  it('special hours by date override weekends, holidays and regular hours', () => {
    const o: WorkingTimeOptions = {
      ...office,
      holidays: ['2024-01-02'],
      specialHours: { '2024-01-02': [['10:00', '12:00']], '2024-01-03': [], '2024-01-06': [['09:00', '11:00']] },
    };
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-02'), o)).toEqual([['10:00', '12:00']]);
    // Mon 16–17 (1h) + Tue special 10–12 (2h) = 3h, landing on the end of Tuesday's period.
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), { hours: 3 }, o))).toBe('2024-01-02T12:00:00');
    // One more hour skips Wednesday (closed) and starts Thursday 09:00.
    expect(str(addWorkingTime(dt('2024-01-01T16:00'), { hours: 4 }, o))).toBe('2024-01-04T10:00:00');
    expect(isWorkingTime(dt('2024-01-06T10:00'), o)).toBe(true);
    // Special hours only affect working time; day-level answers are unchanged.
    expect(isWorkday(Temporal.PlainDate.from('2024-01-03'), o)).toBe(true);
  });

  it('special-hours functions get the date and its regular hours', () => {
    const calls: string[] = [];
    const o: WorkingTimeOptions = {
      ...withLunch,
      holidays: ['2024-01-02'],
      specialHours: (date, regular) => {
        calls.push(`${date.toString()} ${JSON.stringify(regular)}`);
        if (date.day === 1) return regular.slice(0, 1); // morning only
        if (date.day === 3) return [];
        return undefined;
      },
    };
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-01'), o)).toEqual([['09:00', '12:00']]);
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-02'), o)).toEqual([]);
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-03'), o)).toEqual([]);
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-04'), o)).toEqual(
      getWorkingHours(Temporal.PlainDate.from('2024-01-05'), withLunch),
    );
    expect(calls).toEqual([
      '2024-01-01 [["09:00","12:00"],["13:00","17:00"]]',
      '2024-01-02 []',
      '2024-01-03 [["09:00","12:00"],["13:00","17:00"]]',
      '2024-01-04 [["09:00","12:00"],["13:00","17:00"]]',
    ]);
  });

  it('day-level functions accept options that include hours', () => {
    expect(str(addWorkdays(Temporal.PlainDate.from('2024-01-05'), 1, office))).toBe('2024-01-08');
  });
});

describe('createWorkCalendar with hours', () => {
  it('adds working-time methods only when hours are given', () => {
    expect('addWorkingTime' in createWorkCalendar()).toBe(false);
    expect('addWorkingTime' in createWorkCalendar({ weekend: [5, 6] })).toBe(false);
    const cal = createWorkCalendar(office);
    expect(str(cal.addWorkingTime(dt('2024-01-05T16:00'), { hours: 2 }))).toBe('2024-01-08T10:00:00');
    expect(str(cal.addWorkdays(Temporal.PlainDate.from('2024-01-05'), 1))).toBe('2024-01-08');
    expect(Object.isFrozen(cal) && Object.isFrozen(cal.options)).toBe(true);
  });

  it('validates hours eagerly', () => {
    expect(() => createWorkCalendar({ hours: [['09:00', '09:00']] })).toThrow(/empty/);
  });
});

describe('validation', () => {
  const d = dt('2024-01-01T10:00');

  it('requires hours for working-time functions', () => {
    expect(() => isWorkingTime(d, {} as never)).toThrow(/need an `hours` option/);
    expect(() => isWorkingTime(d, undefined as never)).toThrow(/need an `hours` option/);
  });

  it('rejects malformed hours', () => {
    const bad: unknown[] = [
      'nine to five',
      42,
      null,
      [['09:00']],
      [['09:00', '17:00', '18:00']],
      ['09:00-17:00'],
      [['09:00', '09:00']],
      [['24:00', '06:00']],
      [
        ['09:00', '13:00'],
        ['12:00', '17:00'],
      ],
      { 8: [['09:00', '17:00']] },
      { mon: [] },
      { default: 'all day' },
    ];
    for (const hours of bad) {
      expect(() => isWorkingTime(d, { hours } as never), JSON.stringify(hours)).toThrow();
    }
  });

  it('rejects malformed times', () => {
    for (const t of ['9:00', '24:01', '25:00', '12:60', '12:00:60', '12:00:00.1234567890', '', 'noon']) {
      expect(() => isWorkingTime(d, { hours: [[t, '23:00']] }), t).toThrow(RangeError);
    }
    expect(() => isWorkingTime(d, { hours: [[900 as never, '17:00']] })).toThrow(TypeError);
    expect(() => isWorkingTime(d, { hours: [['24:00', '24:00']] })).toThrow(RangeError);
  });

  it('rejects malformed special hours', () => {
    expect(() => isWorkingTime(d, { ...office, specialHours: [] as never })).toThrow(/specialHours must be/);
    expect(() => isWorkingTime(d, { ...office, specialHours: 'none' as never })).toThrow(/specialHours must be/);
    expect(() => isWorkingTime(d, { ...office, specialHours: { tomorrow: [] } })).toThrow(RangeError);
    expect(() => isWorkingTime(d, { ...office, specialHours: { '2024-01-01': 'closed' as never } })).toThrow(TypeError);
    expect(() => isWorkingTime(d, { ...office, specialHours: () => 'closed' as never })).toThrow(
      /specialHours\(\d{4}-\d{2}-\d{2}\)/,
    );
  });

  it('rejects calendar units, fractions, mixed signs and non-durations', () => {
    expect(() => addWorkingTime(d, { days: 1 }, office)).toThrow(/use addWorkdays/);
    expect(() => addWorkingTime(d, Temporal.Duration.from({ weeks: 1 }), office)).toThrow(/weeks are not supported/);
    expect(() => addWorkingTime(d, { hours: 1.5 }, office)).toThrow(/integer/);
    expect(() => addWorkingTime(d, { hours: '1' as never }, office)).toThrow(/integer/);
    expect(() => addWorkingTime(d, { hours: 1, minutes: -30 }, office)).toThrow(/same sign/);
    expect(() => addWorkingTime(d, {}, office)).toThrow(/at least one/);
    expect(() => addWorkingTime(d, 'PT1H' as never, office)).toThrow(TypeError);
    expect(() => addWorkingTime(d, null as never, office)).toThrow(TypeError);
    expect(() => subtractWorkingTime(d, null as never, office)).toThrow(TypeError);
    expect(() => subtractWorkingTime(d, { hours: '1' as never }, office)).toThrow(/integer/);
  });

  it('rejects dates without a time, with a hint', () => {
    expect(() => isWorkingTime(Temporal.PlainDate.from('2024-01-01') as never, office)).toThrow(/workday functions/);
    expect(() => isWorkingTime(new Date() as never, office)).toThrow(TypeError);
  });

  it('throws instead of looping forever when there is no working time', () => {
    const none: WorkingTimeOptions = { hours: [] };
    expect(() => addWorkingTime(d, { hours: 1 }, none)).toThrow(/no working time/);
    expect(() => subtractWorkingTime(d, { hours: 1 }, none)).toThrow(/no working time/);
    expect(() => rollForwardToWorkingTime(d, none)).toThrow(/no working time/);
    expect(() => rollBackwardToWorkingTime(d, none)).toThrow(/no working time/);
  });
});
