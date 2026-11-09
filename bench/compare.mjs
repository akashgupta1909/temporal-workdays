// Benchmark against moment-business-days and luxon-business-days: `npm run bench`.
// All three get the same holidays. temporal-workdays runs on temporal-polyfill here; native
// Temporal (Node 26+, Chrome, Firefox) is usually faster.
import luxonBusiness from 'luxon-business-days';
import moment from 'moment-business-days';
import { Bench } from 'tinybench';
import { Temporal } from 'temporal-polyfill';
import { createWorkCalendar } from '../dist/index.js';

const { DateTime } = luxonBusiness;

const holidays = ['2026-01-01', '2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25'];
moment.updateLocale('en', { holidays, holidayFormat: 'YYYY-MM-DD' });
const holidaySet = new Set(holidays);
DateTime.local().setupBusiness({ holidayMatchers: [(dt) => holidaySet.has(dt.toISODate())] });
const calendar = createWorkCalendar({ holidays });

const start = Temporal.PlainDate.from('2026-03-04');
const end = Temporal.PlainDate.from('2027-03-04');
const m = moment('2026-03-04');
const mEnd = moment('2027-03-04');
const lx = DateTime.fromISO('2026-03-04');

const bench = new Bench({ time: 400 });
bench
  .add('add 20 business days · temporal-workdays', () => calendar.addWorkdays(start, 20))
  .add('add 20 business days · moment-business-days', () => m.businessAdd(20))
  .add('add 20 business days · luxon-business-days', () => lx.plusBusiness({ days: 20 }))
  .add('count business days in a year · temporal-workdays', () => calendar.workdaysBetween(start, end))
  .add('count business days in a year · moment-business-days', () => m.businessDiff(mEnd))
  .add('is it a business day · temporal-workdays', () => calendar.isWorkday(start))
  .add('is it a business day · moment-business-days', () => m.isBusinessDay())
  .add('business days of a month · temporal-workdays', () => calendar.workdaysInMonth(start))
  .add('business days of a month · moment-business-days', () => m.monthBusinessDays());

await bench.run();
const rows = bench.tasks.map((t) => {
  const [task, lib] = t.name.split(' · ');
  return {
    task,
    lib,
    opsPerSec: Math.round(t.result.throughput.mean),
    usPerOp: (1_000_000 / t.result.throughput.mean).toFixed(2),
  };
});
const tasks = [...new Set(rows.map((r) => r.task))];
const versus = (ours, r) => {
  const ratio = ours.opsPerSec / r.opsPerSec;
  return ratio >= 1 ? `${ratio.toFixed(1)}× faster` : `${(1 / ratio).toFixed(1)}× slower`;
};
for (const task of tasks) {
  const group = rows.filter((r) => r.task === task);
  const ours = group.find((r) => r.lib === 'temporal-workdays');
  console.log(`\n${task}`);
  for (const r of group) {
    const note = r === ours ? '' : `  (temporal-workdays is ${versus(ours, r)})`;
    console.log(`  ${r.lib.padEnd(22)} ${String(r.usPerOp).padStart(9)} µs/op${note}`);
  }
}

// The same results as a Markdown table, for the README.
console.log('\n| Task | temporal-workdays | moment-business-days | luxon-business-days |');
console.log('| --- | --- | --- | --- |');
for (const task of tasks) {
  const cell = (lib) => {
    const r = rows.find((row) => row.task === task && row.lib === lib);
    return r ? `${r.usPerOp} µs` : 'not available';
  };
  console.log(
    `| ${task} | ${cell('temporal-workdays')} | ${cell('moment-business-days')} | ${cell('luxon-business-days')} |`,
  );
}
console.log(`\nNode ${process.version}, ${process.platform}/${process.arch}`);
