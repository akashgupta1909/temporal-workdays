import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { compileDayCalendar } from '../src/day-calendar.js';
import { createWorkCalendar, workdayOfMonth, workdaysByWeek, workdaysInMonth, type DayOfWeek } from '../src/index.js';
import { weekStartOf } from '../src/workdays.js';

// January 2024 starts on a Monday; June 2024 starts on a Saturday.
const d = (s: string) => Temporal.PlainDate.from(s);
const strs = (xs: readonly { toString(): string }[]) => xs.map(String);

describe('workdaysInMonth', () => {
  it('lists the workdays of the month', () => {
    const jan = workdaysInMonth(d('2024-01-17'));
    expect(jan).toHaveLength(23);
    expect(String(jan[0])).toBe('2024-01-01');
    expect(String(jan.at(-1))).toBe('2024-01-31');
    expect(workdaysInMonth(d('2024-01-17'), { holidays: ['2024-01-01'] })).toHaveLength(22);
    expect(workdaysInMonth(d('2024-02-10'))).toHaveLength(21); // leap February
  });

  it('keeps the input type and time of day', () => {
    const [first] = workdaysInMonth(Temporal.ZonedDateTime.from('2024-06-15T09:30[Europe/Paris]'));
    expect(String(first)).toBe('2024-06-03T09:30:00+02:00[Europe/Paris]');
  });

  it("uses the date's own calendar month", () => {
    const hebrew = d('2024-01-17').withCalendar('hebrew'); // 7 Shevat 5784
    const days = workdaysInMonth(hebrew);
    expect(days.every((x) => x.monthCode === hebrew.monthCode && x.year === hebrew.year)).toBe(true);
    expect(days[0]!.day).toBe(1);
    const expected: string[] = [];
    for (let x = hebrew.with({ day: 1 }); x.monthCode === hebrew.monthCode; x = x.add({ days: 1 })) {
      if (x.dayOfWeek < 6) expected.push(x.toString());
    }
    expect(strs(days)).toEqual(expected);
  });
});

describe('workdayOfMonth', () => {
  it('counts workdays so far in the month, including the date', () => {
    expect(workdayOfMonth(d('2024-01-01'))).toBe(1);
    expect(workdayOfMonth(d('2024-01-05'))).toBe(5);
    expect(workdayOfMonth(d('2024-01-06'))).toBe(5); // Saturday: count so far
    expect(workdayOfMonth(d('2024-01-31'))).toBe(23);
    expect(workdayOfMonth(d('2024-06-01'))).toBe(0); // Saturday before the first workday
    expect(workdayOfMonth(d('2024-06-03'))).toBe(1);
    expect(workdayOfMonth(d('2024-01-02'), { holidays: ['2024-01-01'] })).toBe(1);
  });
});

describe('workdaysByWeek', () => {
  it('groups by week, Monday-first for a Saturday–Sunday weekend', () => {
    const weeks = workdaysByWeek(d('2024-01-01'), d('2024-01-31'));
    expect(weeks.map((w) => w.length)).toEqual([5, 5, 5, 5, 3]);
    expect(strs(weeks[4]!)).toEqual(['2024-01-29', '2024-01-30', '2024-01-31']);
  });

  it('starts weeks after the weekend', () => {
    // Friday–Saturday weekend: Sunday–Thursday weeks.
    const weeks = workdaysByWeek(d('2024-01-01'), d('2024-01-14'), { weekend: [5, 6] });
    expect(weeks.map(strs)).toEqual([
      ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
      ['2024-01-07', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11'],
      ['2024-01-14'],
    ]);
  });

  it('leaves out weeks without workdays and respects holidays', () => {
    const holidays = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'];
    const weeks = workdaysByWeek(d('2024-01-01'), d('2024-01-19'), { holidays });
    expect(weeks.map((w) => w.length)).toEqual([5, 5]);
    expect(workdaysByWeek(d('2024-01-06'), d('2024-01-07'))).toEqual([]);
    expect(workdaysByWeek(d('2024-01-10'), d('2024-01-01'))).toEqual([]);
  });

  it('derives the week start from the weekend', () => {
    const start = (weekend: DayOfWeek[]) => weekStartOf(compileDayCalendar({ weekend }));
    expect(start([6, 7])).toBe(1);
    expect(start([5, 6])).toBe(7);
    expect(start([5])).toBe(6);
    expect(start([7])).toBe(1);
    expect(start([])).toBe(1);
    expect(start([1, 2, 4, 5, 6, 7])).toBe(3);
  });
});

describe('calendar methods', () => {
  it('bind the same functions', () => {
    const cal = createWorkCalendar({ holidays: ['2024-01-01'] });
    expect(cal.workdaysInMonth(d('2024-01-10'))).toHaveLength(22);
    expect(cal.workdayOfMonth(d('2024-01-10'))).toBe(7);
    expect(cal.workdaysByWeek(d('2024-01-01'), d('2024-01-07')).map(strs)).toEqual([
      ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
    ]);
  });
});
