import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../../src/server';

describe('TokenBucket', () => {
  it('birikimi harcar, sonra reddeder ve zamanla dolar', () => {
    const bucket = new TokenBucket(10, 3, 0);
    expect([bucket.take(0), bucket.take(0), bucket.take(0), bucket.take(0)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(bucket.take(50)).toBe(false);
    expect(bucket.take(100)).toBe(true);
  });

  it('reddedilen istek jeton harcamaz', () => {
    const bucket = new TokenBucket(10, 1, 0);
    expect(bucket.take(0)).toBe(true);
    for (let index = 0; index < 50; index++) expect(bucket.take(0)).toBe(false);
    expect(bucket.take(100)).toBe(true);
  });

  it('birikimi sınırın üstüne çıkarmaz ve geriye giden saati yok sayar', () => {
    const bucket = new TokenBucket(100, 2, 1000);
    expect(bucket.take(500)).toBe(true);
    expect(bucket.take(1000)).toBe(true);
    expect(bucket.take(1000)).toBe(false);
    expect(bucket.take(60000)).toBe(true);
    expect(bucket.take(60000)).toBe(true);
    expect(bucket.take(60000)).toBe(false);
  });

  it('geçersiz hız ve birikimi reddeder', () => {
    expect(() => new TokenBucket(0, 1, 0)).toThrow(RangeError);
    expect(() => new TokenBucket(1, 0.5, 0)).toThrow(RangeError);
  });
});
