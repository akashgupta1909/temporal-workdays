<script setup>
// SLA deadline playground. Uses the library's own source (aliased as 'temporal-workdays' in
// config.mts), temporal-polyfill, and date-holidays for country holiday data.
import Holidays from 'date-holidays';
import { Temporal } from 'temporal-polyfill';
import { createWorkCalendar, fromDateHolidays } from 'temporal-workdays';
import { computed, ref, watch } from 'vue';

const countries = [
  ['US', 'United States', 'America/New_York'],
  ['GB', 'United Kingdom', 'Europe/London'],
  ['DE', 'Germany', 'Europe/Berlin'],
  ['FR', 'France', 'Europe/Paris'],
  ['IN', 'India', 'Asia/Kolkata'],
  ['JP', 'Japan', 'Asia/Tokyo'],
  ['AU', 'Australia', 'Australia/Sydney'],
  ['CA', 'Canada', 'America/Toronto'],
  ['BR', 'Brazil', 'America/Sao_Paulo'],
  ['AE', 'United Arab Emirates', 'Asia/Dubai'],
  ['SG', 'Singapore', 'Asia/Singapore'],
  ['NL', 'Netherlands', 'Europe/Amsterdam'],
];

const country = ref('US');
const timeZone = ref('America/New_York');
const hoursText = ref('09:00-12:00, 13:00-17:00');
const weekendText = ref('6, 7');
const start = ref(Temporal.Now.plainDateTimeISO().round('minute').toString().slice(0, 16));
const slaHours = ref(16);

watch(country, (code) => {
  timeZone.value = countries.find(([c]) => c === code)?.[2] ?? 'UTC';
});

const holidaySource = computed(() => new Holidays(country.value));

const result = computed(() => {
  try {
    const hours = hoursText.value.split(',').map((range) => {
      const [from, to] = range
        .trim()
        .split('-')
        .map((t) => t.trim());
      if (!from || !to) throw new Error(`"${range.trim()}" is not a range like 09:00-17:00`);
      return [from, to];
    });
    const weekend = weekendText.value
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
      .map(Number);
    const calendar = createWorkCalendar({ ...fromDateHolidays(holidaySource.value), hours, weekend });
    const opened = Temporal.PlainDateTime.from(start.value).toZonedDateTime(timeZone.value);
    const due = calendar.addWorkingTime(opened, { hours: Number(slaHours.value) });

    const days = [];
    for (let d = opened.toPlainDate(); Temporal.PlainDate.compare(d, due.toPlainDate()) <= 0; d = d.add({ days: 1 })) {
      const periods = calendar.getWorkingHours(d);
      days.push({
        date: d.toLocaleString('en', { weekday: 'short', day: 'numeric', month: 'short' }),
        hours: periods.length
          ? periods.map(([a, b]) => `${a}–${b}`).join(', ')
          : calendar.isHoliday(d)
            ? 'holiday'
            : 'closed',
      });
    }

    const year = opened.year;
    const upcoming = [...holidaySource.value.getHolidays(year), ...holidaySource.value.getHolidays(year + 1)]
      .filter((h) => h.type === 'public' && h.date.slice(0, 10) >= opened.toPlainDate().toString())
      .slice(0, 5)
      .map((h) => `${h.date.slice(0, 10)} ${h.name}`);

    return {
      due: due.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' }),
      dueIso: due.toString(),
      inHours: calendar.isWorkingTime(opened),
      days,
      upcoming,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
</script>

<template>
  <div class="playground">
    <div class="fields">
      <label>
        Country
        <select v-model="country">
          <option v-for="[code, name] in countries" :key="code" :value="code">{{ name }}</option>
        </select>
      </label>
      <label>Time zone <input v-model="timeZone" /></label>
      <label>Working hours <input v-model="hoursText" /></label>
      <label>Weekend (1 = Monday … 7 = Sunday) <input v-model="weekendText" /></label>
      <label>Ticket opened (local time) <input v-model="start" type="datetime-local" /></label>
      <label>SLA in business hours <input v-model.number="slaHours" type="number" min="0" step="1" /></label>
    </div>

    <div v-if="result.error" class="error">{{ result.error }}</div>
    <div v-else class="result">
      <p class="due">Due {{ result.due }}</p>
      <p class="iso">
        <code>{{ result.dueIso }}</code>
      </p>
      <p>The ticket was opened {{ result.inHours ? 'during' : 'outside' }} working hours.</p>
      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Working hours</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="day in result.days" :key="day.date">
            <td>{{ day.date }}</td>
            <td>{{ day.hours }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="result.upcoming.length">Next public holidays: {{ result.upcoming.join(' · ') }}</p>
    </div>
  </div>
</template>

<style scoped>
.playground {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 16px;
}
.fields {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
label {
  display: flex;
  flex-direction: column;
  font-size: 14px;
  gap: 4px;
}
input,
select {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 4px 8px;
}
.due {
  font-size: 20px;
  font-weight: 600;
}
.error {
  color: var(--vp-c-danger-1);
  margin-top: 16px;
}
</style>
