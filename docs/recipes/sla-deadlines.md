# SLA deadlines for a support desk

A support team in New York promises a first reply within a number of business hours that depends on the ticket's
priority. The clock runs only during office hours, skips US federal holidays and stops while the ticket waits on the
customer.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({
  hours: [['09:00', '17:00']],
  observed: 'nearest',
  holidays: [
    '01-01',
    { month: 5, dayOfWeek: 1, week: -1 },
    '07-04',
    { month: 9, dayOfWeek: 1, week: 1 },
    { month: 11, dayOfWeek: 4, week: 4 },
    '12-25',
  ],
});

const SLA_HOURS = { urgent: 2, high: 8, normal: 24 };

function firstReplyDue(openedAt, priority) {
  // Deadlines are worked out in the team's time zone, wherever the customer is.
  return support.addWorkingTime(openedAt.withTimeZone('America/New_York'), { hours: SLA_HOURS[priority] });
}

// Opened on Friday at 20:30 in London, which is 15:30 in New York.
const openedAt = Temporal.ZonedDateTime.from('2026-11-06T20:30[Europe/London]');

firstReplyDue(openedAt, 'urgent').toString(); // → '2026-11-09T09:30:00-05:00[America/New_York]'
firstReplyDue(openedAt, 'high').toString(); // → '2026-11-09T15:30:00-05:00[America/New_York]'
firstReplyDue(openedAt, 'normal').toString(); // → '2026-11-11T15:30:00-05:00[America/New_York]'
```

Friday has 1.5 business hours left at 15:30. The urgent ticket uses them and finishes its last half hour on Monday
morning. The result keeps the New York time zone, so it can be shown to the agent as is or converted back to the
customer's zone with `withTimeZone`.

## Pausing while waiting on the customer

When the agent asks the customer a question, the ticket goes on hold. Store each hold as a start and an end, pass the
holds as `pauses`, and subtract the working time already used from the SLA.

```ts
import { createWorkCalendar } from 'temporal-workdays';

const support = createWorkCalendar({ hours: [['09:00', '17:00']] });
const at = (s) => Temporal.ZonedDateTime.from(`${s}[America/New_York]`);

const opened = at('2026-11-09T10:00');
const holds = [[at('2026-11-09T11:00'), at('2026-11-10T10:00')]];
const now = at('2026-11-10T12:00');

const used = support.workingTimeBetween(opened, now, { pauses: holds });
used.toString(); // → 'PT3H'

const remaining = Temporal.Duration.from({ hours: 8 }).subtract(used);
support.addWorkingTime(now, remaining).toString(); // → '2026-11-10T17:00:00-05:00[America/New_York]'
```

There were 10 working hours between opening and now. The hold covered 7 of them (Monday 11:00 to 17:00 and Tuesday
09:00 to 10:00), so 3 count against the SLA.

## In an API

Create the calendar once at startup and share it between requests. It has no global state, so teams with different
hours or holidays can each have their own.

```typescript
// Express
app.get('/tickets/:id/deadline', async (req, res) => {
  const ticket = await tickets.find(req.params.id);
  const now = Temporal.Now.zonedDateTimeISO('America/New_York');
  const used = support.workingTimeBetween(ticket.openedAt, now, {
    pauses: ticket.holds.map((hold) => [hold.start, hold.end]),
  });
  const sla = Temporal.Duration.from({ hours: SLA_HOURS[ticket.priority] });
  const due = support.addWorkingTime(now, sla.subtract(used));
  res.json({ due: due.toString(), usedHours: used.total('hours') });
});
```
