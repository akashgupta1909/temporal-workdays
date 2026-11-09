// Bundled by esbuild for the browser tests: the built package, a polyfill and the checks.
import { Temporal as Polyfill } from 'temporal-polyfill';
import * as lib from '../../dist/index.js';
import { runAssertions } from './assertions.js';

globalThis.__runChecks = () => {
  const results = { native: typeof globalThis.Temporal === 'object', polyfill: runAssertions(Polyfill, lib) };
  if (results.native) results.nativeChecks = runAssertions(globalThis.Temporal, lib);
  return results;
};
