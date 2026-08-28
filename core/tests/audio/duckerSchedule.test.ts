import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SidechainDucker } from '../../src/audio/sidechain';
import { FakeAudioContext } from './music/mock-audio';

/**
 * Duck/release, AudioContext saatine (currentTime) göre zamanlanır.
 */
describe('SidechainDucker — zamanlama tek saatte', () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    context = new FakeAudioContext();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeDucker(): SidechainDucker {
    return new SidechainDucker(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
  }

  function gainOf(ducker: SidechainDucker): { value: number; advanceTo(t: number): void } {
    return (ducker.gain as unknown as { gain: { value: number; advanceTo(t: number): void } }).gain;
  }

  it('release setTimeout ile değil, audio saatiyle zamanlanır', () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const ducker = makeDucker();

    ducker.duck({ target: 0.2, attack: 0.02, hold: 0.1, release: 0.2 });

    expect(timeoutSpy).not.toHaveBeenCalled();
    timeoutSpy.mockRestore();
  });

  it('duck anında kısar, hold bitince audio saatinde geri açılır', () => {
    const ducker = makeDucker();
    const gain = gainOf(ducker);

    ducker.duck({ target: 0.2, attack: 0.02, hold: 0.1, release: 0.2 });
    expect(gain.value).toBe(0.2);

    // hold henüz bitmedi
    gain.advanceTo(0.05);
    expect(gain.value).toBe(0.2);

    // attack + hold = 0.12 s sonra release başlar
    gain.advanceTo(0.2);
    expect(gain.value).toBe(1);
  });

  it('sekme donarsa (currentTime ilerlemezse) ducking de donar', () => {
    const ducker = makeDucker();
    const gain = gainOf(ducker);

    ducker.duck({ target: 0.3, attack: 0.02, hold: 0.5, release: 0.3 });
    expect(gain.value).toBe(0.3);

    // Duvar saati ilerledi ama audio saati durdu — gain değişmemeli.
    vi.advanceTimersByTime(5000);
    expect(gain.value).toBe(0.3);
  });

  it('üst üste ducklerde en güçlü (en düşük) hedef uygulanır', () => {
    const ducker = makeDucker();
    const gain = gainOf(ducker);

    ducker.duck({ target: 0.5, attack: 0.01, hold: 0.1, release: 0.2 });
    ducker.duck({ target: 0.2, attack: 0.01, hold: 0.1, release: 0.2 });

    expect(gain.value).toBe(0.2);
  });

  it("kısa bir duck, uzun bir duck'ın hold aşamasına binince release'i silmez", () => {
    const ducker = makeDucker();
    const gain = gainOf(ducker);

    // Duck A: attack=0.01, hold=2, release=1 → releaseStart=2.01, end=3.01
    ducker.duck({ target: 0.2, attack: 0.01, hold: 2, release: 1 });
    expect(gain.value).toBe(0.2);

    // Duck A'nın hold aşamasının ortasında (releaseStart'tan ÖNCE) daha KISA
    // bir duck B gelir: end2=0.71, duck A'nın end'inden (3.01) KISA — eski
    // `if (end > activeUntil)` şartı burada SAĞLANMAZ.
    context.currentTime = 0.5;
    ducker.duck({ target: 0.2, attack: 0.01, hold: 0.1, release: 0.1 });
    expect(gain.value).toBe(0.2);

    // `cancelScheduledValues` her duck() çağrısında ÖNCEKİ release'i (varsa)
    // her zaman iptal eder. Eskiden bu 2. çağrı `end2 < activeUntil` olduğu
    // için release'i YENİDEN PLANLAMIYORDU — duck A'nın release'i cancel
    // edilmiş ama yerine hiçbiri konmamış olurdu, gain sonsuza dek 0.2'de
    // TAKILI kalırdı. Duck A'nın gerçek release'i (2.01) hâlâ ayakta olmalı.
    gain.advanceTo(1); // duck B'nin kendi release'i geçti ama duck A'nınki değil
    expect(gain.value).toBe(0.2);

    gain.advanceTo(3.5); // duck A'nın release'inden (2.01) sonra
    expect(gain.value).toBe(1);
  });
});
