# temporal-workdays

Business days and business hours for the JavaScript [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal).

- **Workdays** — add/subtract workdays, count them, list them; custom weekends, holidays and make-up days.
- **Working hours** — "add 4 business hours", working time between two moments, breaks, half days, per-date hours. Exact across DST changes.
- **Holiday data** — plug in [`date-holidays`](https://www.npmjs.com/package/date-holidays) (200+ countries), time-zone safe.
- **Built for Temporal** — `PlainDate`, `PlainDateTime` and `ZonedDateTime` in, the same type out. Works with native Temporal, `temporal-polyfill` or `@js-temporal/polyfill`; no global `Temporal` needed, at runtime or in your types.
- **Small and strict** — zero dependencies, tree-shakeable (workdays alone ≈ 1.8 kB, everything ≈ 5.5 kB min+brotli), ESM + CommonJS, strict TypeScript types, clear errors instead of silently wrong dates.

```sh
npm install temporal-workdays
```

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

Non-ISO calendars (`hebrew`, `japanese`, …) work; weekends and holidays are matched on the ISO date and results keep
the input's calendar. Node.js 18+.

## Migrating from moment-business-days / luxon-business-days

| moment-business-days                                       | temporal-workdays                                       |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `moment(d).businessAdd(3)` / `.businessSubtract(3)`        | `addWorkdays(d, 3)` / `subtractWorkdays(d, 3)`          |
| `moment(d).isBusinessDay()`                                | `isWorkday(d)`                                          |
| `moment(d).nextBusinessDay()` / `.prevBusinessDay()`       | `nextWorkday(d)` / `previousWorkday(d)`                 |
| `moment(a).businessDiff(moment(b))`                        | `workdaysBetween(b, a)` (check the endpoint convention) |
| `moment.updateLocale('us', { holidays, workingWeekdays })` | `createWorkCalendar({ holidays, weekend })`             |

## License

MIT
