// Runtime-agnostic checks of the built package. No Node APIs: these run in Deno, Bun,
// browsers and Cloudflare Workers. Returns the number of checks, throws on the first failure.
export function runAssertions(Temporal, lib) {
  let count = 0;
  const equal = (actual, expected, label) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`);
    count++;
  };
  const d = (s) => Temporal.PlainDate.from(s);
  const pdt = (s) => Temporal.PlainDateTime.from(s);

  equal(lib.addWorkdays(d('2026-11-06'), 1).toString(), '2026-11-09', 'addWorkdays');
  equal(lib.workdaysBetween(d('2026-11-02'), d('2026-11-09')), 5, 'workdaysBetween');
  equal(lib.workdaysInMonth(d('2026-11-10')).length, 21, 'workdaysInMonth');

  const us = { observed: 'nearest', holidays: ['07-04', { month: 11, dayOfWeek: 4, week: 4 }, { easter: -2 }] };
  equal(lib.isHoliday(d('2026-07-03'), us), true, 'observed holiday');
  equal(lib.isHoliday(d('2026-11-26'), us), true, 'nth weekday rule');
  equal(lib.isHoliday(d('2026-04-03'), us), true, 'easter rule');

  const support = lib.createWorkCalendar({
    hours: [
      ['09:00', '12:00'],
      ['13:00', '17:00'],
    ],
  });
  const ticket = Temporal.ZonedDateTime.from('2026-11-06T16:00[America/New_York]');
  equal(
    support.addWorkingTime(ticket, { hours: 4 }).toString(),
    '2026-11-09T12:00:00-05:00[America/New_York]',
    'zoned SLA',
  );
  // Across a real DST change (New York, 2024-11-03): the night is 9 hours.
  const nights = { hours: [['22:00', '06:00']], weekend: [] };
  const night = Temporal.ZonedDateTime.from('2024-11-02T22:00[America/New_York]');
  equal(
    lib.workingTimeBetween(night, Temporal.ZonedDateTime.from('2024-11-03T06:00[America/New_York]'), nights).toString(),
    'PT9H',
    'DST night',
  );
  const paused = lib.workingTimeBetween(
    pdt('2026-11-09T09:00'),
    pdt('2026-11-09T17:00'),
    { hours: [['09:00', '17:00']] },
    {
      pauses: [[pdt('2026-11-09T10:00'), pdt('2026-11-09T12:00')]],
    },
  );
  equal(paused.toString(), 'PT6H', 'pauses');

  const source = {
    getHolidays: (y) => [{ date: `${y}-12-24 14:00:00`, type: 'bank', start: new Date(0), end: new Date(36e6) }],
  };
  equal(
    lib.getWorkingHours(d('2026-12-24'), {
      ...lib.fromDateHolidays(source, { types: ['bank'] }),
      hours: [['09:00', '17:00']],
    }),
    [['09:00', '14:00']],
    'fromDateHolidays',
  );

  let threw = false;
  try {
    lib.addWorkdays(d('2026-11-06'), 1.5);
  } catch (error) {
    threw = error instanceof RangeError;
  }
  equal(threw, true, 'validation');
  return count;
}
