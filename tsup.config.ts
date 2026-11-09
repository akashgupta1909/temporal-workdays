import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  treeshake: true,
  // Lets JSR and Deno find the types of the ESM build (jsr.json publishes dist/index.js).
  banner: ({ format }) => (format === 'esm' ? { js: '/* @ts-self-types="./index.d.ts" */' } : {}),
});
