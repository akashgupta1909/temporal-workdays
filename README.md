# temporal-workdays

Business days and business hours for the JavaScript [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal).

- **Workdays** — add/subtract workdays, count them, list them; custom weekends, holidays and make-up days.
- **Working hours** — "add 4 business hours", working time between two moments, breaks, half days, per-date hours. Exact across DST changes.
- **Holiday data** — plug in [`date-holidays`](https://www.npmjs.com/package/date-holidays) (200+ countries), time-zone safe.
- **Built for Temporal** — `PlainDate`, `PlainDateTime` and `ZonedDateTime` in, the same type out. Works with native Temporal, `temporal-polyfill` or `@js-temporal/polyfill`; no global `Temporal` needed, at runtime or in your types.
- **Small and strict** — zero dependencies, tree-shakeable (workdays alone ≈ 1.8 kB, everything ≈ 5.7 kB min+brotli), ESM + CommonJS, strict TypeScript types, clear errors instead of silently wrong dates.

```sh
npm install temporal-workdays
```

**Coming from `moment-business-days`?** Every feature has an equivalent, checked against it in the test suite — see
the [migration guide](#migrating-from-moment-business-days).

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

| Function                                                                         | Returns                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `isWorkingTime(dateTime)`                                                        | `boolean`                                                                                   |
| `addWorkingTime(dateTime, duration)` / `subtractWorkingTime(dateTime, duration)` | `T`. `duration` is a `Temporal.Duration` or `{ hours, minutes, … }` (no days/weeks/months). |
| `workingTimeBetween(start, end)`                                                 | `Temporal.Duration` balanced up to hours (`PT27H30M`); negative if `end < start`.           |
| `rollForwardToWorkingTime(dateTime)` / `rollBackwardToWorkingTime(dateTime)`     | `T`: `dateTime` if it is working time, else the next period start / previous period end.    |
| `getWorkingHours(date)`                                                          | The periods of that date, e.g. `[['09:00', '17:00']]`.                                      |

### Calendars and adapters

| Function                                | Returns                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `createWorkCalendar(options)`           | All of the above bound to `options`. Working-time methods are included when `hours` is given. |
| `fromDateHolidays(holidays, { types })` | `{ holidays, specialHours }` to spread into options.                                          |

### Options

| Option          | Type                                                                                                                                                              | Default                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `weekend`       | ISO days of week, `1` (Mon) … `7` (Sun)                                                                                                                           | `[6, 7]`                  |
| `holidays`      | `'YYYY-MM-DD'`, `'MM-DD'` (yearly), `Temporal.PlainDate`, `Temporal.PlainMonthDay`, or `(date) => boolean`                                                        | none                      |
| `extraWorkdays` | `'YYYY-MM-DD'` or `Temporal.PlainDate`: workdays even on a weekend or holiday                                                                                     | none                      |
| `hours`         | `[[start, end], …]` for every workday, or `{ 1: […], …, 7: […], default: […] }`. Times are `'HH:MM[:SS[.f]]'` or `Temporal.PlainTime`; `'24:00'` may end a period | required for working time |
| `specialHours`  | `{ 'YYYY-MM-DD': [[start, end], …] }` (`[]` = closed), or `(date, regularHours) => hours \| undefined`                                                            | none                      |

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

## License

MIT
