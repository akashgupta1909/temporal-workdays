# Changelog

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
