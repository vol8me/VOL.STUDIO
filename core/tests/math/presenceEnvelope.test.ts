import { describe, expect, it } from 'vitest';
import { PresenceEnvelope } from '../../src/math/PresenceEnvelope';

describe('PresenceEnvelope', () => {
  it('farklı açılma ve sönme süreleriyle uçlara ulaşır', () => {
    const envelope = new PresenceEnvelope(100, 400);
    expect(envelope.value).toBe(0);
    expect(envelope.update(true, 50)).toBe(0.5);
    expect(envelope.update(true, 50)).toBe(1);
    expect(envelope.update(false, 200)).toBe(0.5);
    expect(envelope.update(false, 200)).toBe(0);
  });

  it('yarıda tersine dönme sıçramadan mevcut düzeyden sürer', () => {
    const envelope = new PresenceEnvelope(100, 400);
    envelope.update(true, 50);
    expect(envelope.update(false, 100)).toBe(0.15625);
    expect(envelope.update(true, 25)).toBe(0.5);
    envelope.reset();
    expect(envelope.value).toBe(0);
  });

  it('kare bölünmesi aynı toplam sürede aynı sonucu verir', () => {
    const once = new PresenceEnvelope(1000, 2000);
    const frames = new PresenceEnvelope(1000, 2000);
    once.update(true, 500);
    for (let index = 0; index < 50; index++) frames.update(true, 10);
    expect(frames.value).toBeCloseTo(once.value, 12);
    once.update(false, 250);
    for (let index = 0; index < 25; index++) frames.update(false, 10);
    expect(frames.value).toBeCloseTo(once.value, 12);
  });

  it('uzun kareler aralık dışına çıkmaz', () => {
    const envelope = new PresenceEnvelope(100, 400);
    expect(envelope.update(true, Number.MAX_VALUE)).toBe(1);
    expect(envelope.update(false, Number.MAX_VALUE)).toBe(0);
  });

  it.each([Number.NaN, Infinity, -Infinity, -1, 0])(
    'bozuk veya ilerlemeyen delta %s önceki değeri korur',
    (delta) => {
      const envelope = new PresenceEnvelope(100, 400);
      envelope.update(true, 50);
      expect(envelope.update(true, delta)).toBe(0.5);
      expect(envelope.update(false, delta)).toBe(0.5);
    },
  );

  it.each([Number.NaN, Infinity, -Infinity, 0, -1])(
    'geçersiz süre %s her iki yönde reddedilir',
    (duration) => {
      expect(() => new PresenceEnvelope(duration, 100)).toThrow(RangeError);
      expect(() => new PresenceEnvelope(100, duration)).toThrow(RangeError);
    },
  );
});
