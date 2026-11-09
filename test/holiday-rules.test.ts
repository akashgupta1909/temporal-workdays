import Holidays from 'date-holidays';
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { orthodoxEaster, westernEaster } from '../src/holiday-rules.js';
import { createWorkCalendar, isHoliday, isWorkday, type HolidayInput, type WorkdayOptions } from '../src/index.js';
import { runs } from './arbitraries.js';

const d = (s: string) => Temporal.PlainDate.from(s);
const EPOCH = d('1970-01-01');
const fromEpochDay = (n: number) => EPOCH.add({ days: n }).toString();

function holidaysIn(year: number, options: WorkdayOptions): string[] {
  const cal = createWorkCalendar(options);
  const out: string[] = [];
  for (let x = d(`${year}-01-01`); x.year === year; x = x.add({ days: 1 }))
    if (cal.isHoliday(x)) out.push(x.toString());
  return out;
}
const publicHolidays = (hd: Holidays, year: number) =>
  [
    ...new Set(
      hd
        .getHolidays(year)
        .filter((h) => h.type === 'public')
        .map((h) => h.date.slice(0, 10)),
    ),
  ].sort();

// The README's examples, as rules.
const US_FEDERAL: HolidayInput[] = [
  { name: "New Year's Day", month: 1, day: 1 },
  { name: 'Martin Luther King Jr. Day', month: 1, dayOfWeek: 1, week: 3, from: 1986 },
  { name: "Washington's Birthday", month: 2, dayOfWeek: 1, week: 3 },
  { name: 'Memorial Day', month: 5, dayOfWeek: 1, week: -1 },
  { name: 'Juneteenth', month: 6, day: 19, from: 2021 },
  { name: 'Independence Day', month: 7, day: 4 },
  { name: 'Labor Day', month: 9, dayOfWeek: 1, week: 1 },
  { name: 'Columbus Day', month: 10, dayOfWeek: 1, week: 2 },
  { name: 'Veterans Day', month: 11, day: 11 },
  { name: 'Thanksgiving Day', month: 11, dayOfWeek: 4, week: 4 },
  { name: 'Christmas Day', month: 12, day: 25 },
];
const ENGLAND: HolidayInput[] = [
  { month: 1, day: 1 },
  { name: 'Good Friday', easter: -2 },
  { name: 'Easter Monday', easter: 1 },
  { month: 5, dayOfWeek: 1, week: 1 },
  { month: 5, dayOfWeek: 1, week: -1 },
  { month: 8, dayOfWeek: 1, week: -1 },
  { month: 12, day: 25 },
  { month: 12, day: 26 },
];

describe('rule-based holidays against date-holidays data', () => {
  it('rebuild US federal holidays with nearest-workday observance, 1990–2060', () => {
    const us = new Holidays('US');
    for (let year = 1990; year <= 2060; year++) {
      // 5 U.S.C. 6103 also moves Veterans Day off weekends (e.g. Fri 2023-11-10); date-holidays omits that.
      const veteransObserved = (s: string) => /-11-1[02]$/.test(s);
      const ours = holidaysIn(year, { holidays: US_FEDERAL, observed: 'nearest' }).filter((s) => !veteransObserved(s));
      expect(ours, String(year)).toEqual(publicHolidays(us, year));
    }
  });

  it('rebuild England & Wales bank holidays with next-workday substitutes, 1990–2060', () => {
    const england = new Holidays('GB', 'ENG');
    // One-off royal and national events, decided by proclamation, not by rule.
    const oneOffs = new Set([2012, 2020, 2022, 2023]);
    for (let year = 1990; year <= 2060; year++) {
      if (oneOffs.has(year)) continue;
      expect(holidaysIn(year, { holidays: ENGLAND, observed: 'next' }), String(year)).toEqual(
        publicHolidays(england, year),
      );
    }
  });

  it('computes Western and Orthodox Easter like date-holidays, 1900–2100', () => {
    const gb = new Holidays('GB');
    const gr = new Holidays('GR');
    for (let year = 1900; year <= 2100; year++) {
      const gbDates = new Set(gb.getHolidays(year).map((h) => h.date.slice(0, 10)));
      const grDates = new Set(gr.getHolidays(year).map((h) => h.date.slice(0, 10)));
      expect(gbDates.has(fromEpochDay(westernEaster(year) - 2)), `${year} Good Friday`).toBe(true);
      expect(gbDates.has(fromEpochDay(westernEaster(year) + 1)), `${year} Easter Monday`).toBe(true);
      expect(grDates.has(fromEpochDay(orthodoxEaster(year) - 2)), `${year} Orthodox Good Friday`).toBe(true);
      expect(grDates.has(fromEpochDay(orthodoxEaster(year) + 1)), `${year} Orthodox Easter Monday`).toBe(true);
    }
  });

  it('matches published Easter dates', () => {
    const western = {
      2024: '2024-03-31',
      2025: '2025-04-20',
      2026: '2026-04-05',
      2027: '2027-03-28',
      2038: '2038-04-25',
    };
    const orthodox = {
      2024: '2024-05-05',
      2025: '2025-04-20',
      2026: '2026-04-12',
      2027: '2027-05-02',
      2038: '2038-04-25',
    };
    for (const [y, s] of Object.entries(western)) expect(fromEpochDay(westernEaster(Number(y)))).toBe(s);
    for (const [y, s] of Object.entries(orthodox)) expect(fromEpochDay(orthodoxEaster(Number(y)))).toBe(s);
  });
});

