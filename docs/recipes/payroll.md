# Payroll: working days in a pay period

A company pays a monthly salary and prorates it by working days for people who join or leave during the month. Its
offices are in England, so it uses the bank holidays of England and Wales.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const england = createWorkCalendar({
  observed: 'next',
  holidays: [
    '01-01',
    { name: 'Good Friday', easter: -2 },
    { name: 'Easter Monday', easter: 1 },
    { name: 'Early May', month: 5, dayOfWeek: 1, week: 1 },
    { name: 'Spring', month: 5, dayOfWeek: 1, week: -1 },
    { name: 'Summer', month: 8, dayOfWeek: 1, week: -1 },
    '12-25',
    '12-26',
  ],
});

const may = Temporal.PlainYearMonth.from('2026-05');
const firstDay = may.toPlainDate({ day: 1 });

// May 2026 has 21 weekdays and two bank holidays.
england.workdaysInMonth(firstDay).length; // → 19

function proratedSalary(monthlySalary, joined) {
  const all = england.workdaysInMonth(joined);
  const worked = all.filter((day) => Temporal.PlainDate.compare(day, joined) >= 0);
  return Math.round((monthlySalary * worked.length) / all.length);
}

// Joining on Wednesday 13 May: 12 of the month's 19 working days.
proratedSalary(3800, Temporal.PlainDate.from('2026-05-13')); // → 2400
```

## Pay day on the last working day

Many payrolls pay on the last working day of the month, moved earlier when that falls on a weekend or holiday.
`rollBackward` does that.

```ts
import { rollBackward } from 'temporal-workdays';

const options = { holidays: ['12-25', '12-26', '01-01'], observed: 'next' };
const lastDayOf = (month) => Temporal.PlainYearMonth.from(month).toPlainDate({ day: 31 });

// 31 October 2026 is a Saturday.
rollBackward(lastDayOf('2026-10'), options).toString(); // → '2026-10-30'
// 31 December 2026 is a Thursday.
rollBackward(lastDayOf('2026-12'), options).toString(); // → '2026-12-31'
```

`Temporal.PlainYearMonth#toPlainDate({ day: 31 })` clamps to the month's last day, so the same helper works for
30-day months and February.
