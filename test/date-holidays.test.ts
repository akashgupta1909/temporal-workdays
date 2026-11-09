import Holidays from 'date-holidays';
import { Temporal } from 'temporal-polyfill/full';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addWorkdays,
  addWorkingTime,
  createWorkCalendar,
  fromDateHolidays,
  getWorkingHours,
  isWorkday,
  type DateHolidaysSource,
  type WorkingTimeOptions,
} from '../src/index.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const office = { hours: [['09:00', '17:00']] } as const;
const ORIGINAL_TZ = process.env['TZ'];

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

describe('fromDateHolidays', () => {
  it('uses public US holidays, including substitute days', () => {
    const us = fromDateHolidays(new Holidays('US'));
    expect(isWorkday(d('2026-11-26'), us)).toBe(false); // Thanksgiving
    expect(isWorkday(d('2026-07-03'), us)).toBe(false); // Independence Day observed (Friday)
    expect(isWorkday(d('2026-12-24'), us)).toBe(true); // Christmas Eve is only "optional"
    expect(addWorkdays(d('2026-11-25'), 1, us).toString()).toBe('2026-11-27');
  });

  // Changing process.env.TZ only affects Date in a process's main thread. Some runners (Stryker's
  // worker threads) can't switch zones, so check that first rather than pass or fail for the wrong reason.
  const rawThanksgiving = (tz: string): boolean => {
    process.env['TZ'] = tz;
    return Boolean(new Holidays('US').isHoliday(new Date(2026, 10, 26)));
  };
  const canSwitchTimeZone = rawThanksgiving('Asia/Kolkata') !== rawThanksgiving('America/Los_Angeles');

  it.runIf(canSwitchTimeZone)('gives the same answers whatever the machine time zone is', () => {
    // date-holidays' own isHoliday() gets Thanksgiving wrong east of the US (see the check above); the adapter must not.
    const answers = (): boolean[] => {
      const us = fromDateHolidays(new Holidays('US'));
      return ['2026-11-26', '2026-12-25', '2026-01-01', '2026-12-24'].map((s) => isWorkday(d(s), us));
    };
    for (const tz of ['UTC', 'Asia/Kolkata', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Los_Angeles']) {
      process.env['TZ'] = tz;
      expect(answers(), tz).toEqual([false, false, false, true]);
    }
  });

  it('selects holiday types', () => {
    const bavaria = new Holidays('DE', 'BY');
    expect(isWorkday(d('2026-12-24'), fromDateHolidays(bavaria))).toBe(true);
    // Christmas Eve is a "bank" holiday from 14:00: still a workday, with shorter hours.
    const withBank: WorkingTimeOptions = { ...fromDateHolidays(bavaria, { types: ['public', 'bank'] }), ...office };
    expect(isWorkday(d('2026-12-24'), withBank)).toBe(true);
    expect(getWorkingHours(d('2026-12-24'), withBank)).toEqual([['09:00', '14:00']]);
    expect(getWorkingHours(d('2026-12-23'), withBank)).toEqual([['09:00', '17:00']]);
    expect(getWorkingHours(d('2026-12-25'), withBank)).toEqual([]);
    const t = addWorkingTime(Temporal.PlainDateTime.from('2026-12-24T13:00'), { hours: 2 }, withBank);
    expect(t.toString()).toBe('2026-12-28T10:00:00'); // 24th closes 14:00; 25th/26th holidays; 27th Sunday
  });

  it('applies morning closures', () => {
    // Brazil: Ash Wednesday ("Carnaval", optional) is closed until 14:00.
    const br: WorkingTimeOptions = { ...fromDateHolidays(new Holidays('BR'), { types: ['optional'] }), ...office };
    expect(getWorkingHours(d('2026-02-18'), br)).toEqual([['14:00', '17:00']]);
  });

  it('expands multi-day and eve-start holidays to the days they fully cover', () => {
    // Saudi Eid al-Fitr 2026: reported as 2026-03-18 18:00 → 2026-03-22 18:00 local.
    const sa = createWorkCalendar({ ...fromDateHolidays(new Holidays('SA')), weekend: [5, 6], ...office });
    expect(['2026-03-19', '2026-03-20', '2026-03-21'].map((s) => sa.isHoliday(d(s)))).toEqual([true, true, true]);
    expect(sa.isHoliday(d('2026-03-18'))).toBe(false);
    expect(sa.getWorkingHours(d('2026-03-18'))).toEqual([['09:00', '17:00']]); // closure starts 18:00
    expect(sa.getWorkingHours(d('2026-03-22'))).toEqual([]); // closed until 18:00
    // Turkey: Ramazan Bayramı 2026-03-19 18:00 → 2026-03-23 12:00 local.
    const tr = createWorkCalendar({ ...fromDateHolidays(new Holidays('TR')), ...office });
    expect(tr.getWorkingHours(d('2026-03-23'))).toEqual([['12:00', '17:00']]);
    expect(tr.isWorkday(d('2026-03-20'))).toBe(false);
  });

  it('handles holidays that reach into the previous or next year', () => {
    const source: DateHolidaysSource = {
      getHolidays: (year) =>
        year === 2027
          ? [{ date: '2027-01-01 00:00:00 -0600', type: 'public', start: new Date(0), end: new Date(30 * 3600_000) }]
          : [],
    };
    const options: WorkingTimeOptions = { ...fromDateHolidays(source), hours: [['09:00', '20:00']] };
    // Starts 2026-12-31 18:00, lasts 30h: closes the evening of the 31st and all of New Year's Day.
    expect(getWorkingHours(d('2026-12-31'), options)).toEqual([['09:00', '18:00']]);
    expect(isWorkday(d('2027-01-01'), options)).toBe(false);
  });

  it('snaps DST-length holidays (23h/25h) to whole days', () => {
    const source: DateHolidaysSource = {
      getHolidays: () => [
        { date: '2026-03-08 00:00:00', type: 'public', start: new Date(0), end: new Date(23 * 3600_000) },
        { date: '2026-11-01 00:00:00', type: 'public', start: new Date(0), end: new Date(25 * 3600_000) },
      ],
    };
    const o: WorkingTimeOptions = { ...fromDateHolidays(source), weekend: [], ...office };
    expect(isWorkday(d('2026-03-08'), o)).toBe(false);
    expect(isWorkday(d('2026-11-01'), o)).toBe(false);
    expect(getWorkingHours(d('2026-11-02'), o)).toEqual([['09:00', '17:00']]);
  });

  it('caches per year and works with non-ISO dates', () => {
    let calls = 0;
    const source: DateHolidaysSource = {
      getHolidays: (year) => {
        calls++;
        return [{ date: `${year}-05-01 00:00:00`, type: 'public', start: new Date(0), end: new Date(86_400_000) }];
      },
    };
    const o = fromDateHolidays(source);
    expect(isWorkday(d('2026-05-01').withCalendar('hebrew'), o)).toBe(false);
    expect(isWorkday(d('2026-05-04'), o)).toBe(true);
    expect(calls).toBe(3); // 2025, 2026, 2027 once each
  });

  it('rejects bad input', () => {
    expect(() => fromDateHolidays({} as never)).toThrow(/getHolidays/);
    expect(() => fromDateHolidays(null as never)).toThrow(/getHolidays/);
    expect(() => fromDateHolidays(new Holidays('US'), { types: 'public' as never })).toThrow(/types must be/);
    expect(() => fromDateHolidays(new Holidays('US'), { types: [1] as never })).toThrow(/types must be/);
    const bad = (entry: object) => fromDateHolidays({ getHolidays: () => [entry as never] }).holidays(d('2026-01-01'));
    expect(() => bad({ date: '2026-01-01', type: 'public', start: new Date(0), end: new Date(1) })).toThrow(
      /unexpected date-holidays date/,
    );
    expect(() => bad({ date: '2026-01-01 00:00:00', type: 'public', start: new Date(1), end: new Date(1) })).toThrow(
      /no valid start\/end/,
    );
    expect(() =>
      bad({ date: '2026-01-01 00:00:00', type: 'public', start: new Date(0), end: new Date(Number.NaN) }),
    ).toThrow(/no valid start\/end/);
  });

  it('accepts a positive time shift too', () => {
    // '+1200' shifts the start to 12:00; 5 hours long, so closed 12:00–17:00.
    const source: DateHolidaysSource = {
      getHolidays: () => [
        { date: '2026-06-01 00:00:00 +1200', type: 'public', start: new Date(0), end: new Date(5 * 3600_000) },
      ],
    };
    expect(getWorkingHours(d('2026-06-01'), { ...fromDateHolidays(source), ...office })).toEqual([['09:00', '12:00']]);
  });
});
