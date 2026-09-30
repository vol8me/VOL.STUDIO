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

function values(value: object): string[] {
  return Object.values(value).flatMap((child) =>
    typeof child === 'object' && child !== null ? values(child as object) : [String(child)],
  );
}

const placeholders = (text: string): string[] =>
  [...text.matchAll(/{{(\w+)}}/g)].map((match) => match[1] ?? '').sort();

describe('i18n', () => {
  it('tr ve en aynı anahtar kümesini taşır', () => {
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });

  it('boş çeviri yok, yer tutucular iki dilde aynı', () => {
    for (const text of [...values(tr), ...values(en)]) expect(text.trim()).not.toBe('');
    expect(placeholders(en.hud.telemetry)).toEqual(placeholders(tr.hud.telemetry));
  });
});
