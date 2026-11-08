import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkdays,
  createWorkCalendar,
  eachWorkday,
  isHoliday,
  isWeekend,
  isWorkday,
  nextWorkday,
  previousWorkday,
  rollBackward,
  rollForward,
  subtractWorkdays,
  workdaysBetween,
  type WorkdayOptions,
} from '../src/index.js';

// January 2024: Mon 1 … Fri 5, Sat 6, Sun 7, Mon 8.
const d = (s: string) => Temporal.PlainDate.from(s);
const str = (x: { toString(): string }) => x.toString();

describe('isWorkday / isWeekend / isHoliday', () => {
  it('uses Saturday/Sunday as the default weekend', () => {
    expect(isWorkday(d('2024-01-05'))).toBe(true);
    expect(isWorkday(d('2024-01-06'))).toBe(false);
    expect(isWeekend(d('2024-01-07'))).toBe(true);
    expect(isWeekend(d('2024-01-08'))).toBe(false);
  });

  it('supports custom weekends (Fri/Sat)', () => {
    const opts: WorkdayOptions = { weekend: [5, 6] };
    expect(isWorkday(d('2024-01-05'), opts)).toBe(false);
    expect(isWorkday(d('2024-01-07'), opts)).toBe(true);
  });

  it('supports an empty weekend', () => {
    expect(isWorkday(d('2024-01-06'), { weekend: [] })).toBe(true);
  });

  it('handles single-date holidays as strings and PlainDates', () => {
    const opts: WorkdayOptions = { holidays: ['2024-01-01', d('2024-01-02')] };
    expect(isHoliday(d('2024-01-01'), opts)).toBe(true);
    expect(isHoliday(d('2024-01-02'), opts)).toBe(true);
    expect(isWorkday(d('2024-01-02'), opts)).toBe(false);
    expect(isWorkday(d('2025-01-01'), opts)).toBe(true);
  });

  it('handles annual holidays as "MM-DD" strings and PlainMonthDays', () => {
    const opts: WorkdayOptions = { holidays: ['12-25', Temporal.PlainMonthDay.from('01-01')] };
    expect(isHoliday(d('2024-12-25'), opts)).toBe(true);
    expect(isHoliday(d('2031-12-25'), opts)).toBe(true);
    expect(isHoliday(d('2030-01-01'), opts)).toBe(true);
    expect(isHoliday(d('2030-01-02'), opts)).toBe(false);
  });

  it('accepts a holiday predicate that receives ISO PlainDates', () => {
    const seen: string[] = [];
    const opts: WorkdayOptions = {
      holidays: (date) => {
        seen.push(date.toString());
        return date.month === 1 && date.day === 1;
      },
    };
    expect(isWorkday(d('2024-01-01'), opts)).toBe(false);
    expect(isWorkday(d('2024-01-02'), opts)).toBe(true);
    expect(seen).toEqual(['2024-01-01', '2024-01-02']);
  });

  it('does not call the predicate on weekend days', () => {
    let calls = 0;
    isWorkday(d('2024-01-06'), { holidays: () => (calls++, false) });
    expect(calls).toBe(0);
  });

  it('extraWorkdays override weekends and holidays', () => {
    const opts: WorkdayOptions = { holidays: ['2024-01-01'], extraWorkdays: ['2024-01-06', '2024-01-01'] };
    expect(isWorkday(d('2024-01-06'), opts)).toBe(true);
    expect(isWorkday(d('2024-01-01'), opts)).toBe(true);
    expect(isHoliday(d('2024-01-01'), opts)).toBe(false);
    expect(isWeekend(d('2024-01-06'), opts)).toBe(true); // still a weekend day
  });

  it('accepts PlainDateTime and ZonedDateTime', () => {
    expect(isWorkday(Temporal.PlainDateTime.from('2024-01-06T10:00'))).toBe(false);
    // 23:30 in New York on Friday is already Saturday in UTC; the local date is what counts.
    expect(isWorkday(Temporal.ZonedDateTime.from('2024-01-05T23:30[America/New_York]'))).toBe(true);
  });

  it('uses the ISO date for non-ISO calendars', () => {
    const hebrew = d('2024-01-06').withCalendar('hebrew');
    expect(isWorkday(hebrew)).toBe(false);
    expect(isHoliday(d('2024-12-25').withCalendar('japanese'), { holidays: ['12-25'] })).toBe(true);
  });
});

