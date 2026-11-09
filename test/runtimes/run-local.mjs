// Deno / Bun entry: loads the built package and a polyfill by path, then runs the assertions.
import * as lib from '../../dist/index.js';
import { Temporal } from '../../node_modules/temporal-polyfill/index.js';
import { runAssertions } from './assertions.js';

const runtime = globalThis.Deno
  ? `Deno ${globalThis.Deno.version.deno}`
  : globalThis.Bun
    ? `Bun ${globalThis.Bun.version}`
    : 'unknown';
const count = runAssertions(Temporal, lib);
console.log(`${runtime}: ${count} checks passed`);
