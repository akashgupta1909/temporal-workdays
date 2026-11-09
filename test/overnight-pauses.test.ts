import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkingTime,
  createWorkCalendar,
  getWorkingHours,
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
const nights: WorkingTimeOptions = { hours: [['22:00', '06:00']] };

describe('overnight shifts', () => {
  it('belong to the day they start, including Friday night into Saturday', () => {
    expect(isWorkingTime(dt('2024-01-05T23:00'), nights)).toBe(true); // Friday's shift
    expect(isWorkingTime(dt('2024-01-06T05:59'), nights)).toBe(true); // …until Saturday 06:00
    expect(isWorkingTime(dt('2024-01-06T06:00'), nights)).toBe(false);
    expect(isWorkingTime(dt('2024-01-06T23:00'), nights)).toBe(false); // no shift on Saturday night
    expect(isWorkingTime(dt('2024-01-08T03:00'), nights)).toBe(false); // nor on Sunday night
    expect(isWorkingTime(dt('2024-01-09T03:00'), nights)).toBe(true); // Monday's shift
  });

  it('add, subtract, measure and roll across nights and weekends', () => {
    expect(str(addWorkingTime(dt('2024-01-05T23:00'), { hours: 7 }, nights))).toBe('2024-01-06T06:00:00');
    expect(str(addWorkingTime(dt('2024-01-05T23:00'), { hours: 8 }, nights))).toBe('2024-01-08T23:00:00');
    expect(str(subtractWorkingTime(dt('2024-01-08T23:00'), { hours: 2 }, nights))).toBe('2024-01-06T05:00:00');
    expect(str(workingTimeBetween(dt('2024-01-01T00:00'), dt('2024-01-08T00:00'), nights))).toBe('PT40H');
    expect(str(rollForwardToWorkingTime(dt('2024-01-06T12:00'), nights))).toBe('2024-01-08T22:00:00');
    expect(str(rollBackwardToWorkingTime(dt('2024-01-06T12:00'), nights))).toBe('2024-01-06T06:00:00');
  });

  it('report their hours with the end before the start', () => {
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-05'), nights)).toEqual([['22:00', '06:00']]);
    const mixed: WorkingTimeOptions = {
      hours: [
        ['22:00', '02:00'],
        ['09:00', '12:00'],
      ],
    };
    expect(getWorkingHours(Temporal.PlainDate.from('2024-01-05'), mixed)).toEqual([
      ['09:00', '12:00'],
      ['22:00', '02:00'],
    ]);
  });

  it("count once where a night shift overlaps the next day's morning", () => {
    const o: WorkingTimeOptions = {
      hours: [
        ['05:00', '09:00'],
        ['22:00', '06:00'],
      ],
      weekend: [],
    };
    // Mon 22:00 → Tue 06:00 overlaps Tue 05:00–09:00: Mon night + Tue morning is 22:00 → 09:00 = 11h.
    expect(str(workingTimeBetween(dt('2024-01-01T12:00'), dt('2024-01-02T12:00'), o))).toBe('PT11H');
    expect(str(addWorkingTime(dt('2024-01-01T22:00'), { hours: 11 }, o))).toBe('2024-01-02T09:00:00');
  });

  it('measure real elapsed time across a DST change', () => {
    // New York falls back on Sun 2024-11-03 at 02:00: the night of Sat 2 → Sun 3 is 9 real hours.
    const allNights: WorkingTimeOptions = { hours: [['22:00', '06:00']], weekend: [] };
    const start = zdt('2024-11-02T22:00[America/New_York]');
    expect(str(workingTimeBetween(start, zdt('2024-11-03T06:00[America/New_York]'), allNights))).toBe('PT9H');
    expect(str(addWorkingTime(start, { hours: 9 }, allNights))).toBe('2024-11-03T06:00:00-05:00[America/New_York]');
  });

  it('special hours can be overnight too', () => {
    const o: WorkingTimeOptions = { hours: [['09:00', '17:00']], specialHours: { '2024-01-05': [['20:00', '04:00']] } };
    expect(isWorkingTime(dt('2024-01-06T03:00'), o)).toBe(true);
    expect(str(workingTimeBetween(dt('2024-01-05T00:00'), dt('2024-01-08T00:00'), o))).toBe('PT8H');
    const fn: WorkingTimeOptions = {
      hours: [['09:00', '17:00']],
      specialHours: (d) => (d.day === 5 ? [['20:00', '04:00']] : undefined),
    };
    expect(isWorkingTime(dt('2024-01-06T03:00'), fn)).toBe(true);
  });

  it('reject empty ranges and ranges starting at 24:00', () => {
    expect(() => isWorkingTime(dt('2024-01-01T00:00'), { hours: [['22:00', '22:00']] })).toThrow(/empty/);
    expect(() => isWorkingTime(dt('2024-01-01T00:00'), { hours: [['24:00', '06:00']] })).toThrow(/24:00/);
    expect(() =>
      isWorkingTime(dt('2024-01-01T00:00'), {
        hours: [
          ['22:00', '06:00'],
          ['23:00', '23:30'],
        ],
      }),
    ).toThrow(/overlap/);
  });
});

