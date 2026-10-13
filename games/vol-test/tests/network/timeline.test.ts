import { describe, expect, it } from 'vitest';
import { EventQueue, ServerTimeline } from '@/network/timeline';

const drain = (queue: EventQueue<string>, until: number): string[] => queue.release(until, []);

describe('EventQueue', () => {
  it('öğeleri zamanı gelince ve sırayla bırakır', () => {
    const queue = new EventQueue<string>();
    queue.push(10, 'a');
    queue.push(20, 'b');
    queue.push(30, 'c');
    expect(drain(queue, 5)).toEqual([]);
    expect(drain(queue, 20)).toEqual(['a', 'b']);
    expect(queue.size).toBe(1);
    expect(drain(queue, 100)).toEqual(['c']);
    expect(queue.size).toBe(0);
  });

  it('sırasız gelen öğeyi zamanına göre yerleştirir; eşit zamanlar geliş sırasını korur', () => {
    const queue = new EventQueue<string>();
    queue.push(30, 'c');
    queue.push(10, 'a');
    queue.push(20, 'b1');
    queue.push(20, 'b2');
    expect(drain(queue, 100)).toEqual(['a', 'b1', 'b2', 'c']);
  });

  it('kapasite aşılınca en eski öğeyi atar', () => {
    const queue = new EventQueue<string>(3);
    for (const [time, item] of [
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
    ] as const)
      queue.push(time, item);
    expect(queue.size).toBe(3);
    expect(drain(queue, 10)).toEqual(['b', 'c', 'd']);
  });

  it('uzun süre kullanımda bellek büyümez ve sıra bozulmaz', () => {
    const queue = new EventQueue<number>(16);
    const seen: number[] = [];
    for (let step = 0; step < 1000; step++) {
      queue.push(step, step);
      queue.release(step - 3, seen);
    }
    queue.release(10_000, seen);
    expect(seen).toEqual(Array.from({ length: 1000 }, (_, index) => index));
    expect(queue.size).toBe(0);
  });

  it('boşaltılır ve geçersiz girdiyi reddeder', () => {
    const queue = new EventQueue<string>();
    queue.push(1, 'a');
    queue.clear();
    expect(queue.size).toBe(0);
    expect(drain(queue, 10)).toEqual([]);
    expect(() => queue.push(Number.NaN, 'x')).toThrow(RangeError);
    expect(() => new EventQueue(0)).toThrow(RangeError);
    expect(() => new EventQueue(1.5)).toThrow(RangeError);
  });
});

describe('ServerTimeline', () => {
  it('ilk gözlemden önce bilinmez, sonra farkı ekler', () => {
    const timeline = new ServerTimeline();
    expect(timeline.known).toBe(false);
    expect(timeline.toServer(100)).toBeUndefined();
    timeline.observe(1000, 5000);
    expect(timeline.known).toBe(true);
    expect(timeline.toServer(1500)).toBe(5500);
  });

  it('farkı üstel ortalamayla izler', () => {
    const timeline = new ServerTimeline(0.5);
    timeline.observe(0, 1000);
    timeline.observe(100, 1120);
    // 1000 → 1020 arasının yarısı.
    expect(timeline.toServer(0)).toBe(1010);
  });

  it('geçersiz gözlemi yok sayar ve yumuşatmayı doğrular', () => {
    const timeline = new ServerTimeline();
    timeline.observe(Number.NaN, 5);
    timeline.observe(5, 0);
    timeline.observe(5, Number.POSITIVE_INFINITY);
    expect(timeline.known).toBe(false);
    expect(() => new ServerTimeline(0)).toThrow(RangeError);
    expect(() => new ServerTimeline(1.5)).toThrow(RangeError);
  });
});
