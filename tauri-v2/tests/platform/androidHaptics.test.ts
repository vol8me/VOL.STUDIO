// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHapticsCapability,
  setHapticsDriver,
  setHapticsEnabled,
  vibrate,
} from '../../../core/src/platform/haptics';

vi.mock('@volstudio/core', () => import('../../../core/src/platform/haptics'));
const tauri = vi.hoisted(() => ({ isTauri: vi.fn(() => false), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => tauri);

import * as api from '../../src/platform/androidHaptics';

function probe(supported = true) {
  const calls: [string, Record<string, unknown>?][] = [];
  return {
    calls,
    platform: () => 'android' as const,
    events: new EventTarget(),
    invoke: (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return Promise.resolve(command.endsWith('status') ? { supported } : undefined);
    },
  };
}

afterEach(() => {
  setHapticsEnabled(false);
  setHapticsDriver(null);
  tauri.isTauri.mockReturnValue(false);
  vi.restoreAllMocks();
});

describe('Android native titreşim', () => {
  it('Android sürücü yüzeyi vardır', () => {
    expect(typeof api.observeAndroidHaptics).toBe('function');
  });
  it('CORE niyeti WebView API yerine native waveform komutuna gider', async () => {
    const p = probe();
    const dispose = api.observeAndroidHaptics(p);
    await vi.waitFor(() => expect(getHapticsCapability().backend).toBe('native'));
    setHapticsEnabled(true);
    vibrate('warning', 0.5);
    expect(p.calls.at(-1)).toEqual([
      'plugin:vol-haptics|play',
      { timings: [26, 60, 26], amplitudes: [64, 0, 64] },
    ]);
    dispose();
    expect(getHapticsCapability().backend).not.toBe('native');
    expect(p.calls.at(-1)?.[0]).toBe('plugin:vol-haptics|cancel');
  });
  it('Web ve masaüstünde Android eklentisini çağırmaz', () => {
    for (const platform of ['web', 'desktop'] as const) {
      const p = probe();
      api.observeAndroidHaptics({ ...p, platform: () => platform })();
      expect(p.calls).toEqual([]);
    }
  });
  it('motor yoksa native yetenek kaydetmez', async () => {
    const p = probe(false);
    const dispose = api.observeAndroidHaptics(p);
    await Promise.resolve();
    expect(getHapticsCapability().backend).not.toBe('native');
    dispose();
  });
  it('bekleyen sorgu kapatılmış aboneliği diriltmez', async () => {
    let resolve!: (value: unknown) => void;
    const p = probe();
    const dispose = api.observeAndroidHaptics({
      ...p,
      invoke: () => new Promise((done) => (resolve = done)),
    });
    dispose();
    resolve({ supported: true });
    await Promise.resolve();
    expect(getHapticsCapability().backend).not.toBe('native');
  });
  it('sorgu hatası oyun akışını kesmez', async () => {
    const dispose = api.observeAndroidHaptics({
      ...probe(),
      invoke: () => Promise.reject(new Error('izin yok')),
    });
    await Promise.resolve();
    expect(getHapticsCapability().backend).not.toBe('native');
    dispose();
  });
  it('arka plana geçiş titreşimi keser ve abonelik dinleyicileri kaldırır', async () => {
    const p = probe();
    const dispose = api.observeAndroidHaptics(p);
    await vi.waitFor(() => expect(getHapticsCapability().backend).toBe('native'));
    p.events.dispatchEvent(new Event('pagehide'));
    expect(p.calls.at(-1)?.[0]).toBe('plugin:vol-haptics|cancel');
    dispose();
    const count = p.calls.length;
    p.events.dispatchEvent(new Event('blur'));
    expect(p.calls).toHaveLength(count);
  });
  it('sıfır şiddet native motora darbe göndermez', async () => {
    const p = probe();
    await api.createAndroidHapticsDriver(p).play('tap', 0);
    expect(p.calls).toEqual([]);
  });
});

describe('Android sürücü varsayılanları', () => {
  it('varsayılan native köprü desen ve iptal komutunu iletir', async () => {
    const { invoke } = await import('@tauri-apps/api/core');
    const driver = api.createAndroidHapticsDriver();
    await driver.play('tap');
    expect(invoke).toHaveBeenCalledWith('plugin:vol-haptics|play', {
      timings: [12],
      amplitudes: [64],
    });
    await driver.cancel?.();
    expect(invoke).toHaveBeenCalledWith('plugin:vol-haptics|cancel', undefined);
    api.observeAndroidHaptics()();
  });
  it('iptal komutu hatası kapanışı kırmaz', async () => {
    const p = probe();
    const dispose = api.observeAndroidHaptics({
      ...p,
      invoke: async (command, args) => {
        if (command.endsWith('cancel')) throw new Error('kapandı');
        return p.invoke(command, args);
      },
    });
    await vi.waitFor(() => expect(getHapticsCapability().backend).toBe('native'));
    dispose();
    dispose();
    await Promise.resolve();
    expect(getHapticsCapability().backend).not.toBe('native');
  });
  it('görünür belge titreşimi kesmez, gizli belge keser', async () => {
    const p = probe();
    let visible = true;
    const dispose = api.observeAndroidHaptics({ ...p, visible: () => visible });
    await vi.waitFor(() => expect(getHapticsCapability().backend).toBe('native'));
    const count = p.calls.length;
    p.events.dispatchEvent(new Event('visibilitychange'));
    expect(p.calls).toHaveLength(count);
    visible = false;
    p.events.dispatchEvent(new Event('visibilitychange'));
    expect(p.calls.at(-1)?.[0]).toBe('plugin:vol-haptics|cancel');
    dispose();
  });
});

it('varsayılan Android kabuğu gizli belgeyi native iptale bağlar', async () => {
  tauri.isTauri.mockReturnValue(true);
  tauri.invoke.mockResolvedValue({ supported: true });
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
  const dispose = api.observeAndroidHaptics();
  await vi.waitFor(() => expect(getHapticsCapability().backend).toBe('native'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  window.dispatchEvent(new Event('visibilitychange'));
  expect(tauri.invoke).toHaveBeenLastCalledWith('plugin:vol-haptics|cancel', undefined);
  dispose();
});
