import { describe, expect, it } from 'vitest';
import { WEATHER } from '@/config/weather';
import { WeatherSchedule } from '@/sim/weather/WeatherSchedule';

describe('WeatherSchedule', () => {
  it('30–120 saniyelik olayları seed ve saatle tekrar üretir; okuma sırası sonucu değiştirmez', () => {
    const a = new WeatherSchedule(13);
    const b = new WeatherSchedule(13);
    for (let time = 0; time < 3600_000; time += 7919) {
      const event = a.eventAt(time);
      expect(event.endMs - event.startMs).toBeGreaterThanOrEqual(30_000);
      expect(event.endMs - event.startMs).toBeLessThanOrEqual(120_000);
      expect(event.startMs).toBeLessThanOrEqual(time);
      expect(event.endMs).toBeGreaterThan(time);
      b.frameAt(3600_000 - time);
      expect(a.frameAt(time)).toEqual(b.frameAt(time));
    }
  });

  it('hava geçişini yumuşatır ve override kaldırılınca sonraki geçişler de korunur', () => {
    const schedule = new WeatherSchedule(13, 'snow');
    const natural = new WeatherSchedule(13);
    schedule.setOverride(undefined, 0);
    for (let time = 120_000; time < 3600_000; time += 1000)
      expect(schedule.frameAt(time)).toEqual(natural.frameAt(time));
  });

  it('mevsim ağırlıkları yazın kar üretmez; kışın kar baskındır', () => {
    const schedule = new WeatherSchedule(7);
    let snow = 0;
    let winterEvents = 0;
    for (let time = 900_000; time < 1620_000; time = schedule.eventAt(time).endMs)
      expect(schedule.eventAt(time).kind).not.toBe('snow');
    for (let time = 2700_000; time < 3420_000; time = schedule.eventAt(time).endMs) {
      snow += Number(schedule.eventAt(time).kind === 'snow');
      winterEvents++;
    }
    expect(snow / winterEvents).toBeGreaterThan(0.4);
  });

  it('debug override yoğunluğu kademeli değiştirir', () => {
    const schedule = new WeatherSchedule(7, 'rain');
    schedule.setOverride('snow', 30_000);
    expect(schedule.frameAt(30_000).rain).toBe(1);
    const middle = schedule.frameAt(30_000 + WEATHER.transitionMs / 2);
    expect(middle.rain).toBeCloseTo(0.5);
    expect(middle.snow).toBeCloseTo(0.5);
    expect(schedule.frameAt(30_000 + WEATHER.transitionMs).snow).toBe(1);
    expect(() => schedule.eventAt(-1)).toThrow(RangeError);
  });

  it('override başlangıcı rüzgârda sıçrama yaratmaz', () => {
    const schedule = new WeatherSchedule(7, 'rain');
    const before = schedule.frameAt(30_000);
    schedule.setOverride('snow', 30_000);
    const after = schedule.frameAt(30_000);
    expect(after.windX).toBeCloseTo(before.windX, 10);
    expect(after.windY).toBeCloseTo(before.windY, 10);
  });

  it('override kaldırma doğal olay değişimiyle örtüşse de geçiş sonunda sıçramaz', () => {
    const natural = new WeatherSchedule(13);
    let boundary = natural.eventAt(0).endMs;
    while (natural.eventAt(boundary).kind === 'clear') boundary = natural.eventAt(boundary).endMs;
    const schedule = new WeatherSchedule(13, 'snow');
    const release = boundary - WEATHER.transitionMs / 2;
    schedule.setOverride(undefined, release);
    const end = release + WEATHER.transitionMs;
    const before = schedule.frameAt(end - 0.01);
    const after = schedule.frameAt(end);
    for (const field of ['dust', 'rain', 'snow', 'windX', 'windY', 'airDrag'] as const)
      expect(before[field]).toBeCloseTo(after[field], 3);
    expect(after).toEqual(natural.frameAt(end));
  });
});
