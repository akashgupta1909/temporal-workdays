// A Cloudflare Worker that runs the checks and returns the result as JSON.
import { Temporal as Polyfill } from 'temporal-polyfill';
import * as lib from '../../dist/index.js';
import { runAssertions } from './assertions.js';

export default {
  fetch() {
    try {
      const native = typeof globalThis.Temporal === 'object';
      const body = { polyfill: runAssertions(Polyfill, lib), native };
      if (native) body.nativeChecks = runAssertions(globalThis.Temporal, lib);
      return Response.json(body);
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 500 });
    }
  },
};
