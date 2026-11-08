// CommonJS consumer of the built package with @js-temporal/polyfill, which (unlike
// temporal-polyfill 1.x) can be require()d on every supported Node version, Node 18 included.
const assert = require('node:assert/strict');
const { Temporal } = require('@js-temporal/polyfill');
const lib = require('temporal-workdays');

const d = (s) => Temporal.PlainDate.from(s);
assert.equal(lib.addWorkdays(d('2026-11-06'), 1).toString(), '2026-11-09');
assert.equal(lib.workdaysBetween(d('2026-11-02'), d('2026-11-09')), 5);
assert.deepEqual(
  lib.workdaysByWeek(d('2026-11-01'), d('2026-11-30')).map((w) => w.length),
  [5, 5, 5, 5, 1],
);
const cal = lib.createWorkCalendar({ hours: [['09:00', '17:00']] });
const due = cal.addWorkingTime(Temporal.ZonedDateTime.from('2024-03-08T16:00[America/New_York]'), { hours: 2 });
assert.equal(due.toString(), '2024-03-11T10:00:00-04:00[America/New_York]');
assert.equal(cal.workingTimeBetween(due, due.add({ hours: 3 })).toString(), 'PT3H');
console.log(`cjs + @js-temporal/polyfill smoke ok on Node ${process.version}`);
