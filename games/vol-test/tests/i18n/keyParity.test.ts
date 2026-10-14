import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import tr from '@/i18n/tr.json';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? keys(child as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function entries(value: object, prefix = ''): Array<[string, string]> {
  return Object.entries(value).flatMap(([key, child]): Array<[string, string]> =>
    typeof child === 'object' && child !== null
      ? entries(child as object, `${prefix}${key}.`)
      : [[`${prefix}${key}`, String(child)]],
  );
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1] ?? '').sort();

describe('i18n', () => {
  it('tr ve en aynı anahtar kümesini taşır', () => {
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });

  it('boş çeviri yok', () => {
    for (const [key, text] of [...entries(tr), ...entries(en)])
      expect(text.trim(), key).not.toBe('');
  });

  it('yer tutucular iki dilde aynıdır', () => {
    const english = new Map(entries(en));
    for (const [key, text] of entries(tr))
      expect(placeholders(english.get(key) ?? ''), key).toEqual(placeholders(text));
  });
});
