# Getting started

```sh
npm install temporal-workdays
```

You also need a Temporal implementation. Firefox 139+, Chrome 144+ and Node.js 26+ have one built in. Elsewhere, add
a polyfill:

```sh
npm install temporal-polyfill
```

```js
import 'temporal-polyfill/global';
```

## A first example

```ts
import { addWorkdays, createWorkCalendar } from 'temporal-workdays';

addWorkdays(Temporal.PlainDate.from('2026-11-06'), 1).toString(); // → '2026-11-09'

const support = createWorkCalendar({ hours: [['09:00', '17:00']], holidays: ['12-25'] });
const opened = Temporal.ZonedDateTime.from('2026-12-24T15:00[America/New_York]');
support.addWorkingTime(opened, { hours: 4 }).toString(); // → '2026-12-28T11:00:00-05:00[America/New_York]'
```

The ticket opened on Thursday, December 24 at 15:00. Two hours are left that day. Friday is Christmas and the
weekend follows, so the remaining two hours run on Monday morning.

## Next steps

- [Workdays](./workdays) and [holiday rules](./holidays)
- [Working hours](./working-hours), including overnight shifts and SLA pauses
- [Recipes](../recipes/sla-deadlines) for support desks, payroll and delivery dates
- The [API reference](./api)
