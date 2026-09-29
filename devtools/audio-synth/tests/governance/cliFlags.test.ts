import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOOLEAN_FLAGS, VALUE_FLAGS, parse } from '../../scripts/lib/args';

const SCRIPTS = resolve(import.meta.dirname, '../../scripts');

/** `audio:job` komutlarının koddan okuduğu bayrak adları. */
function readFlags(): Set<string> {
  const files = [
    join(SCRIPTS, 'audio-job.ts'),
    ...readdirSync(join(SCRIPTS, 'lib')).map((name) => join(SCRIPTS, 'lib', name)),
  ];
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/flags(?:\.(?:has|get)\(|, )'([a-z0-9-]+)'/g))
      names.add(match[1]);
    for (const match of text.matchAll(/(?:terms|positiveCount\(parsed,)\s*\(?'([a-z0-9-]+)'/g))
      names.add(match[1]);
  }
  return names;
}

describe('audio:job bayrakları', () => {
  it('okunan her bayrak bilinir, bilinen listede okunmayan bayrak kalmaz', () => {
    const known = new Set([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);
    const used = readFlags();
    expect([...used].filter((name) => !known.has(name))).toEqual([]);
    expect([...known].filter((name) => !used.has(name))).toEqual([]);
  });

  it('yazım hatalı bayrak sessizce yok sayılmaz', () => {
    expect(() => parse(['publish', 'job-1', '--drfat'])).toThrow('bilinmeyen bayrak --drfat');
    expect(parse(['publish', 'job-1', '--draft']).flags.get('draft')).toBe(true);
  });
});
