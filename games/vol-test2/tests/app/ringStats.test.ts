import { describe, expect, it } from 'vitest';
import { RingStats } from '../../src/app/ringStats';

describe('RingStats', () => {
  it('boşken sıfır verir', () => {
    const stats = new RingStats(4);
    expect(stats.count).toBe(0);
    expect(stats.mean()).toBe(0);
    expect(stats.percentile(0.99)).toBe(0);
  });

  it('ortalama ve yüzdelik hesaplar', () => {
    const stats = new RingStats(100);
    for (let value = 1; value <= 100; value++) stats.push(value);
    expect(stats.count).toBe(100);
    expect(stats.mean()).toBe(50.5);
    expect(stats.percentile(0.5)).toBe(50);
    expect(stats.percentile(0.99)).toBe(99);
    expect(stats.percentile(1)).toBe(100);
    expect(stats.percentile(0)).toBe(1);
  });

  it('dolunca en eskiyi atar', () => {
    const stats = new RingStats(3);
    for (const value of [10, 20, 30, 40, 50]) stats.push(value);
    expect(stats.count).toBe(3);
    expect(stats.mean()).toBe(40);
    expect(stats.percentile(0)).toBe(30);
  });

  it('kısmi dolulukta yalnız yazılanı sayar', () => {
    const stats = new RingStats(8);
    stats.push(2);
    stats.push(4);
    expect(stats.mean()).toBe(3);
    expect(stats.percentile(1)).toBe(4);
  });

  it('clear sayacı sıfırlar', () => {
    const stats = new RingStats(2);
    stats.push(5);
    stats.clear();
    expect(stats.count).toBe(0);
    stats.push(7);
    expect(stats.mean()).toBe(7);
  });

  it('geçersiz kapasiteyi reddeder', () => {
    expect(() => new RingStats(0)).toThrow(RangeError);
    expect(() => new RingStats(1.5)).toThrow(RangeError);
  });
});
