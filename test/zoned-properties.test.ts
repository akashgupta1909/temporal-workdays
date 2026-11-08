// ZonedDateTime working time around real DST transitions, checked against a naive oracle
// that converts every working-period boundary with Temporal directly (no fast paths) and
// walks the exact timeline minute by minute.
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill/full';
import { describe, expect, it } from 'vitest';
import { addWorkingTime, isWorkingTime, workingTimeBetween, type WorkingTimeOptions } from '../src/index.js';
import { runs } from './arbitraries.js';

const MINUTE = 60_000_000_000n;
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Zones with ordinary, half-hour (Lord Howe), southern-hemisphere and skipped-day (Apia 2011) transitions.
const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'America/Santiago', 'Pacific/Apia'];

/** Transition instants per zone in 2010–2012, so that generated times cluster around them. */
const transitions = new Map(
  zones.map((zone) => {
    const list: Temporal.ZonedDateTime[] = [];
    let t: Temporal.ZonedDateTime | null = Temporal.ZonedDateTime.from({
      year: 2010,
      month: 1,
      day: 1,
      timeZone: zone,
    });
    while ((t = t.getTimeZoneTransition('next')) && t.year < 2013) list.push(t);
    return [zone, list] as const;
  }),
);

const ranges = fc.uniqueArray(fc.integer({ min: 0, max: 1440 }), { minLength: 2, maxLength: 6 }).map((cuts) => {
  const s = [...cuts].sort((a, b) => a - b);
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push([fmt(s[i]!), fmt(s[i + 1]!)]);
  return out;
});

const scenario = fc
  .record({
    zone: fc.constantFrom(...zones),
    which: fc.nat(),
    shiftMinutes: fc.integer({ min: -3 * 1440, max: 3 * 1440 }),
    hours: ranges,
  })
  .map(({ zone, which, shiftMinutes, hours }) => {
    const list = transitions.get(zone)!;
    const start = list[which % list.length]!.add({ minutes: shiftMinutes }).round('minute');
    const options: WorkingTimeOptions = { weekend: [], hours };
    return { zone, start, options, hours };
  });

/** Naive oracle: exact working periods of a wall day, each boundary converted by Temporal itself. */
function periods(zone: string, date: Temporal.PlainDate, hours: [string, string][]): [bigint, bigint][] {
  const instant = (t: string) =>
    t === '24:00'
      ? date.add({ days: 1 }).toZonedDateTime({ timeZone: zone, plainTime: '00:00' }).epochNanoseconds
      : date.toZonedDateTime({ timeZone: zone, plainTime: t }).epochNanoseconds; // 'compatible'
  return hours.map(([s, e]) => [instant(s), instant(e)]);
}

/**
 * Every working instant from two days before `start` onwards, as a sorted union of exact
 * periods, built lazily day by day. Periods from neighbouring days may overlap after DST
 * shifts; the union counts each instant once.
 */
class Oracle {
  readonly #periods: [bigint, bigint][] = [];
  #nextDate: Temporal.PlainDate;

  constructor(
    readonly zone: string,
    readonly hours: [string, string][],
    start: Temporal.ZonedDateTime,
  ) {
    this.#nextDate = start.toPlainDate().subtract({ days: 2 });
  }

  /** Builds days until every period that could contain `t` is known (DST shifts are < 2 days). */
  #ensure(t: bigint): void {
    const horizon = t + 2n * 86_400_000_000_000n;
    while (this.#nextDate.toZonedDateTime({ timeZone: this.zone }).epochNanoseconds <= horizon) {
      const all = [...this.#periods, ...periods(this.zone, this.#nextDate, this.hours)]
        .filter(([s, e]) => e > s)
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
      this.#periods.length = 0;
      for (const [s, e] of all) {
        const last = this.#periods.at(-1);
        if (last && s <= last[1]) last[1] = e > last[1] ? e : last[1];
        else this.#periods.push([s, e]);
      }
      this.#nextDate = this.#nextDate.add({ days: 1 });
    }
  }

  isWorking(t: bigint): boolean {
    this.#ensure(t);
    return this.#periods.some(([s, e]) => t >= s && t < e);
  }

  /** The first working instant at or after `t`. */
  nextWorking(t: bigint): bigint {
    for (let horizon = t; ; horizon += 30n * 86_400_000_000_000n) {
      this.#ensure(horizon);
      const p = this.#periods.find(([, e]) => e > t);
      if (p) return p[0] > t ? p[0] : t;
    }
  }
}

describe('ZonedDateTime around DST transitions (vs. naive oracle)', () => {
  it('isWorkingTime', () => {
    fc.assert(
      fc.property(scenario, ({ zone, start, options, hours }) => {
        expect(isWorkingTime(start, options)).toBe(new Oracle(zone, hours, start).isWorking(start.epochNanoseconds));
      }),
      runs(300),
    );
  });

  it('addWorkingTime by exact minutes', () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 1, max: 1500 }), ({ zone, start, options, hours }, n) => {
        const oracle = new Oracle(zone, hours, start);
        // Walk minute by minute through working time, jumping over non-working stretches.
        let t = start.epochNanoseconds;
        for (let left = n; ; t += MINUTE) {
          t = oracle.nextWorking(t);
          if (--left === 0) break;
        }
        const result = addWorkingTime(start, { minutes: n }, options);
        expect(result.epochNanoseconds).toBe(t + MINUTE);
        expect(result.timeZoneId).toBe(zone);
      }),
      runs(150),
    );
  });

  it('workingTimeBetween by exact minutes', () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 0, max: 3000 }), ({ zone, start, options, hours }, len) => {
        const oracle = new Oracle(zone, hours, start);
        const end = start.add({ minutes: len });
        let count = 0;
        for (let t = start.epochNanoseconds; t < end.epochNanoseconds; t += MINUTE) if (oracle.isWorking(t)) count++;
        expect(workingTimeBetween(start, end, options).total('minutes')).toBe(count);
      }),
      runs(150),
    );
  });
});
