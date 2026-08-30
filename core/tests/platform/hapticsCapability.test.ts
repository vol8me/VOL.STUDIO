import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelHaptics,
  getHapticsCapability,
  isHapticsSupported,
  observeHapticsCapability,
  setHapticsEnabled,
  vibrate,
} from '../../src/platform/haptics';

/**
 * Titreşim yeteneği — "ayar sunulmalı mı" sorusunun tek doğru kaynağı.
 *
 * Masaüstünde `navigator.vibrate` yoktur ve klavye/fare titremez: ayarın
 * etkin sunulması oyuncuya hiçbir şey yapmayan bir kutu göstermek demekti.
 */
function setVibrationApi(fn: ((pattern: number | number[]) => boolean) | undefined): void {
  Object.defineProperty(navigator, 'vibrate', { value: fn, configurable: true });
}

function setGamepads(pads: unknown[]): void {
  Object.defineProperty(navigator, 'getGamepads', {
    value: () => pads,
    configurable: true,
  });
}

function makeRumblePad(overrides: Record<string, unknown> = {}) {
  const playEffect = vi.fn().mockResolvedValue('complete');
  const reset = vi.fn().mockResolvedValue('complete');
  return {
    pad: { connected: true, vibrationActuator: { playEffect, reset }, ...overrides },
    playEffect,
    reset,
  };
}

beforeEach(() => {
  setVibrationApi(undefined);
  setGamepads([]);
  setHapticsEnabled(false);
});

afterEach(() => {
  setHapticsEnabled(false);
  vi.restoreAllMocks();
});

describe('titreşim yeteneği', () => {
  it('hiçbir kaynak yoksa DESTEKLENMİYOR der', () => {
    expect(getHapticsCapability()).toEqual({ supported: false, backend: 'none' });
    expect(isHapticsSupported()).toBe(false);
  });

  it('Vibration API varsa onu kullanır', () => {
    setVibrationApi(() => true);
    expect(getHapticsCapability()).toEqual({ supported: true, backend: 'vibration' });
  });

  it('Vibration API yoksa rumble motoru olan oyun kolunu bulur', () => {
    setGamepads([makeRumblePad().pad]);
    expect(getHapticsCapability()).toEqual({ supported: true, backend: 'gamepad' });
  });

  it('bağlı olmayan ya da motoru olmayan kol sayılmaz', () => {
    setGamepads([
      null,
      { connected: false, vibrationActuator: { playEffect: () => Promise.resolve() } },
      { connected: true, vibrationActuator: null },
    ]);
    expect(getHapticsCapability().supported).toBe(false);
  });

  it('getGamepads fırlatırsa sessizce desteksiz sayılır', () => {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => {
        throw new Error('izin reddedildi');
      },
      configurable: true,
    });
    expect(() => getHapticsCapability()).not.toThrow();
    expect(getHapticsCapability().supported).toBe(false);
  });

  it('kol takılınca yetenek CANLI bildirilir', () => {
    const listener = vi.fn();
    const stop = observeHapticsCapability(listener);
    expect(listener).toHaveBeenCalledWith({ supported: false, backend: 'none' });

    setGamepads([makeRumblePad().pad]);
    window.dispatchEvent(new Event('gamepadconnected'));

    expect(listener).toHaveBeenCalledWith({ supported: true, backend: 'gamepad' });
    stop();
  });

  it('aynı yetenek tekrar bildirilmez', () => {
    const listener = vi.fn();
    const stop = observeHapticsCapability(listener);
    listener.mockClear();

    window.dispatchEvent(new Event('gamepadconnected'));
    window.dispatchEvent(new Event('gamepadconnected'));

    expect(listener).not.toHaveBeenCalled();
    stop();
  });

  it('abonelik kaldırılınca olay dinleyicileri de sökülür', () => {
    const listener = vi.fn();
    const stop = observeHapticsCapability(listener);
    stop();
    listener.mockClear();

    setGamepads([makeRumblePad().pad]);
    window.dispatchEvent(new Event('gamepadconnected'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('kol kopunca yetenek geri düşer', () => {
    setGamepads([makeRumblePad().pad]);
    const listener = vi.fn();
    const stop = observeHapticsCapability(listener);
    listener.mockClear();

    setGamepads([]);
    window.dispatchEvent(new Event('gamepaddisconnected'));

    expect(listener).toHaveBeenCalledWith({ supported: false, backend: 'none' });
    stop();
  });

  it('oyun kolu yolunda desen SÜRE + ŞİDDET olarak çalınır', () => {
    const { pad, playEffect } = makeRumblePad();
    setGamepads([pad]);
    setHapticsEnabled(true);

    vibrate('error');

    expect(playEffect).toHaveBeenCalledOnce();
    const [type, params] = playEffect.mock.calls[0] as [string, Record<string, number>];
    expect(type).toBe('dual-rumble');
    // error deseni [40, 50, 40] → toplam 130 ms.
    expect(params.duration).toBe(130);
    expect(params.strongMagnitude).toBeGreaterThan(0);
    expect(params.weakMagnitude).toBeGreaterThan(0);
  });

  it('kapalıyken oyun kolu da titremez', () => {
    const { pad, playEffect } = makeRumblePad();
    setGamepads([pad]);
    setHapticsEnabled(false);

    vibrate('tap');

    expect(playEffect).not.toHaveBeenCalled();
  });

  it('desteklenmeyen ortamda çağrı sessizce düşer', () => {
    setHapticsEnabled(true);
    expect(() => vibrate('tap')).not.toThrow();
    expect(() => cancelHaptics()).not.toThrow();
  });

  it('iptal hem Vibration API hem kol motorunu susturur', () => {
    const vibrateApi = vi.fn(() => true);
    setVibrationApi(vibrateApi);
    const { pad, reset } = makeRumblePad();
    setGamepads([pad]);

    cancelHaptics();

    expect(vibrateApi).toHaveBeenCalledWith(0);
    expect(reset).toHaveBeenCalled();
  });

  it('reddedilen efekt akışı kesmez', () => {
    const pad = {
      connected: true,
      vibrationActuator: { playEffect: vi.fn().mockRejectedValue(new Error('desteklenmiyor')) },
    };
    setGamepads([pad]);
    setHapticsEnabled(true);

    expect(() => vibrate('select')).not.toThrow();
  });
});