describe('holiday rules', () => {
  it('nth and last weekdays, with offsets', () => {
    const rules: HolidayInput[] = [
      { month: 11, dayOfWeek: 4, week: 4, offset: 1 }, // day after Thanksgiving
      { month: 5, dayOfWeek: 1, week: -1 },
      { month: 3, dayOfWeek: 2, week: -2 }, // second-to-last Tuesday of March
    ];
    expect(holidaysIn(2026, { holidays: rules })).toEqual(['2026-03-24', '2026-05-25', '2026-11-27']);
  });

  it('skips a 5th weekday that does not exist that month', () => {
    // March 2026 has five Mondays; February 2026 has four.
    expect(
      holidaysIn(2026, {
        holidays: [
          { month: 3, dayOfWeek: 1, week: 5 },
          { month: 2, dayOfWeek: 1, week: 5 },
        ],
      }),
    ).toEqual(['2026-03-30']);
    expect(holidaysIn(2026, { holidays: [{ month: 2, dayOfWeek: 1, week: -5 }] })).toEqual([]);
  });

  it('fixed rules, one-off date rules, and February 29', () => {
    expect(holidaysIn(2028, { holidays: [{ month: 2, day: 29 }, { date: '2028-07-03' }] })).toEqual([
      '2028-02-29',
      '2028-07-03',
    ]);
    expect(holidaysIn(2027, { holidays: [{ month: 2, day: 29 }, { date: d('2028-07-03') }] })).toEqual([]);
  });

  it('respects from/to years', () => {
    const rule: HolidayInput = { month: 6, day: 19, from: 2021, to: 2030 };
    expect(isHoliday(d('2020-06-19'), { holidays: [rule] })).toBe(false);
    expect(isHoliday(d('2021-06-18'), { holidays: [rule], observed: 'nearest' })).toBe(true); // Saturday → Friday
    expect(isHoliday(d('2030-06-19'), { holidays: [rule] })).toBe(true);
    expect(isHoliday(d('2031-06-19'), { holidays: [rule] })).toBe(false);
  });

  it('Orthodox Easter rules', () => {
    expect(holidaysIn(2026, { holidays: [{ easter: 0, orthodox: true }, { easter: 0 }] })).toEqual([
      '2026-04-05',
      '2026-04-12',
    ]);
  });
});

describe('observed holidays', () => {
  it('nearest: Saturday → Friday, Sunday → Monday, across year boundaries', () => {
    const o: WorkdayOptions = { holidays: ['01-01', '07-04'], observed: 'nearest' };
    expect(isHoliday(d('2021-12-31'), o)).toBe(true); // 2022-01-01 is a Saturday
    expect(isHoliday(d('2021-07-05'), o)).toBe(true); // 2021-07-04 is a Sunday
    expect(isHoliday(d('2021-07-04'), o)).toBe(true); // the actual date stays a holiday
    expect(isWorkday(d('2021-07-02'), o)).toBe(true);
  });

  it('next: substitutes skip days already taken (UK Christmas and Boxing Day)', () => {
    // 2021-12-25 is a Saturday and 2021-12-26 a Sunday.
    expect(holidaysIn(2021, { holidays: ['12-25', '12-26'], observed: 'next' }).slice(-4)).toEqual([
      '2021-12-25',
      '2021-12-26',
      '2021-12-27',
      '2021-12-28',
    ]);
  });

  it('previous, per-rule overrides, and none', () => {
    const o: WorkdayOptions = {
      holidays: [{ month: 7, day: 4, observed: 'previous' }, { month: 12, day: 25, observed: 'none' }, '01-01'],
      observed: 'next',
    };
    expect(isHoliday(d('2021-07-02'), o)).toBe(true); // Sunday 07-04 → Friday
    expect(isHoliday(d('2022-12-26'), o)).toBe(false); // Sunday Christmas not moved
    expect(isHoliday(d('2022-01-03'), o)).toBe(true); // Saturday 01-01 → Monday
    expect(isHoliday(d('2021-07-05'), { holidays: ['07-04'] })).toBe(false); // default: none
  });

  it('looks further when the nearest day is itself a holiday', () => {
    // 2026-07-04 is a Saturday and Friday 07-03 is also a holiday: observed on Monday 07-06.
    const o: WorkdayOptions = { holidays: ['07-03', '07-04'], observed: 'nearest' };
    expect(isHoliday(d('2026-07-06'), o)).toBe(true);
    expect(isHoliday(d('2026-07-02'), o)).toBe(false);
  });

  it('gives up quietly when there is no free day to observe on', () => {
    const o: WorkdayOptions = {
      holidays: ['07-04'],
      observed: 'next',
      weekend: [1, 2, 3, 4, 5, 6, 7],
      extraWorkdays: ['2026-07-04'],
    };
    expect(isHoliday(d('2026-07-04'), o)).toBe(false); // an extra workday overrides it
    expect(isHoliday(d('2026-07-05'), o)).toBe(false);
  });

  it('works with other weekends', () => {
    // Friday–Saturday weekend: a Friday holiday is observed on the nearest workday, Thursday.
    expect(isHoliday(d('2026-07-02'), { holidays: ['07-03'], weekend: [5, 6], observed: 'nearest' })).toBe(true);
  });

  it('does not observe a holidays function, and extra workdays still win', () => {
    expect(isHoliday(d('2021-07-05'), { holidays: (x) => x.month === 7 && x.day === 4, observed: 'nearest' })).toBe(
      false,
    );
    expect(
      isWorkday(d('2021-07-05'), { holidays: ['07-04'], observed: 'nearest', extraWorkdays: ['2021-07-05'] }),
    ).toBe(true);
  });
});