describe('SLA pauses', () => {
  const office: WorkingTimeOptions = { hours: [['09:00', '17:00']] };
  const pause = (a: string, b: string) => [dt(a), dt(b)] as const;

  it('leave paused working time out of the count', () => {
    const start = dt('2024-01-01T09:00');
    const end = dt('2024-01-03T17:00'); // 24 working hours
    expect(
      str(workingTimeBetween(start, end, office, { pauses: [pause('2024-01-02T09:00', '2024-01-02T13:00')] })),
    ).toBe('PT20H');
    // Paused overnight: only the working hours inside the pause are left out.
    expect(
      str(workingTimeBetween(start, end, office, { pauses: [pause('2024-01-01T16:00', '2024-01-02T10:00')] })),
    ).toBe('PT22H');
  });

  it('merge overlapping pauses and clip pauses to the range', () => {
    const start = dt('2024-01-01T09:00');
    const end = dt('2024-01-01T17:00');
    const pauses = [
      pause('2024-01-01T10:00', '2024-01-01T12:00'),
      pause('2024-01-01T11:00', '2024-01-01T13:00'),
      pause('2023-12-01T00:00', '2024-01-01T09:30'),
      pause('2024-01-01T16:30', '2024-02-01T00:00'),
    ];
    expect(str(workingTimeBetween(start, end, office, { pauses }))).toBe('PT4H');
    expect(
      str(workingTimeBetween(start, end, office, { pauses: [pause('2024-02-01T00:00', '2024-02-02T00:00')] })),
    ).toBe('PT8H');
    expect(str(workingTimeBetween(start, end, office, { pauses: [] }))).toBe('PT8H');
  });

  it('are negative-safe and work on calendars and ZonedDateTime', () => {
    const p = [pause('2024-01-01T10:00', '2024-01-01T11:00')];
    expect(str(workingTimeBetween(dt('2024-01-01T17:00'), dt('2024-01-01T09:00'), office, { pauses: p }))).toBe(
      '-PT7H',
    );
    expect(
      str(createWorkCalendar(office).workingTimeBetween(dt('2024-01-01T09:00'), dt('2024-01-01T17:00'), { pauses: p })),
    ).toBe('PT7H');
    const z = (s: string) => zdt(`${s}[Europe/Paris]`);
    expect(
      str(
        workingTimeBetween(z('2024-01-01T09:00'), z('2024-01-01T17:00'), office, {
          pauses: [[z('2024-01-01T09:00'), z('2024-01-01T12:00')]],
        }),
      ),
    ).toBe('PT5H');
  });

  it('give the remaining SLA time for a deadline', () => {
    // 8 working-hour SLA; the ticket waited on the customer Tuesday 09:00–13:00.
    const opened = dt('2024-01-01T15:00');
    const now = dt('2024-01-02T15:00');
    const used = workingTimeBetween(opened, now, office, { pauses: [pause('2024-01-02T09:00', '2024-01-02T13:00')] });
    expect(str(used)).toBe('PT4H');
    const deadline = addWorkingTime(now, Temporal.Duration.from({ hours: 8 }).subtract(used), office);
    expect(str(deadline)).toBe('2024-01-03T11:00:00');
  });

  it('reject malformed pauses', () => {
    const a = dt('2024-01-01T09:00');
    const b = dt('2024-01-01T17:00');
    expect(() => workingTimeBetween(a, b, office, { pauses: [pause('2024-01-01T12:00', '2024-01-01T11:00')] })).toThrow(
      /end before/,
    );
    expect(() => workingTimeBetween(a, b, office, { pauses: [[a]] as never })).toThrow(/pair/);
    expect(() => workingTimeBetween(a, b, office, { pauses: 'all' as never })).toThrow(/pauses must be/);
    expect(() => workingTimeBetween(a, b, office, { pause: [] } as never)).toThrow(/unknown option "pause"/);
    expect(() => workingTimeBetween(a, b, office, null as never)).toThrow(/options must be an object/);
    expect(() =>
      workingTimeBetween(a, b, office, {
        pauses: [[zdt('2024-01-01T10:00[UTC]'), zdt('2024-01-01T11:00[UTC]')]],
      } as never),
    ).toThrow(/same Temporal type/);
  });
});
