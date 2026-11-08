// Dependency-free runtime check of the *built* package (dist/), loaded through its
// own "exports" map. Runs on every supported Node version, including ones the dev
// toolchain (vitest, tsup) no longer supports. Usage: node test/smoke/smoke.mjs
import assert from 'node:assert/strict';
import { Temporal } from 'temporal-polyfill';
import * as esm from 'temporal-workdays';
import { createRequire } from 'node:module';

const cjs = createRequire(import.meta.url)('temporal-workdays');
const d = (s) => Temporal.PlainDate.from(s);

for (const [name, lib] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  assert.equal(lib.addWorkdays(d('2026-11-06'), 1).toString(), '2026-11-09', `${name}: addWorkdays`);
  assert.equal(lib.workdaysBetween(d('2026-11-02'), d('2026-11-09')), 5, `${name}: workdaysBetween`);
  assert.equal(lib.isWorkday(d('2026-11-07')), false, `${name}: isWorkday`);
  const cal = lib.createWorkCalendar({ holidays: ['12-25'], weekend: [5, 6] });
  assert.equal(cal.nextWorkday(d('2026-12-24')).toString(), '2026-12-27', `${name}: calendar`);
  const zdt = Temporal.ZonedDateTime.from('2026-11-06T17:00[America/New_York]');
  assert.equal(lib.addWorkdays(zdt, 1).toString(), '2026-11-09T17:00:00-05:00[America/New_York]', `${name}: zoned`);
  assert.throws(() => lib.addWorkdays(d('2026-11-06'), 1.5), RangeError, `${name}: validation`);

  const hours = {
    hours: [
      ['09:00', '12:00'],
      ['13:00', '17:00'],
    ],
  };
  const ny = Temporal.ZonedDateTime.from('2026-11-06T16:00[America/New_York]');
  assert.equal(
    lib.addWorkingTime(ny, { hours: 2 }, hours).toString(),
    '2026-11-09T10:00:00-05:00[America/New_York]',
    `${name}: addWorkingTime`,
  );
  const span = lib.workingTimeBetween(ny, Temporal.ZonedDateTime.from('2026-11-09T13:30[America/New_York]'), hours);
  assert.equal(span.toString(), 'PT4H30M', `${name}: workingTimeBetween`);
  assert.equal(lib.createWorkCalendar(hours).isWorkingTime(ny.with({ hour: 12, minute: 30 })), false, `${name}: lunch`);
}
assert.notEqual(esm.addWorkdays, undefined);
console.log(`smoke ok on Node ${process.version}`);
