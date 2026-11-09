# Delivery date estimates

A shop in Germany ships orders placed before 14:00 on the same working day and later orders on the next one. Packing
takes one working day and the carrier needs two to three more. The carrier doesn't deliver on public holidays in
Bavaria, which come from `date-holidays`.

```ts
import Holidays from 'date-holidays';
import { addWorkdays, fromDateHolidays, isWorkday, nextWorkday } from 'temporal-workdays';

const bavaria = fromDateHolidays(new Holidays('DE', 'BY'));
const CUTOFF = Temporal.PlainTime.from('14:00');

function shipDate(orderedAt) {
  const local = orderedAt.withTimeZone('Europe/Berlin'); // the cutoff is in the shop's time zone
  const day = local.toPlainDate();
  const beforeCutoff = Temporal.PlainTime.compare(local.toPlainTime(), CUTOFF) < 0;
  return isWorkday(day, bavaria) && beforeCutoff ? day : nextWorkday(day, bavaria);
}

function deliveryWindow(orderedAt) {
  const packed = addWorkdays(shipDate(orderedAt), 1, bavaria);
  return [addWorkdays(packed, 2, bavaria), addWorkdays(packed, 3, bavaria)].map(String);
}

const at = (s) => Temporal.ZonedDateTime.from(`${s}[Europe/Berlin]`);

// Monday morning: ships Monday, packed Tuesday, delivered Thursday or Friday.
deliveryWindow(at('2026-11-09T10:00')); // → ['2026-11-12', '2026-11-13']
// Monday afternoon, after the cutoff: everything moves a day, past the weekend.
deliveryWindow(at('2026-11-09T15:00')); // → ['2026-11-13', '2026-11-16']
// Wednesday 23 December: 24 December is a working day, then the shop is closed for Christmas.
deliveryWindow(at('2026-12-23T10:00')); // → ['2026-12-29', '2026-12-30']

// 13:30 in London is 14:30 in Berlin: too late for same-day shipping.
shipDate(Temporal.ZonedDateTime.from('2026-11-09T13:30[Europe/London]')).toString(); // → '2026-11-10'
```

The cutoff is checked in the shop's time zone, whatever zone the order arrives in.
