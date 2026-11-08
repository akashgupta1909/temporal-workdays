// Pure integer date arithmetic on the proleptic ISO calendar.
// "Epoch day" = number of days since 1970-01-01 (which is day 0).
// Working on integers keeps the hot loops fast and independent of any
// particular Temporal implementation (native or polyfill).

/** Days from 1970-01-01 to the given ISO date (Howard Hinnant's algorithm). */
export function epochDayFromIso(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12; // March = 0
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of epochDayFromIso. Returns [year, month, day]. */
export function isoFromEpochDay(epochDay: number): [number, number, number] {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  return [year, month, day];
}

/** ISO day of week: 1 = Monday … 7 = Sunday. 1970-01-01 was a Thursday. */
export function dayOfWeekFromEpochDay(epochDay: number): number {
  return ((((epochDay + 3) % 7) + 7) % 7) + 1;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
