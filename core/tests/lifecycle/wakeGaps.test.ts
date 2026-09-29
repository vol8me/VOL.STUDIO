import { describe, expect, it, vi } from 'vitest';
import { observeWakeGaps, resumeAudioAfterWake } from '../../src/lifecycle/wakeGaps';

/** Elle ilerletilen saat + kuyruk: setInterval kaydı tutulur, tick elle çalıştırılır. */
function fakeClock() {
  let wall = 1_000_000;
  let handler: (() => void) | undefined;
  const setIntervalFn = ((fn: () => void) => {
    handler = fn;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  const cleared: unknown[] = [];
  const clearIntervalFn = ((id: unknown) => cleared.push(id)) as typeof clearInterval;
  return {
    advance(ms: number) {
      wall += ms;
    },
    tick() {
      handler?.();
    },
    now: () => wall,
    setIntervalFn,
    clearIntervalFn,
    cleared,
  };
}

describe('observeWakeGaps', () => {
  it('timer donması uyku sayılır ve uyanma bildirilir', () => {
    const clock = fakeClock();
    const onWake = vi.fn();
    observeWakeGaps({
      heartbeatMs: 1000,
      gapThresholdMs: 1500,
      onWake,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });

    // Normal tik: 1 sn geçti, uyku yok.
    clock.advance(1000);
    clock.tick();
    expect(onWake).not.toHaveBeenCalled();

    // Uyku: duvar saati 65 sn ilerlemiş, timer yeni koşuyor.
    clock.advance(65_000);
    clock.tick();
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(onWake.mock.calls[0][0]).toBeGreaterThanOrEqual(65_000);
  });

  it('eşik altındaki gecikme uyku sayılmaz', () => {
    const clock = fakeClock();
    const onWake = vi.fn();
    observeWakeGaps({
      heartbeatMs: 1000,
      gapThresholdMs: 5000,
      onWake,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });
    clock.advance(4000); // 3 sn gecikme — yavaş kare, uyku değil
    clock.tick();
    expect(onWake).not.toHaveBeenCalled();
  });

  it('duraklatma çağrısı timer kaydını siler', () => {
    const clock = fakeClock();
    const stop = observeWakeGaps({
      onWake: vi.fn(),
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
    });
    stop();
    expect(clock.cleared).toHaveLength(1);
  });
});

describe('resumeAudioAfterWake', () => {
  const context = (state: string) => ({ state, resume: vi.fn(() => Promise.resolve()) });

  it('askıda ya da kesilmiş bağlamı yeniden başlatır', async () => {
    for (const state of ['suspended', 'interrupted']) {
      const ctx = context(state);
      await expect(resumeAudioAfterWake(ctx)).resolves.toBe(true);
      expect(ctx.resume).toHaveBeenCalledTimes(1);
    }
  });

  it('çalan ya da kapalı bağlama dokunmaz', async () => {
    for (const state of ['running', 'closed']) {
      const ctx = context(state);
      await expect(resumeAudioAfterWake(ctx)).resolves.toBe(false);
      expect(ctx.resume).not.toHaveBeenCalled();
    }
  });
});
