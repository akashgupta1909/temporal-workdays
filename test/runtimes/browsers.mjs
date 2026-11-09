// Runs the runtime checks in Chromium, Firefox and WebKit (Safari's engine) via Playwright.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./browser-entry.js', import.meta.url))],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
});
const script = bundle.outputFiles[0].text;

let failed = false;
for (const engine of [chromium, firefox, webkit]) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>temporal-workdays</title>');
    await page.addScriptTag({ content: script });
    const r = await page.evaluate(() => globalThis.__runChecks());
    const native = r.native ? `native Temporal: ${r.nativeChecks} checks passed` : 'no native Temporal';
    console.log(`${engine.name()} ${browser.version()}: polyfill ${r.polyfill} checks passed, ${native}`);
  } catch (error) {
    failed = true;
    console.error(`${engine.name()}: FAILED — ${error.message}`);
  } finally {
    await browser.close();
  }
}
process.exitCode = failed ? 1 : 0;
