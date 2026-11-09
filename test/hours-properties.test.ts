import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import {
  addWorkingTime,
  createWorkCalendar,
  getWorkingHours,
  isWorkingTime,
  rollBackwardToWorkingTime,
  rollForwardToWorkingTime,
  subtractWorkingTime,
  workingTimeBetween,
} from '../src/index.js';
import { runs } from './arbitraries.js';
import { hoursConfig, minuteArb, ReferenceModel, toDateTime, toHoursOptions, toMinute } from './hours-reference.js';

// Starts within ~4 months; amounts up to 3 days of minutes keep the reference walk cheap.
const start = minuteArb(120);
const amount = fc.integer({ min: -4320, max: 4320 });
const params = runs(150);

describe('working-time properties (vs. minute-by-minute reference)', () => {
  it('isWorkingTime', () => {
    fc.assert(
      fc.property(hoursConfig, start, (c, m) => {
        expect(isWorkingTime(toDateTime(m), toHoursOptions(c))).toBe(new ReferenceModel(c).isWorking(m));
      }),
      params,
    );
  });

  it('addWorkingTime / subtractWorkingTime', () => {
    fc.assert(
      fc.property(hoursConfig, start, amount, (c, m, n) => {
        const o = toHoursOptions(c);
        const ref = new ReferenceModel(c);
        const expected = n === 0 ? m : ref.add(m, n);
        expect(toMinute(addWorkingTime(toDateTime(m), { minutes: n }, o))).toBe(expected);
        expect(toMinute(subtractWorkingTime(toDateTime(m), { minutes: -n }, o))).toBe(expected);
      }),
      params,
    );
  });

  it('workingTimeBetween', () => {
    fc.assert(
      fc.property(hoursConfig, start, start, (c, a, b) => {
        const d = workingTimeBetween(toDateTime(a), toDateTime(b), toHoursOptions(c));
        expect(d.total('minutes')).toBe(new ReferenceModel(c).between(a, b));
        expect(d.days).toBe(0); // balanced up to hours only
      }),
      params,
    );
  });

  it('workingTimeBetween leaves out pauses, even overlapping ones', () => {
    const pause = fc.tuple(start, fc.nat({ max: 3000 })).map(([m, len]) => [m, m + len] as const);
    fc.assert(
      fc.property(hoursConfig, start, start, fc.array(pause, { maxLength: 4 }), (c, a, b, pauses) => {
        const d = workingTimeBetween(toDateTime(a), toDateTime(b), toHoursOptions(c), {
          pauses: pauses.map(([ps, pe]) => [toDateTime(ps), toDateTime(pe)] as const),
        });
        expect(d.total('minutes')).toBe(new ReferenceModel(c).between(a, b, pauses));
      }),
      params,
    );
  });

  it('workingTimeBetween inverts addWorkingTime', () => {
    fc.assert(
      fc.property(hoursConfig, start, fc.nat({ max: 4320 }), (c, m, n) => {
        const o = toHoursOptions(c);
        const from = toDateTime(m);
        expect(workingTimeBetween(from, addWorkingTime(from, { minutes: n }, o), o).total('minutes')).toBe(n);
      }),
      params,
    );
  });

  it('roll forward / backward', () => {
    fc.assert(
      fc.property(hoursConfig, start, (c, m) => {
        const o = toHoursOptions(c);
        const ref = new ReferenceModel(c);
        expect(toMinute(rollForwardToWorkingTime(toDateTime(m), o))).toBe(ref.rollForward(m));
        expect(toMinute(rollBackwardToWorkingTime(toDateTime(m), o))).toBe(ref.rollBackward(m));
      }),
      params,
    );
  });

  it('getWorkingHours matches the reference ranges', () => {
    fc.assert(
      fc.property(hoursConfig, fc.nat({ max: 120 }), (c, day) => {
        const date = Temporal.PlainDate.from('2020-01-01').add({ days: day });
        const hours = getWorkingHours(date, toHoursOptions(c));
        const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
        // An end at or before the start is an overnight range that ends the next morning.
        const total = hours.reduce(
          (sum, [s, e]) => sum + (minutes(e) > minutes(s) ? 0 : 1440) + minutes(e) - minutes(s),
          0,
        );
        const expected = new ReferenceModel(c).rangesOnDay(day).reduce((sum, [s, e]) => sum + e - s, 0);
        expect(total).toBe(expected);
      }),
      params,
    );
  });

  it('a calendar gives the same answers as the standalone functions', () => {
    fc.assert(
      fc.property(hoursConfig, start, amount, (c, m, n) => {
        const o = toHoursOptions(c);
        const cal = createWorkCalendar(o);
        const dt = toDateTime(m);
        const later = toDateTime(m + Math.abs(n));
        const str = (x: { toString(): string }) => x.toString();
        expect(cal.isWorkingTime(dt)).toBe(isWorkingTime(dt, o));
        expect(str(cal.addWorkingTime(dt, { minutes: n }))).toBe(str(addWorkingTime(dt, { minutes: n }, o)));
        expect(str(cal.subtractWorkingTime(dt, { minutes: n }))).toBe(str(subtractWorkingTime(dt, { minutes: n }, o)));
        expect(str(cal.workingTimeBetween(dt, later))).toBe(str(workingTimeBetween(dt, later, o)));
        expect(str(cal.rollForwardToWorkingTime(dt))).toBe(str(rollForwardToWorkingTime(dt, o)));
        expect(str(cal.rollBackwardToWorkingTime(dt))).toBe(str(rollBackwardToWorkingTime(dt, o)));
        expect(cal.getWorkingHours(dt)).toEqual(getWorkingHours(dt, o));
      }),
      runs(60),
    );
  });

  it('ZonedDateTime in a zone without DST behaves exactly like PlainDateTime', () => {
    fc.assert(
      fc.property(hoursConfig, start, amount, (c, m, n) => {
        const o = toHoursOptions(c);
        const plain = toDateTime(m);
        const zoned = plain.toZonedDateTime('Asia/Kolkata');
        const r = addWorkingTime(zoned, { minutes: n }, o);
        expect(r.timeZoneId).toBe('Asia/Kolkata');
        expect(r.toPlainDateTime().toString()).toBe(addWorkingTime(plain, { minutes: n }, o).toString());
      }),
      runs(60),
    );
  });
});
