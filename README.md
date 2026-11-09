# temporal-workdays

[![npm version](https://img.shields.io/npm/v/temporal-workdays.svg)](https://www.npmjs.com/package/temporal-workdays)
[![CI](https://github.com/akashgupta1909/temporal-workdays/actions/workflows/ci.yml/badge.svg)](https://github.com/akashgupta1909/temporal-workdays/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlejs/size/temporal-workdays)](https://bundlejs.com/?q=temporal-workdays)
[![types](https://img.shields.io/npm/types/temporal-workdays.svg)](https://www.npmjs.com/package/temporal-workdays)
[![license](https://img.shields.io/npm/l/temporal-workdays.svg)](LICENSE)

Business days and business hours for the JavaScript [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal).

- **Workdays** — add/subtract workdays, count them, list them; custom weekends, holidays and make-up days.
- **Working hours** — "add 4 business hours", working time between two moments, breaks, half days, per-date hours. Exact across DST changes.
- **Holiday data** — plug in [`date-holidays`](https://www.npmjs.com/package/date-holidays) (200+ countries), time-zone safe.
- **Built for Temporal** — `PlainDate`, `PlainDateTime` and `ZonedDateTime` in, the same type out. Works with native Temporal, `temporal-polyfill` or `@js-temporal/polyfill`; no global `Temporal` needed, at runtime or in your types.
- **Small and strict** — zero dependencies, tree-shakeable (workdays alone ≈ 3.2 kB, everything ≈ 7.4 kB min+brotli), ESM + CommonJS, strict TypeScript types, clear errors instead of silently wrong dates.

```sh
npm install temporal-workdays
```

**Coming from another library?** Migration guides for
[moment-business-days](#migrating-from-moment-business-days),
[luxon-business-days](#migrating-from-luxon-business-days) and [date-fns](#coming-from-date-fns), each checked against
the real library in the test suite.

## Workdays

```ts
import { addWorkdays, isWorkday, workdaysBetween } from 'temporal-workdays';

const friday = Temporal.PlainDate.from('2026-11-06');

addWorkdays(friday, 1).toString(); // → '2026-11-09'
addWorkdays(friday, -5).toString(); // → '2026-10-30'
isWorkday(Temporal.PlainDate.from('2026-11-07')); // → false
workdaysBetween(Temporal.PlainDate.from('2026-11-02'), Temporal.PlainDate.from('2026-11-09')); // → 5
```

Holidays, other weekends and make-up working days:

```ts
import { createWorkCalendar } from 'temporal-workdays';

const calendar = createWorkCalendar({
  weekend: [5, 6], // Friday + Saturday (ISO: 1 = Monday … 7 = Sunday)
  holidays: ['2026-03-20', '12-25'], // one date, and every Dec 25
  extraWorkdays: ['2026-03-28'], // a Saturday that is a working day
});

calendar.isWorkday(Temporal.PlainDate.from('2026-03-20')); // → false
calendar.isWorkday(Temporal.PlainDate.from('2026-03-28')); // → true
calendar.nextWorkday(Temporal.PlainDate.from('2026-03-19')).toString(); // → '2026-03-22'
```

`createWorkCalendar` validates and parses the options once. Every function also takes the options as its last
argument, e.g. `addWorkdays(date, 3, { holidays })`.

### Holiday rules and observed days

Holidays can be rules: a fixed date every year, the nth (or last) weekday of a month, or a day relative to Easter.
`observed` moves holidays that fall on a weekend to a workday.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const usFederal = createWorkCalendar({
  observed: 'nearest', // Saturday → Friday, Sunday → Monday
  holidays: [
    '01-01',
    { name: 'MLK Day', month: 1, dayOfWeek: 1, week: 3 },
    { name: 'Memorial Day', month: 5, dayOfWeek: 1, week: -1 },
    { name: 'Juneteenth', month: 6, day: 19, from: 2021 },
    '07-04',
    { name: 'Thanksgiving', month: 11, dayOfWeek: 4, week: 4 },
    '12-25',
  ],
});

// July 4, 2026 is a Saturday, so it is observed on Friday the 3rd.
usFederal.isHoliday(Temporal.PlainDate.from('2026-07-03')); // → true
usFederal.isHoliday(Temporal.PlainDate.from('2026-11-26')); // → true
// New Year's Day 2022 was a Saturday: observed on Friday, December 31, 2021.
usFederal.isHoliday(Temporal.PlainDate.from('2021-12-31')); // → true

const england = createWorkCalendar({
  observed: 'next', // the next free workday
  holidays: [{ name: 'Good Friday', easter: -2 }, { name: 'Easter Monday', easter: 1 }, '12-25', '12-26'],
});

england.isHoliday(Temporal.PlainDate.from('2026-04-03')); // → true
// Christmas 2021 was a Saturday and Boxing Day a Sunday: observed Monday the 27th and Tuesday the 28th.
england.isHoliday(Temporal.PlainDate.from('2021-12-28')); // → true
```

| Rule                                 | Example                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| every year on a date                 | `'12-25'` or `{ month: 12, day: 25 }`                      |
| nth weekday of a month (`-1` = last) | `{ month: 11, dayOfWeek: 4, week: 4 }`                     |
| relative to Easter Sunday            | `{ easter: -2 }`, `{ easter: 1, orthodox: true }`          |
| one date                             | `'2026-07-03'` or `{ date: '2026-07-03' }`                 |
| options on any rule                  | `offset` (days), `from` / `to` (years), `observed`, `name` |

`observed` is `'nearest'`, `'next'`, `'previous'` or `'none'` (the default), and can also be set per rule. These rules
are tested against [`date-holidays`](https://www.npmjs.com/package/date-holidays): the US federal and England & Wales
holidays above match its data for every year from 1990 to 2060, and Western and Orthodox Easter for 1900–2100.

## Working hours

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({
  hours: [
    ['09:00', '12:00'],
    ['13:00', '17:00'],
  ],
});

const ticket = Temporal.ZonedDateTime.from('2026-11-06T16:00[America/New_York]'); // Friday
const due = support.addWorkingTime(ticket, { hours: 4 }); // SLA: 4 business hours
due.toString(); // → '2026-11-09T12:00:00-05:00[America/New_York]'

const spent = support.workingTimeBetween(ticket, Temporal.ZonedDateTime.from('2026-11-09T14:30[America/New_York]'));
spent.toString(); // → 'PT5H30M'
spent.total('hours'); // → 5.5

support.isWorkingTime(Temporal.ZonedDateTime.from('2026-11-09T12:30[America/New_York]')); // → false
support.rollForwardToWorkingTime(Temporal.PlainDateTime.from('2026-11-07T10:00')).toString(); // → '2026-11-09T09:00:00'
```

Hours per day of week, and special hours for specific dates:

```ts
import { createWorkCalendar } from 'temporal-workdays';

const shop = createWorkCalendar({
  hours: { default: [['09:00', '18:00']], 5: [['09:00', '14:00']] }, // Fridays until 14:00
  specialHours: {
    '2026-12-24': [['09:00', '12:00']], // half day
    '2026-12-31': [], // closed
  },
});

shop.getWorkingHours(Temporal.PlainDate.from('2026-12-04')); // → [['09:00', '14:00']]
shop.getWorkingHours(Temporal.PlainDate.from('2026-12-24')); // → [['09:00', '12:00']]
```

`specialHours` can also be a function `(date, regularHours) => hours | undefined`.

### Overnight shifts

A range whose end is before its start runs into the next morning. It belongs to the day it starts, so Friday's night
shift is worked even though Saturday is a weekend:

```ts
import { createWorkCalendar } from 'temporal-workdays';

const nights = createWorkCalendar({ hours: [['22:00', '06:00']] });

// Saturday 03:00 is inside Friday's shift.
nights.isWorkingTime(Temporal.PlainDateTime.from('2026-11-07T03:00')); // → true
// 7 hours finish Friday's shift; the next shift is Monday night.
nights.addWorkingTime(Temporal.PlainDateTime.from('2026-11-06T23:00'), { hours: 8 }).toString(); // → '2026-11-09T23:00:00'
nights.getWorkingHours(Temporal.PlainDate.from('2026-11-06')); // → [['22:00', '06:00']]
```

### Pausing the clock

Support SLAs usually stop while a ticket waits on the customer. Pass the paused periods to `workingTimeBetween`, then
add what's left to get the deadline:

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({ hours: [['09:00', '17:00']] });

const opened = Temporal.PlainDateTime.from('2026-11-09T15:00'); // Monday
const now = Temporal.PlainDateTime.from('2026-11-10T15:00');
const waitingOnCustomer = [
  [Temporal.PlainDateTime.from('2026-11-10T09:00'), Temporal.PlainDateTime.from('2026-11-10T13:00')],
];

const used = support.workingTimeBetween(opened, now, { pauses: waitingOnCustomer });
used.toString(); // → 'PT4H'

const deadline = support.addWorkingTime(now, Temporal.Duration.from({ hours: 8 }).subtract(used));
deadline.toString(); // → '2026-11-11T11:00:00'
```

Pauses may overlap each other and the ends of the range; each working minute is left out at most once.

How the edges work:

- Periods are `[start, end)`: in `09:00–17:00`, 17:00 is not working time. Adding time that ends exactly at the end
  of a period returns that end (`16:00 + 1h` → `17:00`), and subtracting to a start returns that start.
- Starting outside working hours, counting begins at the next working period.
- `ZonedDateTime` measures real elapsed time: a 09:00–17:00 day is still 8 hours, but `00:00–24:00` on a
  spring-forward day is 23. Wall times skipped by DST move forward, like Temporal's `'compatible'`.
- Weekends and holidays have no working hours. Special hours override everything for their date.

## Holidays from `date-holidays`

```ts
import Holidays from 'date-holidays';
import { createWorkCalendar, fromDateHolidays } from 'temporal-workdays';

const bavaria = createWorkCalendar({
  ...fromDateHolidays(new Holidays('DE', 'BY'), { types: ['public', 'bank'] }),
  hours: [['09:00', '17:00']],
});

bavaria.isWorkday(Temporal.PlainDate.from('2026-12-25')); // → false
bavaria.getWorkingHours(Temporal.PlainDate.from('2026-12-24')); // → [['09:00', '14:00']]
```

- `types` picks which holiday types close the business (default `['public']`).
- Days a holiday covers completely are holidays; partly covered days keep reduced hours (Christmas Eve from 14:00).
- Answers don't depend on the machine's time zone. (Calling `date-holidays`' own `isHoliday(new Date(…))` does:
  run in India, it says US Thanksgiving is not a holiday.)
- `temporal-workdays` doesn't depend on `date-holidays`; install it yourself if you use this.

To combine it with your own holidays, wrap the predicate:

```ts
import Holidays from 'date-holidays';
import { fromDateHolidays, isWorkday } from 'temporal-workdays';

const us = fromDateHolidays(new Holidays('US'));
const companyDays = ['2026-12-24'];
const options = { ...us, holidays: (date) => us.holidays(date) || companyDays.includes(date.toString()) };

isWorkday(Temporal.PlainDate.from('2026-12-24'), options); // → false
isWorkday(Temporal.PlainDate.from('2026-11-26'), options); // → false
```

## API

`T` is the Temporal type you pass in, and is also what you get back.

### Workdays — accept `PlainDate`, `PlainDateTime` or `ZonedDateTime`

| Function                                                  | Returns                                                                                                          |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `isWorkday(date)` / `isWeekend(date)` / `isHoliday(date)` | `boolean`. `extraWorkdays` always count as workdays.                                                             |
| `addWorkdays(date, n)` / `subtractWorkdays(date, n)`      | `T`, `n` workdays away. `n = 0` returns `date`; from a non-workday, `+1` is the next workday.                    |
| `nextWorkday(date)` / `previousWorkday(date)`             | `T`, the nearest workday strictly after / before.                                                                |
| `rollForward(date)` / `rollBackward(date)`                | `T`: `date` if it is a workday, else the next / previous one.                                                    |
| `workdaysBetween(start, end)`                             | `number` of workdays in `(start, end]`; negative if `end < start`. `workdaysBetween(d, addWorkdays(d, n)) === n` |
| `eachWorkday(start, end)`                                 | A generator of every workday in `[start, end]`, as `T`.                                                          |
| `workdaysInMonth(date)`                                   | `T[]`, every workday in `date`'s month (in its own calendar).                                                    |
| `workdayOfMonth(date)`                                    | `number` of workdays in the month up to and including `date` (1 on the first workday).                           |
| `workdaysByWeek(start, end)`                              | `T[][]`, the workdays in `[start, end]` grouped by week; weeks start after the weekend.                          |

### Working time — accept `PlainDateTime` or `ZonedDateTime`, need `hours`

| Function                                                                         | Returns                                                                                                  |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `isWorkingTime(dateTime)`                                                        | `boolean`                                                                                                |
| `addWorkingTime(dateTime, duration)` / `subtractWorkingTime(dateTime, duration)` | `T`. `duration` is a `Temporal.Duration` or `{ hours, minutes, … }` (no days/weeks/months).              |
| `workingTimeBetween(start, end, { pauses })`                                     | `Temporal.Duration` balanced up to hours (`PT27H30M`); negative if `end < start`; `pauses` are left out. |
| `rollForwardToWorkingTime(dateTime)` / `rollBackwardToWorkingTime(dateTime)`     | `T`: `dateTime` if it is working time, else the next period start / previous period end.                 |
| `getWorkingHours(date)`                                                          | The periods of that date, e.g. `[['09:00', '17:00']]`.                                                   |

### Calendars and adapters

| Function                                | Returns                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createWorkCalendar(options)`           | All of the above bound to `options`. Working-time methods are included when `hours` is given. |
| `fromDateHolidays(holidays, { types })` | `{ holidays, specialHours }` to spread into options.                                          |

### Options

| Option          | Type                                                                                                                                                                                                                                  | Default                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `weekend`       | ISO days of week, `1` (Mon) … `7` (Sun)                                                                                                                                                                                               | `[6, 7]`                  |
| `holidays`      | `'YYYY-MM-DD'`, `'MM-DD'` (yearly), `Temporal.PlainDate`, `Temporal.PlainMonthDay`, [rules](#holiday-rules-and-observed-days), or `(date) => boolean`                                                                                 | none                      |
| `observed`      | `'nearest'`, `'next'`, `'previous'` or `'none'`: where listed holidays on a weekend are observed                                                                                                                                      | `'none'`                  |
| `extraWorkdays` | `'YYYY-MM-DD'` or `Temporal.PlainDate`: workdays even on a weekend or holiday                                                                                                                                                         | none                      |
| `hours`         | `[[start, end], …]` for every workday, or `{ 1: […], …, 7: […], default: […] }`. Times are `'HH:MM[:SS[.f]]'` or `Temporal.PlainTime`; `'24:00'` may end a period; an end before the start is an [overnight](#overnight-shifts) range | required for working time |
| `specialHours`  | `{ 'YYYY-MM-DD': [[start, end], …] }` (`[]` = closed), or `(date, regularHours) => hours \| undefined`                                                                                                                                | none                      |

Invalid input throws a `RangeError` or `TypeError` that says what is wrong, including unknown option names.
A configuration without any workdays or working time throws instead of looping forever.

## Requirements

A Temporal implementation: native in Firefox 139+, Chrome 144+ and Node.js 26+; elsewhere (Safari/iOS, older Node) use
a polyfill:

```js
import 'temporal-polyfill/global'; // installs a global Temporal
// or, without touching globals:
import { Temporal } from 'temporal-polyfill';
```

`temporal-polyfill` is ESM-only. With `require()` on Node 18 or Node 20 before 20.19, which can't `require()` ES
modules, use [`@js-temporal/polyfill`](https://www.npmjs.com/package/@js-temporal/polyfill) instead (also tested with
this package), or load `temporal-polyfill` with `await import('temporal-polyfill')`:

```js
const { Temporal } = require('@js-temporal/polyfill');
const { addWorkdays } = require('temporal-workdays');
```

Non-ISO calendars (`hebrew`, `japanese`, …) work; weekends and holidays are matched on the ISO date and results keep
the input's calendar. Node.js 18+.

## Migrating from moment-business-days

Everything `moment-business-days` does has an equivalent here. Every translation in this section is checked against
the real `moment-business-days` in this package's test suite
([`test/moment-business-days.test.ts`](test/moment-business-days.test.ts)), over thousands of random working weeks and
holiday lists, and the examples below run both libraries side by side.

### 1. Install

```sh
npm install temporal-workdays
npm install temporal-polyfill # only where Temporal isn't native yet (Safari, Node < 26)
```

### 2. Move the configuration

`moment-business-days` reads its settings from a global moment locale. Here they are a plain object: pass it to
`createWorkCalendar`, or as the last argument of any function.

```ts
// Before
moment.updateLocale('us', {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: ['07-03-2026', '12-25-2026'],
  holidayFormat: 'MM-DD-YYYY',
});

// After
const us = createWorkCalendar({
  weekend: [6, 7],
  holidays: ['2026-07-03', '2026-12-25'],
});

us.isWorkday(Temporal.PlainDate.from('2026-07-03')); // → false
```

| moment locale setting                          | temporal-workdays option                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `workingWeekdays` (0 = Sunday … 6)             | `weekend`: the days that are **not** working days, ISO numbered (1 = Monday … 7 = Sunday) |
| `holidays` + `holidayFormat`                   | `holidays` as ISO `'YYYY-MM-DD'` strings (or `'MM-DD'` for every year)                    |
| `holiday(date)` function on the locale         | `holidays: (date) => …` (receives a `Temporal.PlainDate`)                                 |
| `nextBusinessDayLimit`, `prevBusinessDayLimit` | not needed: there is no search limit                                                      |
| one locale per region                          | one `createWorkCalendar(…)` per region                                                    |

To convert an existing configuration:

```ts
// workingWeekdays → weekend
const workingWeekdays = [0, 1, 2, 3, 4]; // Sunday–Thursday
const working = workingWeekdays.map((day) => (day === 0 ? 7 : day));
const weekend = [1, 2, 3, 4, 5, 6, 7].filter((day) => !working.includes(day));
weekend; // → [5, 6]

// holidays in any holidayFormat → ISO dates
const holidays = ['07-03-2026', '12-25-2026']; // holidayFormat: 'MM-DD-YYYY'
const isoHolidays = holidays.map((h) => moment(h, 'MM-DD-YYYY').format('YYYY-MM-DD'));
isoHolidays; // → ['2026-07-03', '2026-12-25']
```

### 3. Replace the calls

`m` is a moment, `d` a `Temporal.PlainDate` (or `PlainDateTime` / `ZonedDateTime`; you get the same type back).

| moment-business-days         | temporal-workdays                                                         | Notes                                     |
| ---------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `m.isBusinessDay()`          | `isWorkday(d)`                                                            |                                           |
| `m.isHoliday()`              | `isHoliday(d)`                                                            |                                           |
| `m.businessAdd(n)`           | `addWorkdays(d, n)`                                                       | moment rounds fractional `n`; this throws |
| `m.businessSubtract(n)`      | `subtractWorkdays(d, n)`                                                  |                                           |
| `m.nextBusinessDay()`        | `nextWorkday(d)`                                                          | no 7-day limit; `d` is not modified       |
| `m.prevBusinessDay()`        | `previousWorkday(d)`                                                      | no 7-day limit; `d` is not modified       |
| `a.businessDiff(b)`          | `Math.abs(workdaysBetween(b, a))`                                         | see [businessDiff](#businessdiff) below   |
| `a.businessDiff(b, true)`    | `workdaysBetween(b, a)`                                                   | see [businessDiff](#businessdiff) below   |
| `m.monthBusinessDays()`      | `workdaysInMonth(d)`                                                      |                                           |
| `m.monthBusinessDays(end)`   | `[...eachWorkday(d.with({ day: 1 }), end)]`                               |                                           |
| `m.businessDaysIntoMonth()`  | `workdayOfMonth(d)`                                                       | `0` before the month's first workday      |
| `m.monthBusinessWeeks()`     | `workdaysByWeek(d.with({ day: 1 }), d.with({ day: d.daysInMonth }))`      | respects your holidays and weekend        |
| `m.monthBusinessWeeks(true)` | `workdaysByWeek(d, d.with({ day: d.daysInMonth }))`                       |                                           |
| `a.businessWeeksBetween(b)`  | `workdaysByWeek(a, b)`                                                    |                                           |
| `m.monthNaturalDays()`       | plain Temporal, [see below](#monthnaturaldays-and-monthnaturalweeks)      |                                           |
| `m.monthNaturalWeeks()`      | plain Temporal, [see below](#monthnaturaldays-and-monthnaturalweeks)      |                                           |
| `m.businessAdd(n, 'hours')`  | `addWorkingTime(dateTime, { hours: n }, { hours: [['09:00', '17:00']] })` | real [working hours](#working-hours)      |

Side by side:

```ts
import moment from 'moment-business-days';
import { addWorkdays, workdaysBetween, workdaysInMonth } from 'temporal-workdays';

moment.updateLocale('en', { holidays: ['2026-11-26'], holidayFormat: 'YYYY-MM-DD', workingWeekdays: [1, 2, 3, 4, 5] });
const options = { holidays: ['2026-11-26'] };

moment('2026-11-25').businessAdd(1).format('YYYY-MM-DD'); // → '2026-11-27'
addWorkdays(Temporal.PlainDate.from('2026-11-25'), 1, options).toString(); // → '2026-11-27'

moment('2026-11-30').businessDiff(moment('2026-11-23')); // → 4
workdaysBetween(Temporal.PlainDate.from('2026-11-23'), Temporal.PlainDate.from('2026-11-30'), options); // → 4

moment('2026-11-10').monthBusinessDays().length; // → 20
workdaysInMonth(Temporal.PlainDate.from('2026-11-10'), options).length; // → 20
```

Moving between the two while you migrate:

```ts
const fromMoment = Temporal.PlainDate.from(moment('2026-11-06').format('YYYY-MM-DD'));
fromMoment.toString(); // → '2026-11-06'
moment(fromMoment.toString()).format('YYYY-MM-DD'); // → '2026-11-06'
```

### What behaves differently

#### businessDiff

`moment-business-days` counts the workdays in `[earlier, later)`; `workdaysBetween` counts `(earlier, later]`, so that
`workdaysBetween(d, addWorkdays(d, n)) === n` always holds. The two agree whenever both dates are workdays. If an end
can be a weekend or holiday and you need moment's exact numbers, shift both dates back a day:

```ts
const saturday = Temporal.PlainDate.from('2026-11-07');
const monday = Temporal.PlainDate.from('2026-11-09');

moment('2026-11-09').businessDiff(moment('2026-11-07')); // → 0
workdaysBetween(saturday, monday); // → 1
workdaysBetween(saturday.subtract({ days: 1 }), monday.subtract({ days: 1 })); // → 0
```

#### Other differences

- **Nothing is mutated.** `m.nextBusinessDay()` changes `m`; `nextWorkday(d)` returns a new date.
- **No search limits.** `nextBusinessDay()` gives up after 7 days and returns a non-business day; `nextWorkday` always
  finds the next workday (it throws only if a configuration has no workdays at all).
- **Weeks respect your calendar.** `monthBusinessWeeks()` assumes Monday–Friday and ignores holidays, and it adds an
  empty week when a month ends on a weekend. `workdaysByWeek` uses your weekend and holidays, starts weeks after the
  weekend (Sunday for a Friday–Saturday weekend) and has no empty weeks.
- **`businessDaysIntoMonth()`** on a weekend at the start of a month counts in the _previous_ month; `workdayOfMonth`
  returns `0`.
- **Invalid input throws** (fractional amounts, unknown option names, impossible dates) instead of being rounded or
  ignored.
- **Time zones are explicit.** Moments are in local time; use `PlainDate` for dates, `ZonedDateTime` for instants.

#### monthNaturalDays and monthNaturalWeeks

These list every day of the month, so they're plain Temporal:

```ts
const february = Temporal.PlainDate.from('2026-02-10');

// monthNaturalDays()
const days = Array.from({ length: february.daysInMonth }, (_, i) => february.with({ day: i + 1 }));
days.length; // → 28

// monthNaturalWeeks(): Sunday-to-Saturday weeks
const weeks = [];
for (const day of days) {
  if (weeks.length === 0 || day.dayOfWeek === 7) weeks.push([]);
  weeks[weeks.length - 1].push(day);
}
weeks.map((week) => week.length); // → [7, 7, 7, 7]

// moment-business-days adds an empty last week here
const momentWeeks = moment('2026-02-10').monthNaturalWeeks();
momentWeeks.map((week) => week.length); // → [7, 7, 7, 7, 0]
```

### What you get on top

- [Working hours](#working-hours): `addWorkingTime`, `workingTimeBetween`, breaks, half days, exact across DST.
- [Holiday data for 200+ countries](#holidays-from-date-holidays) via `date-holidays`, independent of the machine's
  time zone.
- Typed `PlainDate` / `PlainDateTime` / `ZonedDateTime` support, make-up workdays (`extraWorkdays`), yearly holidays
  (`'12-25'`), several calendars side by side, and no global state.

## Migrating from luxon-business-days

Each translation below is checked against the real `luxon-business-days` in
[`test/luxon-business-days.test.ts`](test/luxon-business-days.test.ts).

**Its default holidays.** `luxon-business-days` skips seven US shipping holidays unless you configure others. These
rules give exactly the same holidays (tested for every day from 1900 to 2200):

```ts
import { DateTime } from 'luxon-business-days';
import { addWorkdays, createWorkCalendar } from 'temporal-workdays';

const shippingHolidays = [
  '01-01',
  { easter: 0 },
  { month: 5, dayOfWeek: 1, week: -1 }, // Memorial Day
  '07-04',
  { month: 9, dayOfWeek: 1, week: 1 }, // Labor Day
  { month: 11, dayOfWeek: 4, week: 4 }, // Thanksgiving
  '12-25',
];
const calendar = createWorkCalendar({ holidays: shippingHolidays });

DateTime.fromISO('2026-11-25').plusBusiness({ days: 1 }).toISODate(); // → '2026-11-27'
calendar.addWorkdays(Temporal.PlainDate.from('2026-11-25'), 1).toString(); // → '2026-11-27'
```

| luxon-business-days                                            | temporal-workdays                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `dt.setupBusiness({ businessDays, holidayMatchers })` (global) | `createWorkCalendar({ weekend, holidays })` (no global state)                        |
| `businessDays: [1, 2, 3, 4, 5]`                                | `weekend: [6, 7]`, the other days; both number Monday as 1                           |
| `dt.plusBusiness({ days: n })` / `minusBusiness`               | `addWorkdays(d, n)` / `subtractWorkdays(d, n)`                                       |
| `dt.isBusinessDay()`                                           | `!isWeekend(d)`: it only checks the weekday, not holidays                            |
| `dt.isBusinessDay() && !dt.isHoliday()`                        | `isWorkday(d)`                                                                       |
| `dt.isHoliday()`                                               | `isHoliday(d)`                                                                       |
| `availableHolidayMatchers.isMLKDay`, `isColumbusDay`, …        | rules: `{ month: 1, dayOfWeek: 1, week: 3 }`, `{ month: 10, dayOfWeek: 1, week: 2 }` |
| a custom holiday matcher `(dt) => boolean`                     | `holidays: (date) => boolean` (receives a `Temporal.PlainDate`)                      |
| no equivalent                                                  | `workdaysBetween`, `workdaysInMonth`, working hours, observed holidays               |

## Coming from date-fns

date-fns' business-day functions only know Monday–Friday. Each translation is checked against the real date-fns in
[`test/date-fns.test.ts`](test/date-fns.test.ts).

```ts
import { addBusinessDays, differenceInBusinessDays, format } from 'date-fns';
import { addWorkdays, workdaysBetween } from 'temporal-workdays';

format(addBusinessDays(new Date(2026, 10, 6), 3), 'yyyy-MM-dd'); // → '2026-11-11'
addWorkdays(Temporal.PlainDate.from('2026-11-06'), 3).toString(); // → '2026-11-11'

differenceInBusinessDays(new Date(2026, 10, 16), new Date(2026, 10, 9)); // → 5
workdaysBetween(Temporal.PlainDate.from('2026-11-09'), Temporal.PlainDate.from('2026-11-16')); // → 5
```

| date-fns                                   | temporal-workdays                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `addBusinessDays(date, n)`                 | `addWorkdays(d, n)`: always the same result                                  |
| `isWeekend(date)`                          | `isWeekend(d)`                                                               |
| `differenceInBusinessDays(later, earlier)` | `workdaysBetween(earlier, later)` when both are workdays; exactly, see below |

`differenceInBusinessDays` counts `[earlier, later)` going forward but `(later, earlier]` going backward. When an end
can be a weekend day and you need its exact numbers:

```ts
import { differenceInBusinessDays } from 'date-fns';
import { workdaysBetween } from 'temporal-workdays';

const saturday = Temporal.PlainDate.from('2026-11-07');
const monday = Temporal.PlainDate.from('2026-11-09');

differenceInBusinessDays(new Date(2026, 10, 9), new Date(2026, 10, 7)); // → 0
workdaysBetween(saturday.subtract({ days: 1 }), monday.subtract({ days: 1 })); // → 0
```

Going backward (`later` before `earlier`), `workdaysBetween(earlier, later)` already matches it exactly. What you gain:
holidays, other weekends, working hours, and `Temporal` types instead of `Date`.

## License

MIT
