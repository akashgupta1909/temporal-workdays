# Changelog

## 0.4.0

### Added

- Holiday rules: a date every year (`{ month, day }`), the nth or last weekday of a month
  (`{ month: 11, dayOfWeek: 4, week: 4 }`), days relative to Western or Orthodox Easter (`{ easter: -2 }`) and single
  dates (`{ date }`). Every rule accepts `offset`, `from` and `to` years, and `name`. Tested against `date-holidays`:
  US federal and England and Wales holidays from 1990 to 2060, and Easter from 1900 to 2100.
- Observed holidays: `observed: 'nearest' | 'next' | 'previous' | 'none'`, for the calendar or for one rule. A
  substitute can cross into another year and skips days that are already holidays.
- Overnight shifts: a range whose end is before its start (`['22:00', '06:00']`) runs into the next morning and
  belongs to the day it starts. It stays exact across DST changes with `ZonedDateTime`.
- Pauses for SLAs: `workingTimeBetween(start, end, options, { pauses })`, or `calendar.workingTimeBetween(start, end,
  { pauses })`, leaves the paused periods out.
- A documentation site with guides, recipes (SLA deadlines, payroll, delivery estimates) and a playground:
  https://akashgupta1909.github.io/temporal-workdays/
- The package is also published to JSR as `@akashgupta1909/temporal-workdays`.
- npm releases are published from GitHub Actions with provenance.

### Changed

- A range like `['17:00', '09:00']` used to be an error and is now an overnight range. Empty ranges and ranges that
  start at `24:00` are still rejected.
- The workday functions are now about 3.2 kB (they were 1.8 kB) because they include the holiday rules.

### Testing

- CI runs the package on Deno, Bun, Chromium, Firefox, WebKit and Cloudflare Workers, in addition to Node 18 to 26.
- Mutation testing with Stryker (`npm run test:mutation`).
- The migration guides for `luxon-business-days` and `date-fns` are checked against those libraries, and every code
  example in the docs runs in the test suite.

## 0.3.2

- `publishConfig.access` is set to `public`, so publishing never needs `--access public`.
- README: badges for version, CI, bundle size, types and license.

## 0.3.1

- README: how to use the package with `require()` on Node 18 and Node 20 before 20.19, where `temporal-polyfill`
  (ESM-only) can't be required. `@js-temporal/polyfill` is now tested in CI for that case.

## 0.3.0

### Added

- `workdaysInMonth(date)`, `workdayOfMonth(date)` and `workdaysByWeek(start, end)` (also on calendars), covering
  `moment-business-days`' `monthBusinessDays`, `businessDaysIntoMonth`, `monthBusinessWeeks` and
  `businessWeeksBetween`. Weeks start after the weekend (Sunday for a Friday–Saturday weekend).
- README: a migration guide from `moment-business-days`, with every translation verified against the real package
  in the test suite.

## 0.2.0

### Added

- **Working hours**: `isWorkingTime`, `addWorkingTime`, `subtractWorkingTime`, `workingTimeBetween` (returns a
  `Temporal.Duration`), `rollForwardToWorkingTime`, `rollBackwardToWorkingTime`, `getWorkingHours`.
  Hours per day of week with breaks, a default, and `specialHours` per date (table or function).
  `ZonedDateTime` measures exact elapsed time across DST changes.
- `createWorkCalendar({ hours })` returns a `WorkTimeCalendar` with the working-time methods.
- **`fromDateHolidays(holidays, { types })`**: holidays and partial-day closures from the `date-holidays` package,
  independent of the machine's time zone.
- One options object can now be shared by every function (day-level functions accept `hours`/`specialHours`).

### Changed

- Invalid input is rejected with clearer errors: unknown option names, non-object options, a bare string where an
  array is expected, 5-digit years (use the ISO `+YYYYYY` form), and unsafe integer amounts.

### Fixed

- `workdaysBetween` returned `-0` instead of `0` for empty backward ranges.
- `WorkCalendar#subtractWorkdays` accepted numeric strings such as `'2'`.
- The README's `date-holidays` example gave wrong answers outside the US time zones. It was replaced by `fromDateHolidays`.

## 0.1.0

- Initial release: `isWorkday`, `isWeekend`, `isHoliday`, `addWorkdays`, `subtractWorkdays`, `nextWorkday`,
  `previousWorkday`, `rollForward`, `rollBackward`, `workdaysBetween`, `eachWorkday`, `createWorkCalendar`.
