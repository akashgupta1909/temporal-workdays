# temporal-workdays

[![npm version](https://img.shields.io/npm/v/temporal-workdays.svg)](https://www.npmjs.com/package/temporal-workdays)
[![CI](https://github.com/akashgupta1909/temporal-workdays/actions/workflows/ci.yml/badge.svg)](https://github.com/akashgupta1909/temporal-workdays/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlejs/size/temporal-workdays)](https://bundlejs.com/?q=temporal-workdays)
[![types](https://img.shields.io/npm/types/temporal-workdays.svg)](https://www.npmjs.com/package/temporal-workdays)
[![license](https://img.shields.io/npm/l/temporal-workdays.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/akashgupta1909/temporal-workdays/badge)](https://scorecard.dev/viewer/?uri=github.com/akashgupta1909/temporal-workdays)

Business days and business hours for the JavaScript
[Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal).

It adds and counts workdays, adds and measures working time for SLAs, and handles weekends, holidays (including
observed days and Easter), breaks, half days, overnight shifts and daylight saving time. Dates go in as
`Temporal.PlainDate`, `PlainDateTime` or `ZonedDateTime` and come back as the same type.

It has no dependencies and works with native Temporal or a polyfill. The workday functions are about 3.2 kB
(minified and brotli-compressed) and everything is about 7.4 kB.

```sh
npm install temporal-workdays
```

It is also on [JSR](https://jsr.io/@akashgupta1909/temporal-workdays) for Deno and other runtimes:
`deno add jsr:@akashgupta1909/temporal-workdays`.

Documentation, recipes and a playground: [akashgupta1909.github.io/temporal-workdays](https://akashgupta1909.github.io/temporal-workdays/).
Switching from another library? See the guides for [moment-business-days](#migrating-from-moment-business-days),
[luxon-business-days](#migrating-from-luxon-business-days) and [date-fns](#coming-from-date-fns).

<!-- #region workdays -->

## Workdays

```ts
import { addWorkdays, isWorkday, workdaysBetween } from 'temporal-workdays';

const friday = Temporal.PlainDate.from('2026-11-06');

addWorkdays(friday, 1).toString(); // → '2026-11-09'
addWorkdays(friday, -5).toString(); // → '2026-10-30'
isWorkday(Temporal.PlainDate.from('2026-11-07')); // → false
workdaysBetween(Temporal.PlainDate.from('2026-11-02'), Temporal.PlainDate.from('2026-11-09')); // → 5
```

Other weekends, holidays and make-up working days:

```ts
import { createWorkCalendar } from 'temporal-workdays';

const calendar = createWorkCalendar({
  weekend: [5, 6], // Friday and Saturday (ISO numbering: 1 is Monday, 7 is Sunday)
  holidays: ['2026-03-20', '12-25'], // one date, and December 25 every year
  extraWorkdays: ['2026-03-28'], // a Saturday that is a working day
});

calendar.isWorkday(Temporal.PlainDate.from('2026-03-20')); // → false
calendar.isWorkday(Temporal.PlainDate.from('2026-03-28')); // → true
calendar.nextWorkday(Temporal.PlainDate.from('2026-03-19')).toString(); // → '2026-03-22'
```

`createWorkCalendar` checks and prepares the options once. Every function also accepts the options after its
other arguments, as in `addWorkdays(date, 3, { holidays })`.

<!-- #endregion workdays -->

<!-- #region holiday-rules -->

### Holiday rules and observed days

A holiday can be a rule: a date every year, the nth or last weekday of a month, or a day relative to Easter. The
`observed` option moves holidays that fall on a weekend to a working day.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const usFederal = createWorkCalendar({
  observed: 'nearest', // Saturday moves to Friday, Sunday to Monday
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
// New Year's Day 2022 was a Saturday, so it was observed on Friday, December 31, 2021.
usFederal.isHoliday(Temporal.PlainDate.from('2021-12-31')); // → true

const england = createWorkCalendar({
  observed: 'next', // the next free working day
  holidays: [{ name: 'Good Friday', easter: -2 }, { name: 'Easter Monday', easter: 1 }, '12-25', '12-26'],
});

england.isHoliday(Temporal.PlainDate.from('2026-04-03')); // → true
// Christmas 2021 was a Saturday and Boxing Day a Sunday. They were observed on the 27th and 28th.
england.isHoliday(Temporal.PlainDate.from('2021-12-28')); // → true
```

| Rule                                   | Example                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| A date every year                      | `'12-25'` or `{ month: 12, day: 25 }`                        |
| The nth weekday of a month (`-1` last) | `{ month: 11, dayOfWeek: 4, week: 4 }`                       |
| A day relative to Easter Sunday        | `{ easter: -2 }` or `{ easter: 1, orthodox: true }`          |
| One date                               | `'2026-07-03'` or `{ date: '2026-07-03' }`                   |
| Options for any rule                   | `offset` (days), `from` and `to` (years), `observed`, `name` |

`observed` can be `'nearest'`, `'next'`, `'previous'` or `'none'` (the default), for the whole calendar or for one
rule. The US federal and England and Wales rules above match the data in
[`date-holidays`](https://www.npmjs.com/package/date-holidays) for every year from 1990 to 2060, and Easter matches it
for 1900 to 2100. The tests in [`test/holiday-rules.test.ts`](test/holiday-rules.test.ts) check this.

<!-- #endregion holiday-rules -->

<!-- #region working-hours -->

## Working hours

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({
  hours: [
    ['09:00', '12:00'],
    ['13:00', '17:00'],
  ],
});

const ticket = Temporal.ZonedDateTime.from('2026-11-06T16:00[America/New_York]'); // a Friday
const due = support.addWorkingTime(ticket, { hours: 4 }); // a 4-hour SLA
due.toString(); // → '2026-11-09T12:00:00-05:00[America/New_York]'

const spent = support.workingTimeBetween(ticket, Temporal.ZonedDateTime.from('2026-11-09T14:30[America/New_York]'));
spent.toString(); // → 'PT5H30M'
spent.total('hours'); // → 5.5

support.isWorkingTime(Temporal.ZonedDateTime.from('2026-11-09T12:30[America/New_York]')); // → false
support.rollForwardToWorkingTime(Temporal.PlainDateTime.from('2026-11-07T10:00')).toString(); // → '2026-11-09T09:00:00'
```

Hours can differ by day of the week, and special hours replace them on given dates:

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

`specialHours` can also be a function, `(date, regularHours) => hours | undefined`.

### Overnight shifts

A range whose end is before its start runs into the next morning. The shift belongs to the day it starts, so a Friday
night shift is worked even though Saturday is a weekend day.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const nights = createWorkCalendar({ hours: [['22:00', '06:00']] });

// Saturday 03:00 is inside Friday's shift.
nights.isWorkingTime(Temporal.PlainDateTime.from('2026-11-07T03:00')); // → true
// 7 hours finish Friday's shift, and the next shift starts on Monday night.
nights.addWorkingTime(Temporal.PlainDateTime.from('2026-11-06T23:00'), { hours: 8 }).toString(); // → '2026-11-09T23:00:00'
nights.getWorkingHours(Temporal.PlainDate.from('2026-11-06')); // → [['22:00', '06:00']]
```

### Pausing the clock

Support SLAs usually stop while a ticket waits on the customer. Pass those periods to `workingTimeBetween` as
`pauses`, then add the time that is left to get the deadline.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({ hours: [['09:00', '17:00']] });

const opened = Temporal.PlainDateTime.from('2026-11-09T15:00'); // a Monday
const now = Temporal.PlainDateTime.from('2026-11-10T15:00');
const waitingOnCustomer = [
  [Temporal.PlainDateTime.from('2026-11-10T09:00'), Temporal.PlainDateTime.from('2026-11-10T13:00')],
];

const used = support.workingTimeBetween(opened, now, { pauses: waitingOnCustomer });
used.toString(); // → 'PT4H'

const deadline = support.addWorkingTime(now, Temporal.Duration.from({ hours: 8 }).subtract(used));
deadline.toString(); // → '2026-11-11T11:00:00'
```

Pauses can overlap each other and the ends of the range. Each working minute is left out at most once.

### Edge cases

- Periods include their start and exclude their end. In 09:00 to 17:00, 17:00 is not working time. Adding time that
  ends exactly at the end of a period returns that end (16:00 plus 1 hour is 17:00), and subtracting to the start of
  a period returns that start.
- Starting outside working hours, counting begins at the next working period.
- With `ZonedDateTime`, time is measured as it really passes. A 09:00 to 17:00 day is 8 hours, but 00:00 to 24:00 on
  the day clocks go forward is 23. Times that daylight saving skips move forward, as with Temporal's `'compatible'`
  option.
- Weekends and holidays have no working hours. Special hours replace everything else for their date.

<!-- #endregion working-hours -->

<!-- #region date-holidays -->

## Holidays from date-holidays

[`date-holidays`](https://www.npmjs.com/package/date-holidays) has holiday data for over 200 countries.
`fromDateHolidays` turns it into options:

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

- `types` chooses which holiday types close the business. The default is `['public']`.
- A day that a holiday covers completely is a holiday. A day it covers in part keeps shorter hours, like Christmas Eve
  from 14:00.
- The answers don't depend on the time zone of the machine. `date-holidays`' own `isHoliday(new Date(…))` does: run in
  India, it says US Thanksgiving is not a holiday.
- `temporal-workdays` doesn't depend on `date-holidays`. Install it yourself to use this.

To add your own holidays, wrap the function it returns:

```ts
import Holidays from 'date-holidays';
import { fromDateHolidays, isWorkday } from 'temporal-workdays';

const us = fromDateHolidays(new Holidays('US'));
const companyDays = ['2026-12-24'];
const options = { ...us, holidays: (date) => us.holidays(date) || companyDays.includes(date.toString()) };

isWorkday(Temporal.PlainDate.from('2026-12-24'), options); // → false
isWorkday(Temporal.PlainDate.from('2026-11-26'), options); // → false
```

<!-- #endregion date-holidays -->

<!-- #region api -->

## API

`T` is the Temporal type you pass in. Functions that return a date return that same type.

### Workday functions

These accept a `PlainDate`, `PlainDateTime` or `ZonedDateTime`.

| Function                                                | Returns                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isWorkday(date)`, `isWeekend(date)`, `isHoliday(date)` | `boolean`. Dates in `extraWorkdays` are always workdays.                                                                                             |
| `addWorkdays(date, n)`, `subtractWorkdays(date, n)`     | `T`, `n` workdays away. With `n = 0` it returns `date`. From a non-workday, `+1` is the next workday.                                                |
| `nextWorkday(date)`, `previousWorkday(date)`            | `T`, the nearest workday after or before `date`.                                                                                                     |
| `rollForward(date)`, `rollBackward(date)`               | `T`, `date` itself if it is a workday, otherwise the next or previous one.                                                                           |
| `workdaysBetween(start, end)`                           | The number of workdays after `start` up to and including `end`, negative if `end` is earlier. `workdaysBetween(d, addWorkdays(d, n))` is always `n`. |
| `eachWorkday(start, end)`                               | A generator of the workdays from `start` to `end`, both included.                                                                                    |
| `workdaysInMonth(date)`                                 | `T[]`, the workdays of the month of `date`, in its own calendar.                                                                                     |
| `workdayOfMonth(date)`                                  | The number of workdays in the month up to and including `date`. It is 1 on the first workday.                                                        |
| `workdaysByWeek(start, end)`                            | `T[][]`, the workdays from `start` to `end` grouped by week. Weeks start after the weekend.                                                          |

### Working time functions

These accept a `PlainDateTime` or `ZonedDateTime` and need the `hours` option.

| Function                                                                        | Returns                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isWorkingTime(dateTime)`                                                       | `boolean`                                                                                                                                                                                                                     |
| `addWorkingTime(dateTime, duration)`, `subtractWorkingTime(dateTime, duration)` | `T`. The duration is a `Temporal.Duration` or an object like `{ hours: 4 }`, in hours or smaller units.                                                                                                                       |
| `workingTimeBetween(start, end)`                                                | A `Temporal.Duration` in hours and smaller units (`PT27H30M`), negative if `end` is earlier. To leave [pauses](#pausing-the-clock) out, pass `{ pauses }` after the options, or as the third argument of a calendar's method. |
| `rollForwardToWorkingTime(dateTime)`, `rollBackwardToWorkingTime(dateTime)`     | `T`, `dateTime` itself if it is working time, otherwise the next period start or previous period end.                                                                                                                         |
| `getWorkingHours(date)`                                                         | The working periods of the date, like `[['09:00', '17:00']]`.                                                                                                                                                                 |

### Calendars and adapters

| Function                                | Returns                                                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `createWorkCalendar(options)`           | All of the functions above with `options` built in. The working time functions are included when `hours` is set. |
| `fromDateHolidays(holidays, { types })` | `{ holidays, specialHours }`, to spread into the options.                                                        |

### Options

| Option          | Value                                                                                                                                                                                                                                           | Default                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `weekend`       | Days of the week, numbered from 1 (Monday) to 7 (Sunday)                                                                                                                                                                                        | `[6, 7]`                |
| `holidays`      | `'YYYY-MM-DD'`, `'MM-DD'` (every year), `Temporal.PlainDate`, `Temporal.PlainMonthDay`, [rules](#holiday-rules-and-observed-days), or a function `(date) => boolean`                                                                            | none                    |
| `observed`      | `'nearest'`, `'next'`, `'previous'` or `'none'`, where holidays on a weekend are observed                                                                                                                                                       | `'none'`                |
| `extraWorkdays` | `'YYYY-MM-DD'` or `Temporal.PlainDate`, days that are workdays even on a weekend or holiday                                                                                                                                                     | none                    |
| `hours`         | `[[start, end], …]` for every workday, or `{ 1: […], …, 7: […], default: […] }`. Times are `'HH:MM'`, `'HH:MM:SS'` or `Temporal.PlainTime`. `'24:00'` can end a period, and an end before the start is an [overnight](#overnight-shifts) range. | needed for working time |
| `specialHours`  | `{ 'YYYY-MM-DD': [[start, end], …] }` (`[]` means closed), or a function `(date, regularHours) => hours \| undefined`                                                                                                                           | none                    |

Invalid input throws a `RangeError` or `TypeError` that names the problem, including misspelled option names. If the
options leave no workday or working time at all, the functions throw instead of searching forever.

<!-- #endregion api -->

<!-- #region requirements -->

## Requirements

You need a Temporal implementation. Firefox 139+, Chrome 144+ and Node.js 26+ have one built in. Elsewhere, such as
Safari on iOS or older Node versions, use a polyfill:

```js
import 'temporal-polyfill/global'; // installs a global Temporal
// or, without touching globals:
import { Temporal } from 'temporal-polyfill';
```

`temporal-polyfill` is published as an ES module only, and Node 18 and Node 20 before 20.19 can't load ES modules with
`require()`. In CommonJS code on those versions, use
[`@js-temporal/polyfill`](https://www.npmjs.com/package/@js-temporal/polyfill), or load `temporal-polyfill` with
`await import('temporal-polyfill')`:

```js
const { Temporal } = require('@js-temporal/polyfill');
const { addWorkdays } = require('temporal-workdays');
```

Dates in other calendars (`hebrew`, `japanese` and so on) work. Weekends and holidays are matched on the ISO date, and
results stay in the calendar of the input. Node.js 18 or later is required.

CI tests the package on Node 18 to 26, Deno, Bun, Chromium, Firefox, WebKit and Cloudflare Workers, with
`temporal-polyfill`, with `@js-temporal/polyfill` and with native Temporal where the runtime has it.

<!-- #endregion requirements -->

## Performance

Time per call on an Apple M4 with Node 22 and `temporal-polyfill`, with the same six holidays in each library. Lower
is better.

| Task                          | temporal-workdays | moment-business-days | luxon-business-days |
| ----------------------------- | ----------------- | -------------------- | ------------------- |
| Add 20 business days          | 1.3 µs            | 17 µs                | 43 µs               |
| Count business days in a year | 6.9 µs            | 246 µs               | not available       |
| Is it a business day          | 0.15 µs           | 0.34 µs              | not available       |
| Business days of a month      | 19 µs             | 32 µs                | not available       |

Counting grows with the length of the range: about 0.35 µs for a week and 76 µs for ten years. Run `npm run bench`
to measure on your machine.

<!-- #region migration-moment -->

## Migrating from moment-business-days

Every feature of `moment-business-days` has an equivalent. The translations below are checked against the real
`moment-business-days` in [`test/moment-business-days.test.ts`](test/moment-business-days.test.ts), with thousands of
random working weeks and holiday lists, and the examples run both libraries side by side.

### 1. Install

```sh
npm install temporal-workdays
npm install temporal-polyfill # only where Temporal isn't built in yet (Safari, Node before 26)
```

### 2. Move the configuration

`moment-business-days` reads its settings from a global moment locale. Here the settings are a plain object, passed to
`createWorkCalendar` or as the last argument of any function.

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

| moment locale setting                          | temporal-workdays option                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `workingWeekdays` (0 is Sunday)                | `weekend`, the days that are not working days, numbered 1 (Monday) to 7 (Sunday) |
| `holidays` and `holidayFormat`                 | `holidays` as `'YYYY-MM-DD'` strings, or `'MM-DD'` for every year                |
| a `holiday(date)` function on the locale       | `holidays: (date) => …`, which receives a `Temporal.PlainDate`                   |
| `nextBusinessDayLimit`, `prevBusinessDayLimit` | not needed, because there is no search limit                                     |
| one locale per region                          | one `createWorkCalendar(…)` per region                                           |

To convert an existing configuration:

```ts
// workingWeekdays to weekend
const workingWeekdays = [0, 1, 2, 3, 4]; // Sunday to Thursday
const working = workingWeekdays.map((day) => (day === 0 ? 7 : day));
const weekend = [1, 2, 3, 4, 5, 6, 7].filter((day) => !working.includes(day));
weekend; // → [5, 6]

// holidays in any holidayFormat to ISO dates
const holidays = ['07-03-2026', '12-25-2026']; // holidayFormat: 'MM-DD-YYYY'
const isoHolidays = holidays.map((h) => moment(h, 'MM-DD-YYYY').format('YYYY-MM-DD'));
isoHolidays; // → ['2026-07-03', '2026-12-25']
```

### 3. Replace the calls

In this table `m` is a moment and `d` is a `Temporal.PlainDate`. A `PlainDateTime` or `ZonedDateTime` works too and
comes back as the same type.

| moment-business-days         | temporal-workdays                                                         | Notes                                       |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------- |
| `m.isBusinessDay()`          | `isWorkday(d)`                                                            |                                             |
| `m.isHoliday()`              | `isHoliday(d)`                                                            |                                             |
| `m.businessAdd(n)`           | `addWorkdays(d, n)`                                                       | moment rounds a fractional `n`, this throws |
| `m.businessSubtract(n)`      | `subtractWorkdays(d, n)`                                                  |                                             |
| `m.nextBusinessDay()`        | `nextWorkday(d)`                                                          | no 7-day limit, and `d` is not changed      |
| `m.prevBusinessDay()`        | `previousWorkday(d)`                                                      | no 7-day limit, and `d` is not changed      |
| `a.businessDiff(b)`          | `Math.abs(workdaysBetween(b, a))`                                         | see [businessDiff](#businessdiff)           |
| `a.businessDiff(b, true)`    | `workdaysBetween(b, a)`                                                   | see [businessDiff](#businessdiff)           |
| `m.monthBusinessDays()`      | `workdaysInMonth(d)`                                                      |                                             |
| `m.monthBusinessDays(end)`   | `[...eachWorkday(d.with({ day: 1 }), end)]`                               |                                             |
| `m.businessDaysIntoMonth()`  | `workdayOfMonth(d)`                                                       | 0 before the first workday of the month     |
| `m.monthBusinessWeeks()`     | `workdaysByWeek(d.with({ day: 1 }), d.with({ day: d.daysInMonth }))`      | uses your holidays and weekend              |
| `m.monthBusinessWeeks(true)` | `workdaysByWeek(d, d.with({ day: d.daysInMonth }))`                       |                                             |
| `a.businessWeeksBetween(b)`  | `workdaysByWeek(a, b)`                                                    |                                             |
| `m.monthNaturalDays()`       | plain Temporal, see [below](#monthnaturaldays-and-monthnaturalweeks)      |                                             |
| `m.monthNaturalWeeks()`      | plain Temporal, see [below](#monthnaturaldays-and-monthnaturalweeks)      |                                             |
| `m.businessAdd(n, 'hours')`  | `addWorkingTime(dateTime, { hours: n }, { hours: [['09:00', '17:00']] })` | uses real [working hours](#working-hours)   |

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

To convert between the two while you migrate:

```ts
const fromMoment = Temporal.PlainDate.from(moment('2026-11-06').format('YYYY-MM-DD'));
fromMoment.toString(); // → '2026-11-06'
moment(fromMoment.toString()).format('YYYY-MM-DD'); // → '2026-11-06'
```

### Differences

#### businessDiff

`moment-business-days` counts the workdays from the earlier date up to, but not including, the later one.
`workdaysBetween` counts the workdays after the earlier date up to and including the later one, which keeps
`workdaysBetween(d, addWorkdays(d, n))` equal to `n`. The results are the same when both dates are workdays. When
either can be a weekend day or holiday and you need moment's exact numbers, move both dates back one day:

```ts
const saturday = Temporal.PlainDate.from('2026-11-07');
const monday = Temporal.PlainDate.from('2026-11-09');

moment('2026-11-09').businessDiff(moment('2026-11-07')); // → 0
workdaysBetween(saturday, monday); // → 1
workdaysBetween(saturday.subtract({ days: 1 }), monday.subtract({ days: 1 })); // → 0
```

#### Other differences

- Dates are never changed in place. `m.nextBusinessDay()` modifies `m`, while `nextWorkday(d)` returns a new date.
- There are no search limits. `nextBusinessDay()` stops after 7 days and then returns a day that isn't a business
  day. `nextWorkday` always finds the next workday, and throws only if the options contain no workdays at all.
- `monthBusinessWeeks()` assumes Monday to Friday, ignores holidays and adds an empty week when a month ends on a
  weekend. `workdaysByWeek` uses your weekend and holidays, starts each week after the weekend (on Sunday for a
  Friday and Saturday weekend) and returns no empty weeks.
- On a weekend at the start of a month, `businessDaysIntoMonth()` counts in the previous month. `workdayOfMonth`
  returns 0.
- Invalid input such as a fractional amount, an unknown option or an impossible date throws an error instead of being
  rounded or ignored.
- Moments are in local time. Here, use `PlainDate` for dates and `ZonedDateTime` for moments in time.

#### monthNaturalDays and monthNaturalWeeks

These list every day of the month, so plain Temporal does it:

```ts
const february = Temporal.PlainDate.from('2026-02-10');

// monthNaturalDays()
const days = Array.from({ length: february.daysInMonth }, (_, i) => february.with({ day: i + 1 }));
days.length; // → 28

// monthNaturalWeeks(), with weeks from Sunday to Saturday
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

<!-- #endregion migration-moment -->

<!-- #region migration-luxon -->

## Migrating from luxon-business-days

The translations below are checked against the real `luxon-business-days` in
[`test/luxon-business-days.test.ts`](test/luxon-business-days.test.ts).

Unless you configure other holidays, `luxon-business-days` skips seven US shipping holidays. These rules give the same
holidays, which the tests check for every day from 1900 to 2200:

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

| luxon-business-days                                                    | temporal-workdays                                                                              |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `dt.setupBusiness({ businessDays, holidayMatchers })`, which is global | `createWorkCalendar({ weekend, holidays })`, with no global state                              |
| `businessDays: [1, 2, 3, 4, 5]`                                        | `weekend: [6, 7]`, the other days. Both number Monday as 1.                                    |
| `dt.plusBusiness({ days: n })`, `dt.minusBusiness(…)`                  | `addWorkdays(d, n)`, `subtractWorkdays(d, n)`                                                  |
| `dt.isBusinessDay()`                                                   | `!isWeekend(d)`, because it checks only the weekday and not holidays                           |
| `dt.isBusinessDay() && !dt.isHoliday()`                                | `isWorkday(d)`                                                                                 |
| `dt.isHoliday()`                                                       | `isHoliday(d)`                                                                                 |
| `availableHolidayMatchers.isMLKDay`, `isColumbusDay` and the others    | rules such as `{ month: 1, dayOfWeek: 1, week: 3 }` and `{ month: 10, dayOfWeek: 1, week: 2 }` |
| a custom holiday matcher `(dt) => boolean`                             | `holidays: (date) => boolean`, which receives a `Temporal.PlainDate`                           |
| no equivalent                                                          | `workdaysBetween`, `workdaysInMonth`, working hours, observed holidays                         |

<!-- #endregion migration-luxon -->

<!-- #region migration-date-fns -->

## Coming from date-fns

The business-day functions in date-fns only know Monday to Friday. The translations below are checked against the
real date-fns in [`test/date-fns.test.ts`](test/date-fns.test.ts).

```ts
import { addBusinessDays, differenceInBusinessDays, format } from 'date-fns';
import { addWorkdays, workdaysBetween } from 'temporal-workdays';

format(addBusinessDays(new Date(2026, 10, 6), 3), 'yyyy-MM-dd'); // → '2026-11-11'
addWorkdays(Temporal.PlainDate.from('2026-11-06'), 3).toString(); // → '2026-11-11'

differenceInBusinessDays(new Date(2026, 10, 16), new Date(2026, 10, 9)); // → 5
workdaysBetween(Temporal.PlainDate.from('2026-11-09'), Temporal.PlainDate.from('2026-11-16')); // → 5
```

| date-fns                                   | temporal-workdays                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `addBusinessDays(date, n)`                 | `addWorkdays(d, n)`, which always gives the same result                       |
| `isWeekend(date)`                          | `isWeekend(d)`                                                                |
| `differenceInBusinessDays(later, earlier)` | `workdaysBetween(earlier, later)` when both are workdays, otherwise see below |

Going forward, `differenceInBusinessDays` counts from the earlier date up to, but not including, the later one. When
either date can be a weekend day and you need its exact result, move both dates back one day:

```ts
import { differenceInBusinessDays } from 'date-fns';
import { workdaysBetween } from 'temporal-workdays';

const saturday = Temporal.PlainDate.from('2026-11-07');
const monday = Temporal.PlainDate.from('2026-11-09');

differenceInBusinessDays(new Date(2026, 10, 9), new Date(2026, 10, 7)); // → 0
workdaysBetween(saturday.subtract({ days: 1 }), monday.subtract({ days: 1 })); // → 0
```

Going backward, with `later` before `earlier`, `workdaysBetween(earlier, later)` already gives its exact result.

<!-- #endregion migration-date-fns -->

## License

MIT
