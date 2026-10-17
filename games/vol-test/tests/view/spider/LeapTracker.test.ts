import { describe, expect, it } from 'vitest';
import { GROUNDED, LeapTracker } from '@/view/spider/LeapTracker';

const STEP = 1000 / 60;

describe('LeapTracker', () => {
  it('yerdeyken sabit durumdur; geçersiz süreyi reddeder', () => {
    const tracker = new LeapTracker(500);
    expect(tracker.update(false, STEP)).toMatchObject(GROUNDED);
    expect(() => new LeapTracker(0)).toThrow(RangeError);
    expect(() => new LeapTracker(Number.NaN)).toThrow(RangeError);
  });

  it('kalkış ve iniş tek karede bayraklanır; yay tepesi uçuşun ortasındadır', () => {
    const tracker = new LeapTracker(480);
    const first = tracker.update(true, STEP);
    expect(first.takeoff).toBe(true);
    expect(first.airborne).toBe(true);
    expect(first.landed).toBe(false);
    let takeoffs = 0;
    let apex = 0;
    for (let frame = 0; frame < 20; frame++) {
      const state = tracker.update(true, STEP);
      if (state.takeoff) takeoffs++;
      apex = Math.max(apex, state.arc);
    }
    expect(takeoffs).toBe(0);
    expect(apex).toBeGreaterThan(0.99);
    const landed = tracker.update(false, STEP);
    expect(landed.landed).toBe(true);
    expect(landed.airborne).toBe(false);
    expect(landed.arc).toBe(0);
    expect(tracker.update(false, STEP).landed).toBe(false);
  });

  it('yay sıfırdan başlar, tepede 1 olur ve sürenin sonunda sıfıra döner', () => {
    const tracker = new LeapTracker(600);
    tracker.update(true, 0);
    expect(tracker.state.arc).toBe(0);
    tracker.update(true, 300);
    expect(tracker.state.arc).toBeCloseTo(1, 5);
    tracker.update(true, 300);
    expect(tracker.state.phase).toBe(1);
    expect(tracker.state.arc).toBeCloseTo(0, 5);
    // Süre aşılsa da ilerleme 1'de kalır (gecikmiş iniş).
    tracker.update(true, 900);
    expect(tracker.state.phase).toBe(1);
  });

  it('duraklatmada (süre 0) ilerleme donar ve negatif süre geriye saramaz', () => {
    const tracker = new LeapTracker(500);
    tracker.update(true, 100);
    const frozen = tracker.state.phase;
    for (let i = 0; i < 10; i++) tracker.update(true, 0);
    expect(tracker.state.phase).toBe(frozen);
    tracker.update(true, -50);
    expect(tracker.state.phase).toBe(frozen);
  });

  it('reset uçuşu iptal eder: bir sonraki kare yeni kalkıştır', () => {
    const tracker = new LeapTracker(500);
    tracker.update(true, 200);
    tracker.reset();
    expect(tracker.state).toMatchObject(GROUNDED);
    expect(tracker.update(true, STEP).takeoff).toBe(true);
    expect(tracker.state.sinceLaunchMs).toBe(0);
  });
});