describe('validation', () => {
  const bad = (holidays: unknown) => () => isWorkday(d('2026-01-01'), { holidays: holidays as HolidayInput[] });
  it('rejects malformed rules', () => {
    expect(bad([{ month: 13, day: 1 }])).toThrow(RangeError);
    expect(bad([{ month: 2, day: 30 }])).toThrow(RangeError);
    expect(bad([{ month: 1, dayOfWeek: 1, week: 0 }])).toThrow(/week/);
    expect(bad([{ month: 1, dayOfWeek: 8, week: 1 }])).toThrow(RangeError);
    expect(bad([{ month: 1, dayOfWeek: 1, week: 6 }])).toThrow(RangeError);
    expect(bad([{ month: 1, day: 1, easter: 0 }])).toThrow(/exactly one/);
    expect(bad([{ month: 1 }])).toThrow(/exactly one/);
    expect(bad([{ month: 1, day: 1, color: 'red' }])).toThrow(/unknown holiday rule field "color"/);
    expect(bad([{ month: 1, day: 1, observed: 'monday' }])).toThrow(/observed/);
    expect(bad([{ month: 1, day: 1, from: 2030, to: 2020 }])).toThrow(/from/);
    expect(bad([{ month: 1, day: 1, name: 3 }])).toThrow(TypeError);
    expect(bad([{ easter: 0, orthodox: 'yes' }])).toThrow(TypeError);
    expect(bad([{ easter: 1.5 }])).toThrow(RangeError);
    expect(bad([{ month: 1, day: 1, offset: 1000 }])).toThrow(RangeError);
    expect(bad([['01-01']])).toThrow(TypeError);
    expect(bad([42])).toThrow(TypeError);
    expect(() => isWorkday(d('2026-01-01'), { observed: 'weekend' as never })).toThrow(/observed/);
    expect(bad([{ date: 20260101 }])).toThrow(TypeError);
    expect(() => isWorkday(d('2026-01-01'), { extraWorkdays: [20260101 as never] })).toThrow(TypeError);
  });
});

describe('properties', () => {
  it('nth-weekday rules agree with a naive Temporal search', () => {
    const rule = fc.record({
      year: fc.integer({ min: 1900, max: 2200 }),
      month: fc.integer({ min: 1, max: 12 }),
      dayOfWeek: fc.integer({ min: 1, max: 7 }),
      week: fc.oneof(fc.integer({ min: 1, max: 5 }), fc.integer({ min: -5, max: -1 })),
    });
    fc.assert(
      fc.property(rule, ({ year, month, dayOfWeek, week }) => {
        const matches: string[] = [];
        for (let x = d(`${year}-${String(month).padStart(2, '0')}-01`); x.month === month; x = x.add({ days: 1 })) {
          if (x.dayOfWeek === dayOfWeek) matches.push(x.toString());
        }
        const expected = week > 0 ? matches[week - 1] : matches[matches.length + week];
        const holidays: HolidayInput[] = [{ month, dayOfWeek: dayOfWeek as 1, week }];
        const got = holidaysIn(year, { holidays }).filter((s) => Number(s.slice(5, 7)) === month);
        expect(got).toEqual(expected === undefined ? [] : [expected]);
      }),
      runs(300),
    );
  });

  it('observed substitutes are always free workdays near the holiday', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1950, max: 2150 }),
        fc.constantFrom('nearest', 'next', 'previous' as const),
        (year, observed) => {
          const options: WorkdayOptions = { holidays: US_FEDERAL, observed };
          const plain = new Set(holidaysIn(year, { holidays: US_FEDERAL }));
          for (const s of holidaysIn(year, options)) {
            if (plain.has(s)) continue; // the holiday itself
            const day = d(s);
            expect(day.dayOfWeek, s).toBeLessThan(6); // substitutes are weekdays
            const nearby = [-3, -2, -1, 1, 2, 3].map((k) => day.add({ days: k }).toString());
            // A substitute is always within three days of some rule date.
            expect(nearby.some((x) => plain.has(x) || x.slice(5) === '01-01' || x.slice(5) === '12-31')).toBe(true);
          }
        },
      ),
      runs(100),
    );
  });
});
