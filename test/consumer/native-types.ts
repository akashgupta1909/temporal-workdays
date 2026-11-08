import Holidays from 'date-holidays';
import {
  addWorkdays,
  fromDateHolidays,
  addWorkingTime,
  createWorkCalendar,
  getWorkingHours,
  workdaysBetween,
  workingTimeBetween,
  type WorkingTimeOptions,
} from 'temporal-workdays';

const options: WorkingTimeOptions = {
  weekend: [6, 7],
  holidays: ['12-25', '2026-11-26', Temporal.PlainMonthDay.from('01-01'), Temporal.PlainDate.from('2026-07-03')],
  hours: { default: [['09:00', '17:00']], 5: [[Temporal.PlainTime.from('09:00'), '13:00']] },
  specialHours: (date: Temporal.PlainDate, regular) => (date.day === 24 ? regular.slice(0, 1) : undefined),
};

const day: Temporal.PlainDate = addWorkdays(Temporal.PlainDate.from('2026-11-06'), 1, options);
const zoned: Temporal.ZonedDateTime = addWorkingTime(Temporal.Now.zonedDateTimeISO(), { hours: 4 }, options);
const plain: Temporal.PlainDateTime = addWorkingTime(
  Temporal.Now.plainDateTimeISO(),
  Temporal.Duration.from('PT1H'),
  options,
);
const span: Temporal.Duration = workingTimeBetween(zoned, zoned.add({ days: 3 }), options);
const hours: number = span.total('hours');
const count: number = workdaysBetween(day, zoned, options);

const calendar = createWorkCalendar(options);
const byRule = createWorkCalendar({ holidays: (d: Temporal.PlainDate) => d.month === 7 && d.day === 4 });
const july5: Temporal.PlainDate = byRule.nextWorkday(Temporal.PlainDate.from('2027-07-02'));
const due: Temporal.ZonedDateTime = calendar.addWorkingTime(zoned, { minutes: 90 });
const ranges: readonly (readonly [string, string])[] = getWorkingHours(due, options);

// @ts-expect-error mixing PlainDateTime and ZonedDateTime is a type error
workingTimeBetween(plain, zoned, options);

const german = createWorkCalendar({
  ...fromDateHolidays(new Holidays('DE', 'BY'), { types: ['public', 'bank'] }),
  hours: [['09:00', '17:00']],
});
const christmasEve: readonly (readonly [string, string])[] = german.getWorkingHours(
  Temporal.PlainDate.from('2026-12-24'),
);

export { christmasEve, count, hours, july5, ranges };