describe('addWorkdays / subtractWorkdays', () => {
  it('skips weekends', () => {
    expect(str(addWorkdays(d('2024-01-05'), 1))).toBe('2024-01-08');
    expect(str(addWorkdays(d('2024-01-01'), 5))).toBe('2024-01-08');
    expect(str(addWorkdays(d('2024-01-01'), 10))).toBe('2024-01-15');
  });

  it('goes backwards with negative amounts and subtractWorkdays', () => {
    expect(str(addWorkdays(d('2024-01-08'), -1))).toBe('2024-01-05');
    expect(str(subtractWorkdays(d('2024-01-08'), 1))).toBe('2024-01-05');
    expect(str(subtractWorkdays(d('2024-01-08'), -1))).toBe('2024-01-09');
  });

  it('returns the input unchanged for 0', () => {
    const sat = d('2024-01-06');
    expect(addWorkdays(sat, 0)).toBe(sat);
  });

  it('from a non-workday, +1 is the next workday', () => {
    expect(str(addWorkdays(d('2024-01-06'), 1))).toBe('2024-01-08');
    expect(str(addWorkdays(d('2024-01-06'), -1))).toBe('2024-01-05');
  });

  it('skips holidays', () => {
    const opts: WorkdayOptions = { holidays: ['2024-12-25', '2024-12-26'] };
    expect(str(addWorkdays(d('2024-12-24'), 1, opts))).toBe('2024-12-27');
  });

  it('preserves the input type, time and zone', () => {
    const pdt = Temporal.PlainDateTime.from('2024-01-05T09:30');
    const r1 = addWorkdays(pdt, 1);
    expect(r1).toBeInstanceOf(Temporal.PlainDateTime);
    expect(str(r1)).toBe('2024-01-08T09:30:00');

    // DST starts in New York on 2024-03-10 (Sunday): wall-clock time is kept.
    const zdt = Temporal.ZonedDateTime.from('2024-03-08T09:00[America/New_York]');
    const r2 = addWorkdays(zdt, 1);
    expect(r2).toBeInstanceOf(Temporal.ZonedDateTime);
    expect(str(r2)).toBe('2024-03-11T09:00:00-04:00[America/New_York]');
  });

  it('keeps the calendar of the input', () => {
    const r = addWorkdays(d('2024-01-05').withCalendar('hebrew'), 1);
    expect(r.calendarId).toBe('hebrew');
    expect(str(r.withCalendar('iso8601'))).toBe('2024-01-08');
  });

  it('works across years and leap days', () => {
    expect(str(addWorkdays(d('2024-02-28'), 1))).toBe('2024-02-29');
    expect(str(addWorkdays(d('2023-12-29'), 1))).toBe('2024-01-01');
    expect(str(addWorkdays(d('2024-01-01'), 262))).toBe('2025-01-01');
  });

  it('rejects non-integer amounts', () => {
    expect(() => addWorkdays(d('2024-01-01'), 1.5)).toThrow(RangeError);
    expect(() => addWorkdays(d('2024-01-01'), Number.NaN)).toThrow(RangeError);
    expect(() => addWorkdays(d('2024-01-01'), Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('throws instead of looping forever when there are no workdays', () => {
    expect(() => addWorkdays(d('2024-01-01'), 1, { weekend: [1, 2, 3, 4, 5, 6, 7] })).toThrow(/no workday/);
    expect(() => nextWorkday(d('2024-01-01'), { holidays: () => true })).toThrow(/no workday/);
  });

  it('can still use extraWorkdays when every weekday is weekend', () => {
    const opts: WorkdayOptions = { weekend: [1, 2, 3, 4, 5, 6, 7], extraWorkdays: ['2024-01-10'] };
    expect(str(addWorkdays(d('2024-01-01'), 1, opts))).toBe('2024-01-10');
  });
});

describe('next / previous / roll', () => {
  it('nextWorkday and previousWorkday are strict', () => {
    expect(str(nextWorkday(d('2024-01-01')))).toBe('2024-01-02');
    expect(str(nextWorkday(d('2024-01-05')))).toBe('2024-01-08');
    expect(str(previousWorkday(d('2024-01-08')))).toBe('2024-01-05');
  });

  it('rollForward / rollBackward keep workdays as-is', () => {
    const mon = d('2024-01-08');
    expect(rollForward(mon)).toBe(mon);
    expect(rollBackward(mon)).toBe(mon);
    expect(str(rollForward(d('2024-01-06')))).toBe('2024-01-08');
    expect(str(rollBackward(d('2024-01-07')))).toBe('2024-01-05');
  });
});

describe('workdaysBetween', () => {
  it('counts the range (start, end]', () => {
    expect(workdaysBetween(d('2024-01-01'), d('2024-01-05'))).toBe(4);
    expect(workdaysBetween(d('2024-01-01'), d('2024-01-08'))).toBe(5);
    expect(workdaysBetween(d('2024-01-05'), d('2024-01-07'))).toBe(0);
    expect(workdaysBetween(d('2024-01-06'), d('2024-01-08'))).toBe(1);
    expect(workdaysBetween(d('2024-01-03'), d('2024-01-03'))).toBe(0);
  });

  it('is negative when end is before start', () => {
    expect(workdaysBetween(d('2024-01-08'), d('2024-01-01'))).toBe(-5);
  });

  it('counts a full year', () => {
    expect(workdaysBetween(d('2023-12-31'), d('2024-12-31'))).toBe(262);
  });

  it('ignores time of day and mixes input types', () => {
    const a = Temporal.PlainDateTime.from('2024-01-01T23:59');
    const b = Temporal.ZonedDateTime.from('2024-01-02T00:01[Europe/London]');
    expect(workdaysBetween(a, b)).toBe(1);
  });
});

describe('eachWorkday', () => {
  it('yields workdays in [start, end]', () => {
    const days = [...eachWorkday(d('2024-01-04'), d('2024-01-09'))].map(str);
    expect(days).toEqual(['2024-01-04', '2024-01-05', '2024-01-08', '2024-01-09']);
  });

  it('yields nothing when end < start', () => {
    expect([...eachWorkday(d('2024-01-09'), d('2024-01-04'))]).toEqual([]);
  });

  it('preserves type and time', () => {
    const [first] = eachWorkday(Temporal.PlainDateTime.from('2024-01-06T08:00'), d('2024-01-09'));
    expect(str(first!)).toBe('2024-01-08T08:00:00');
  });
});

describe('createWorkCalendar', () => {
  it('binds options and parses them once', () => {
    let calls = 0;
    const holidays = {
      *[Symbol.iterator]() {
        calls++;
        yield '2024-01-01';
      },
    };
    const cal = createWorkCalendar({ holidays });
    expect(cal.isWorkday(d('2024-01-01'))).toBe(false);
    expect(str(cal.addWorkdays(d('2023-12-29'), 1))).toBe('2024-01-02');
    expect(cal.workdaysBetween(d('2023-12-31'), d('2024-01-05'))).toBe(4);
    expect(calls).toBe(1);
  });

  it('is not affected by later changes to the input arrays', () => {
    const holidays = ['2024-01-01'];
    const cal = createWorkCalendar({ holidays });
    holidays.push('2024-01-02');
    expect(cal.isWorkday(d('2024-01-02'))).toBe(true);
  });

  it('validates eagerly', () => {
    expect(() => createWorkCalendar({ holidays: ['2024-02-30'] })).toThrow(RangeError);
  });
});

describe('validation', () => {
  it('rejects invalid weekend days', () => {
    expect(() => isWorkday(d('2024-01-01'), { weekend: [0 as never] })).toThrow(RangeError);
    expect(() => isWorkday(d('2024-01-01'), { weekend: [8 as never] })).toThrow(RangeError);
  });

  it('rejects malformed or impossible holiday strings', () => {
    for (const bad of ['2024-1-01', 'tomorrow', '2023-02-29', '13-01', '02-30']) {
      expect(() => isWorkday(d('2024-01-01'), { holidays: [bad] }), bad).toThrow(RangeError);
    }
  });

  it('accepts Feb 29 as an annual holiday', () => {
    expect(isHoliday(d('2028-02-29'), { holidays: ['02-29'] })).toBe(true);
  });

  it('rejects non-Temporal inputs', () => {
    expect(() => isWorkday(new Date() as never)).toThrow(TypeError);
    expect(() => isWorkday('2024-01-01' as never)).toThrow(TypeError);
  });
});
