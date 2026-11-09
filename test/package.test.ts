import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')) as Record<string, unknown>;

describe('package metadata', () => {
  it('jsr.json and package.json agree on the version', () => {
    expect(read('jsr.json')['version']).toBe(read('package.json')['version']);
  });

  it('the CHANGELOG has a section for the current version', () => {
    const version = String(read('package.json')['version']);
    expect(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')).toMatch(
      new RegExp(`^## ${version.replace(/\./g, '\\.')}`, 'm'),
    );
  });
});
