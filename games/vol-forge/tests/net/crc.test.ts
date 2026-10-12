import { expect, it } from 'vitest';
import { crc32 } from '../../src/net/bytes';

it('crc32 bilinen değeri verir ve bozulmayı fark eder', () => {
  const data = new TextEncoder().encode('123456789');
  expect(crc32(data)).toBe(0xcbf43926);
  data[3] ^= 1;
  expect(crc32(data)).not.toBe(0xcbf43926);
  expect(crc32(new Uint8Array(0))).toBe(0);
});
