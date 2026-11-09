// The README's luxon-business-days migration table, checked against the real package.
import fc from 'fast-check';
import { DateTime } from 'luxon-business-days';
import { Temporal } from 'temporal-polyfill/full';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addWorkdays,
  isHoliday,
  isWeekend,
  isWorkday,
  subtractWorkdays,
  type DayOfWeek,
  type HolidayInput,
} from '../src/index.js';
import { plainDate, runs } from './arbitraries.js';

/** luxon-business-days' default holidays (UPS shipping holidays), as rules — copy this into your options. */
const LUXON_DEFAULT_HOLIDAYS: HolidayInput[] = [
  '01-01',
  { easter: 0 },
  { month: 5, dayOfWeek: 1, week: -1 },
  '07-04',
  { month: 9, dayOfWeek: 1, week: 1 },
  { month: 11, dayOfWeek: 4, week: 4 },
  '12-25',
];

const lux = (d: Temporal.PlainDate) => DateTime.fromObject({ year: d.year, month: d.month, day: d.day });
const businessDays = fc.subarray([1, 2, 3, 4, 5, 6, 7] as DayOfWeek[], { minLength: 1 });
const weekendOf = (days: DayOfWeek[]) => ([1, 2, 3, 4, 5, 6, 7] as DayOfWeek[]).filter((d) => !days.includes(d));

afterEach(() => {
  DateTime.local().clearBusinessSetup(); // setupBusiness() is global: reset between tests
});

describe('migration from luxon-business-days', () => {
  it('default holidays → the seven rules above, for every day 1900–2200', () => {
    for (let d = Temporal.PlainDate.from('1900-01-01'); d.year <= 2200; d = d.add({ days: 1 })) {
      if (lux(d).isHoliday() !== isHoliday(d, { holidays: LUXON_DEFAULT_HOLIDAYS })) {
        expect.fail(`holiday mismatch on ${d.toString()}`);
      }
    }
  }, 60_000); // exhaustive: about 110,000 days through luxon

  it('dt.plusBusiness({ days }) / minusBusiness → addWorkdays / subtractWorkdays', () => {
    fc.assert(
      fc.property(businessDays, plainDate, fc.integer({ min: -30, max: 30 }), (days, d, n) => {
        DateTime.local().setupBusiness({ businessDays: days });
        const options = { weekend: weekendOf(days), holidays: LUXON_DEFAULT_HOLIDAYS };
        expect(addWorkdays(d, n, options).toString()).toBe(lux(d).plusBusiness({ days: n }).toISODate());
        expect(subtractWorkdays(d, n, options).toString()).toBe(lux(d).minusBusiness({ days: n }).toISODate());
      }),
      runs(300),
    );
  });

  it('dt.isBusinessDay() only checks the weekday → !isWeekend(d); with holidays → isWorkday(d)', () => {
    fc.assert(
      fc.property(businessDays, plainDate, (days, d) => {
        DateTime.local().setupBusiness({ businessDays: days });
        const options = { weekend: weekendOf(days), holidays: LUXON_DEFAULT_HOLIDAYS };
        const dt = lux(d);
        expect(!isWeekend(d, options)).toBe(dt.isBusinessDay());
        expect(isWorkday(d, options)).toBe(dt.isBusinessDay() && !dt.isHoliday());
      }),
      runs(300),
    );
  });

  it('custom holiday matchers → a holidays function', () => {
    const isCompanyDay = (dt: { month: number; day: number }) => dt.month === 3 && dt.day === 14;
    DateTime.local().setupBusiness({ holidayMatchers: [isCompanyDay] });
    const options = { holidays: (d: Temporal.PlainDate) => isCompanyDay(d) };
    fc.assert(
      fc.property(plainDate, fc.integer({ min: -20, max: 20 }), (d, n) => {
        expect(addWorkdays(d, n, options).toString()).toBe(lux(d).plusBusiness({ days: n }).toISODate());
      }),
      runs(200),
    );
  });
});
