import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'temporal-workdays',
  description: 'Business days and business hours for the JavaScript Temporal API',
  base: '/temporal-workdays/',
  cleanUrls: true,
  lastUpdated: true,
  vite: {
    resolve: {
      // The playground runs the library's source, so the docs always match the code.
      alias: { 'temporal-workdays': fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Recipes', link: '/recipes/sla-deadlines' },
      { text: 'Playground', link: '/playground' },
      { text: 'npm', link: 'https://www.npmjs.com/package/temporal-workdays' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Workdays', link: '/guide/workdays' },
          { text: 'Holidays', link: '/guide/holidays' },
          { text: 'Working hours', link: '/guide/working-hours' },
          { text: 'API and requirements', link: '/guide/api' },
        ],
      },
      {
        text: 'Recipes',
        items: [
          { text: 'SLA deadlines', link: '/recipes/sla-deadlines' },
          { text: 'Payroll', link: '/recipes/payroll' },
          { text: 'Delivery estimates', link: '/recipes/delivery-estimates' },
        ],
      },
      {
        text: 'Migrating',
        items: [
          { text: 'From moment-business-days', link: '/migration/moment-business-days' },
          { text: 'From luxon-business-days', link: '/migration/luxon-business-days' },
          { text: 'From date-fns', link: '/migration/date-fns' },
        ],
      },
      { text: 'Playground', link: '/playground' },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/akashgupta1909/temporal-workdays' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/akashgupta1909/temporal-workdays/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: { message: 'Released under the MIT License.' },
  },
});
