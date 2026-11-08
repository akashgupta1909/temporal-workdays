import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { describe as describeValue } from '../src/errors.js';
import { addWorkdays, createWorkCalendar, eachWorkday, isWorkday, subtractWorkdays } from '../src/index.js';

const d = Temporal.PlainDate.from('2024-01-01');

describe('validation', () => {
  it('rejects invalid weekend days', () => {
    for (const bad of [0, 8, 1.5, '1', null]) {
      expect(() => isWorkday(d, { weekend: [bad as never] })).toThrow(RangeError);
    }
    expect(() => isWorkday(d, { weekend: 6 as never })).toThrow(/weekend must be an array/);
  });

  it('rejects malformed or impossible holiday strings', () => {
    for (const bad of ['2024-1-01', 'tomorrow', '2023-02-29', '13-01', '02-30', '12345-01-01', '']) {
      expect(() => isWorkday(d, { holidays: [bad] }), bad).toThrow(RangeError);
    }
  });

  it('accepts extended years', () => {
    expect(isWorkday(d, { holidays: ['+010000-01-01', '-000001-06-01'] })).toBe(true);
  });

  it('rejects non-date holiday entries and non-iterable holidays', () => {
    expect(() => isWorkday(d, { holidays: [20240101 as never] })).toThrow(TypeError);
    expect(() => isWorkday(d, { holidays: {} as never })).toThrow(/holidays must be an array or a function/);
  });

  it('rejects non-ISO PlainMonthDay holidays', () => {
    const md = Temporal.PlainMonthDay.from({ monthCode: 'M01', day: 1, calendar: 'hebrew' });
    expect(() => isWorkday(d, { holidays: [md] })).toThrow(/iso8601/);
  });

  it('rejects bad extraWorkdays', () => {
    expect(() => isWorkday(d, { extraWorkdays: ['12-25'] })).toThrow(RangeError);
    // A bare string is iterable but would be split into characters: reject it.
    expect(() => isWorkday(d, { extraWorkdays: '2024-01-01' as never })).toThrow(/extraWorkdays must be an array/);
    expect(() => isWorkday(d, { extraWorkdays: 1 as never })).toThrow(/extraWorkdays must be an array/);
  });

  it('rejects non-object options and unknown option names', () => {
    expect(() => isWorkday(d, null as never)).toThrow(/options must be an object/);
    expect(() => isWorkday(d, 'weekend' as never)).toThrow(TypeError);
    expect(() => isWorkday(d, { holiday: ['2024-01-01'] } as never)).toThrow(/unknown option "holiday"/);
    expect(() => createWorkCalendar({ weekends: [6] } as never)).toThrow(/unknown option/);
  });

  it('rejects non-integer and unsafe amounts', () => {
    for (const bad of [1.5, Number.NaN, Infinity, 2 ** 53, '2']) {
      expect(() => addWorkdays(d, bad as never)).toThrow(RangeError);
      expect(() => subtractWorkdays(d, bad as never)).toThrow(RangeError);
      expect(() => createWorkCalendar().subtractWorkdays(d, bad as never)).toThrow(RangeError);
    }
  });

  it('rejects non-Temporal dates', () => {
    for (const bad of [new Date(), '2024-01-01', { add: () => d }, null, Temporal.PlainTime.from('10:00')]) {
      expect(() => isWorkday(bad as never)).toThrow(TypeError);
    }
  });

  it('eachWorkday validates eagerly', () => {
    expect(() => eachWorkday(d, d, { weekend: [9 as never] })).toThrow(RangeError);
  });

  it('describes every kind of value in messages without throwing', () => {
    expect(describeValue('x')).toBe('"x"');
    expect(describeValue(1n)).toBe('1');
    expect(describeValue(undefined)).toBe('undefined');
    expect(describeValue(Symbol('s'))).toBe('Symbol(s)');
    expect(describeValue(() => 1)).toBe('a function');
    expect(describeValue(null)).toBe('null');
    expect(describeValue(Object.create(null))).toBe('[object Object]');
    expect(describeValue(d)).toBe('[object Temporal.PlainDate]');
  });
});
