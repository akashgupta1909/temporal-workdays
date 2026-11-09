// Runs the runtime checks inside workerd, Cloudflare's Workers runtime, via Miniflare.
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./worker-entry.js', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
});
const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-01' });
try {
  const response = await mf.dispatchFetch('http://localhost/');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  const native = result.native ? `native Temporal: ${result.nativeChecks} checks passed` : 'no native Temporal';
  console.log(`Cloudflare workerd: polyfill ${result.polyfill} checks passed, ${native}`);
} finally {
  await mf.dispose();
}
