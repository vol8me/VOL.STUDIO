import { expect, test } from 'vitest';
import en from '../../src/i18n/en.json';
import tr from '../../src/i18n/tr.json';
test('iki dil aynı anahtarları taşır', () => {
  expect(Object.keys(en.app).sort()).toEqual(Object.keys(tr.app).sort());
});
