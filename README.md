# temporal-workdays

Business-day math for the JavaScript [Temporal API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal).
Add and subtract workdays, count workdays between dates, and handle custom weekends, holidays and make-up working days.

- **Built for Temporal** — works with `PlainDate`, `PlainDateTime` and `ZonedDateTime`, and returns the same type you pass in (time of day and time zone are kept, DST-safe).
- **Any Temporal implementation** — native, [`temporal-polyfill`](https://www.npmjs.com/package/temporal-polyfill) or `@js-temporal/polyfill`. No global `Temporal` required, at runtime or in your types.
- **Zero dependencies**, ~2 KB min+gzip, tree-shakeable, ESM + CommonJS, TypeScript types included.
- **Fast** — date math runs on integers, not on a chain of `Temporal` objects.

```sh
npm install temporal-workdays
```

## Quick start

```ts
import { addWorkdays, workdaysBetween, isWorkday } from 'temporal-workdays';

const friday = Temporal.PlainDate.from('2026-11-06');

addWorkdays(friday, 1).toString(); // '2026-11-09' (Monday)
addWorkdays(friday, -5).toString(); // '2026-10-30'
isWorkday(Temporal.PlainDate.from('2026-11-07')); // false (Saturday)

workdaysBetween(Temporal.PlainDate.from('2026-11-02'), Temporal.PlainDate.from('2026-11-09')); // 5
```

### Holidays, custom weekends and make-up days

```ts
import { createWorkCalendar } from 'temporal-workdays';

const cal = createWorkCalendar({
  weekend: [5, 6], // Friday + Saturday (ISO: 1 = Mon … 7 = Sun)
  holidays: [
    '2026-03-20', // one specific date
    '12-25', // every year on Dec 25
    Temporal.PlainMonthDay.from('01-01'),
  ],
  extraWorkdays: ['2026-03-28'], // a Saturday that is a working day
});

cal.addWorkdays(Temporal.PlainDate.from('2026-03-19'), 1);
cal.workdaysBetween(start, end);
```

`createWorkCalendar` parses the configuration once and reuses it. Every function also accepts the
same options as its last argument, as in `addWorkdays(date, 3, { holidays })`.

### Rule-based holidays

Pass a function to decide holidays yourself, for example to plug in a holiday data source:

```ts
const cal = createWorkCalendar({
  // Receives an ISO-calendar Temporal.PlainDate. Not called on weekend days.
  holidays: (date) => date.month === 7 && date.day === 4,
});
```

For example, with [`date-holidays`](https://www.npmjs.com/package/date-holidays):

```ts
import Holidays from 'date-holidays';

const hd = new Holidays('US');
const cal = createWorkCalendar({
  holidays: (d) => (hd.isHoliday(new Date(d.year, d.month - 1, d.day)) || []).some((h) => h.type === 'public'),
});
```

### Time zones and times of day

Only the **calendar date** decides whether a day is a workday. A `ZonedDateTime` keeps its local wall-clock time:

```ts
const t = Temporal.ZonedDateTime.from('2026-11-06T17:00[America/New_York]');
addWorkdays(t, 1).toString(); // '2026-11-09T17:00:00-05:00[America/New_York]'
```

## API

All functions take an optional `options` object as the last argument (see [Options](#options)).
`T` is the type you pass in: `Temporal.PlainDate`, `PlainDateTime` or `ZonedDateTime`.

| Function                                      | Returns                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `isWorkday(date)`                             | `true` unless the date is a weekend day or holiday. `extraWorkdays` always count as workdays.                                            |
| `isWeekend(date)`                             | `true` if the date falls on a configured weekend day.                                                                                    |
| `isHoliday(date)`                             | `true` if the date is a holiday and not in `extraWorkdays`.                                                                              |
| `addWorkdays(date, n)`                        | `T`, `n` workdays later (earlier if `n` is negative). `n = 0` returns `date` unchanged. From a non-workday, `+1` gives the next workday. |
| `subtractWorkdays(date, n)`                   | Same as `addWorkdays(date, -n)`.                                                                                                         |
| `nextWorkday(date)` / `previousWorkday(date)` | The nearest workday strictly after / before `date`.                                                                                      |
| `rollForward(date)` / `rollBackward(date)`    | `date` if it is a workday, otherwise the next / previous workday.                                                                        |
| `workdaysBetween(start, end)`                 | Number of workdays in `(start, end]`, negative if `end < start`. For `n >= 0`, `workdaysBetween(d, addWorkdays(d, n)) === n`.            |
| `eachWorkday(start, end)`                     | A generator of every workday in `[start, end]` (both inclusive), as `T`.                                                                 |
| `createWorkCalendar(options)`                 | An object with all of the above, bound to `options`.                                                                                     |

### Options

| Option          | Type                                                                                                                                               | Default  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `weekend`       | `DayOfWeek[]`, ISO numbers `1` (Mon) … `7` (Sun)                                                                                                   | `[6, 7]` |
| `holidays`      | Iterable of `'YYYY-MM-DD'`, `'MM-DD'` (every year), `Temporal.PlainDate`, `Temporal.PlainMonthDay`, **or** `(date: Temporal.PlainDate) => boolean` | none     |
| `extraWorkdays` | Iterable of `'YYYY-MM-DD'` or `Temporal.PlainDate`. These dates are workdays even on a weekend or holiday.                                         | none     |

Invalid input (an unknown weekend day, `'2026-02-30'`, a non-integer `n`) throws a `RangeError` or `TypeError` instead of silently producing a wrong date.
If a configuration has no workdays at all (every day is a weekend day, or a predicate that always returns `true`),
the functions throw a `RangeError` instead of looping forever.

## Requirements

You need a Temporal implementation:

- **Native** — Firefox 139+, Chrome 144+, Node.js 26+.
- **Elsewhere** (Safari/iOS, older Node) — use a polyfill:
  ```ts
  import 'temporal-polyfill/global'; // installs a global Temporal
  // or, without touching globals:
  import { Temporal } from 'temporal-polyfill';
  ```

Calendar dates in non-ISO calendars (`hebrew`, `japanese`, …) are supported. Weekends and holidays are always matched on the ISO date, and results keep the input's calendar.

## Migrating from moment-business-days / luxon-business-days

| moment-business-days                                                      | temporal-workdays                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `moment(d).businessAdd(3)`                                                | `addWorkdays(d, 3)`                                                   |
| `moment(d).businessSubtract(3)`                                           | `subtractWorkdays(d, 3)`                                              |
| `moment(d).isBusinessDay()`                                               | `isWorkday(d)`                                                        |
| `moment(d).nextBusinessDay()`                                             | `nextWorkday(d)`                                                      |
| `moment(d).prevBusinessDay()`                                             | `previousWorkday(d)`                                                  |
| `moment(a).businessDiff(moment(b))`                                       | `workdaysBetween(b, a)` (check the endpoint convention for your case) |
| `moment.updateLocale('us', { holidays, holidayFormat, workingWeekdays })` | `createWorkCalendar({ holidays, weekend })`                           |

## License

MIT
