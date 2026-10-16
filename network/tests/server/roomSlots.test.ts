import { describe, expect, it } from 'vitest';
import { RoomSlots } from '../../src/server/roomSlots';

describe('RoomSlots', () => {
  it('sınırı aşmaz ve aynı yer iki kez bırakılamaz', () => {
    const slots = new RoomSlots(1);
    const release = slots.claim()!;
    expect(slots.claim()).toBeNull();
    release();
    release();
    expect(slots.claim()).not.toBeNull();
    expect(slots.claim()).toBeNull();
  });

  it('sınırsız veya geçersiz kapasiteyi reddeder', () => {
    for (const capacity of [0, -1, 1.5, NaN, Infinity])
      expect(() => new RoomSlots(capacity)).toThrow(RangeError);
  });
});
