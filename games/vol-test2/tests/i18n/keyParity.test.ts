import { expect, test } from 'vitest';
import en from '../../src/i18n/en.json';
import tr from '../../src/i18n/tr.json';

function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

test('iki dil aynı anahtarları taşır', () => {
  expect(leaves(en).sort()).toEqual(leaves(tr).sort());
});

test('hiçbir çeviri boş değildir', () => {
  const empty = (resource: unknown): string[] =>
    leaves(resource).filter((path) => {
      const value = path.split('.').reduce<unknown>((node, key) => (node as never)[key], resource);
      return typeof value !== 'string' || value.trim() === '';
    });
  expect(empty(en)).toEqual([]);
  expect(empty(tr)).toEqual([]);
});

test('yer tutucular iki dilde aynıdır', () => {
  const placeholders = (text: string): string[] =>
    [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  for (const path of leaves(en)) {
    const get = (resource: unknown) =>
      path.split('.').reduce<unknown>((node, key) => (node as never)[key], resource) as string;
    expect(placeholders(get(tr)).sort(), path).toEqual(placeholders(get(en)).sort());
  }
});
