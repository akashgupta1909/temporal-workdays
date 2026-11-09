# Changelog

## 0.4.0 (unreleased)

### Added

- **Holiday rules**: `{ month, day }`, nth / last weekday of a month (`{ month: 11, dayOfWeek: 4, week: 4 }`),
  Easter-relative (`{ easter: -2 }`, Western or `orthodox: true`), one-off `{ date }`, with `offset`, `from` / `to`
  years and `name`. Verified against `date-holidays` (US federal and England & Wales 1990–2060, Easter 1900–2100).
- **Observed holidays**: `observed: 'nearest' | 'next' | 'previous' | 'none'` for the calendar or per rule, including
  substitutes that cross a year boundary and skip days already taken.
- **Overnight shifts**: ranges whose end is before the start (`['22:00', '06:00']`) run into the next morning and
  belong to the day they start; exact across DST changes for `ZonedDateTime`.
- **SLA pauses**: `workingTimeBetween(start, end, options, { pauses })` (and on calendars) leaves paused periods out.

### Changed

- A range like `['17:00', '09:00']` was an error and is now an overnight range. Empty ranges and ranges starting at
  `24:00` are still rejected.
- Bundle size: workday functions ≈ 3.2 kB (were 1.8 kB) because they now include the holiday-rule engine.

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
- The README's `date-holidays` example gave wrong answers outside the US time zones; replaced by `fromDateHolidays`.

## 0.1.0

- Initial release: `isWorkday`, `isWeekend`, `isHoliday`, `addWorkdays`, `subtractWorkdays`, `nextWorkday`,
  `previousWorkday`, `rollForward`, `rollBackward`, `workdaysBetween`, `eachWorkday`, `createWorkCalendar`.
