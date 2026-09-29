import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLinuxHapticsDriver,
  getLinuxHapticsStatus,
  observeLinuxHaptics,
  registerLinuxHaptics,
} from '../../src/platform/linuxHaptics';

/*
 * '@volstudio/core' kök barrel'ı Phaser köprülerini çeker; bu test
 * sürücü↔komut tercümesini sınadığı için desen tablosu değil kablolama
 * doğrulanır — gerçek tablo core'un kendi testinde kanıtlıdır.
 */
const fakes = vi.hoisted(() => ({
  setHapticsDriver: vi.fn(),
  planRumblePulses: vi.fn(() => [
    { strong: 0.85, weak: 0.6, durationMs: 40, gapAfterMs: 50 },
    { strong: 0.85, weak: 0.6, durationMs: 40, gapAfterMs: 0 },
  ]),
}));

const tauri = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn((): Promise<unknown> => Promise.resolve({ backend: 'none' })),
}));

vi.mock('@volstudio/core', () => fakes);
vi.mock('@tauri-apps/api/core', () => tauri);

beforeEach(() => {
  vi.clearAllMocks();
  tauri.invoke.mockReset();
  tauri.invoke.mockResolvedValue({ backend: 'none' });
  tauri.isTauri.mockReturnValue(true);
});
afterEach(() => vi.useRealTimers());

function probe(status: unknown, record?: { calls: [string, unknown?][] }) {
  return {
    isTauri: () => true,
    invoke: vi.fn((command: string, args?: Record<string, unknown>): Promise<unknown> => {
      record?.calls.push([command, args]);
      return Promise.resolve(command === 'vol_haptics_status' ? status : undefined);
    }),
    sleep: vi.fn((): Promise<void> => Promise.resolve()),
  };
}

describe('getLinuxHapticsStatus', () => {
  it('Tauri dışında none döner', async () => {
    const p = { ...probe({ backend: 'evdev' }), isTauri: () => false };
    expect(await getLinuxHapticsStatus(p)).toEqual({ backend: 'none' });
  });

  it('evdev aygıtını ve adını bildirir', async () => {
    const status = await getLinuxHapticsStatus(
      probe({ backend: 'evdev', device: 'Microsoft X-Box 360 pad 0' }),
    );
    expect(status).toEqual({ backend: 'evdev', device: 'Microsoft X-Box 360 pad 0' });
  });

  it('komut hatası none verir — sürücü kırılgan olmaz', async () => {
    const failing = {
      isTauri: () => true,
      invoke: vi.fn((): Promise<unknown> => Promise.reject(new Error('yok'))),
      sleep: vi.fn((): Promise<void> => Promise.resolve()),
    };
    expect(await getLinuxHapticsStatus(failing)).toEqual({ backend: 'none' });
  });
});

describe('createLinuxHapticsDriver', () => {
  it('deseni darbe dizisine çevirir ve aralıkları uyur', async () => {
    const record = { calls: [] as [string, unknown?][] };
    const p = probe({ backend: 'evdev' }, record);
    const driver = createLinuxHapticsDriver(p);
    await driver.play('error');
    const rumbles = record.calls.filter(([c]) => c === 'vol_haptics_rumble');
    expect(rumbles).toHaveLength(2);
    expect(rumbles[0][1]).toEqual({ strong: 0.85, weak: 0.6, durationMs: 40 });
    expect(p.sleep).toHaveBeenCalledWith(50);
  });

  it('cancel durdurma komutunu gönderir', async () => {
    const record = { calls: [] as [string, unknown?][] };
    const driver = createLinuxHapticsDriver(probe({ backend: 'evdev' }, record));
    await driver.cancel?.();
    expect(record.calls).toEqual([['vol_haptics_stop', undefined]]);
  });

  it('aralikta iptal edilen desen ikinci darbeyi baslatmaz', async () => {
    const record = { calls: [] as [string, unknown?][] };
    const p = probe({ backend: 'hidraw' }, record);
    let finishGap!: () => void;
    p.sleep.mockImplementation(() => new Promise<void>((resolve) => (finishGap = resolve)));
    const driver = createLinuxHapticsDriver(p);
    const playing = driver.play('error');
    await Promise.resolve();
    await driver.cancel?.();
    finishGap();
    await playing;
    expect(record.calls.filter(([command]) => command === 'vol_haptics_rumble')).toHaveLength(1);
  });

  it('yeni desen eski desenin kalan darbelerini gecersiz kilar', async () => {
    const record = { calls: [] as [string, unknown?][] };
    const p = probe({ backend: 'hidraw' }, record);
    let finishGap!: () => void;
    p.sleep.mockImplementationOnce(() => new Promise<void>((resolve) => (finishGap = resolve)));
    const driver = createLinuxHapticsDriver(p);
    const old = driver.play('error');
    await Promise.resolve();
    await driver.play('warning');
    finishGap();
    await old;
    expect(record.calls.filter(([command]) => command === 'vol_haptics_rumble')).toHaveLength(3);
  });
});

describe('observeLinuxHaptics', () => {
  it('acilista olmayan aygit sonradan kaydedilir ve cikarma kaydi kaldirir', async () => {
    vi.useFakeTimers();
    let backend = 'none';
    const p = { ...probe(null), invoke: vi.fn(() => Promise.resolve({ backend })) };
    const dispose = observeLinuxHaptics(p);
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fakes.setHapticsDriver).not.toHaveBeenCalled();
      backend = 'hidraw';
      await vi.advanceTimersByTimeAsync(1000);
      const driver = fakes.setHapticsDriver.mock.calls.at(-1)?.[0] as { play?: unknown };
      expect(typeof driver.play).toBe('function');
      backend = 'none';
      await vi.advanceTimersByTimeAsync(1000);
      expect(fakes.setHapticsDriver).toHaveBeenLastCalledWith(null);
    } finally {
      dispose();
    }
    const calls = p.invoke.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.invoke.mock.calls.length).toBe(calls);
  });

  it('aygit yokken tarama araligi geri cekilir; kol olayi hemen yeniden sorar', async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    const p = { ...probe({ backend: 'none' }), events };
    const dispose = observeLinuxHaptics(p);
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      const polls = p.invoke.mock.calls.length;
      expect(polls).toBeLessThanOrEqual(8);
      events.dispatchEvent(new Event('gamepadconnected'));
      await vi.advanceTimersByTimeAsync(0);
      expect(p.invoke.mock.calls.length).toBe(polls + 1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(p.invoke.mock.calls.length).toBe(polls + 2);
    } finally {
      dispose();
    }
  });

  it('gec durum cevabi destroy sonrasinda surucu kaydetmez', async () => {
    let reply!: (value: unknown) => void;
    const p = { ...probe(null), invoke: vi.fn(() => new Promise((resolve) => (reply = resolve))) };
    const dispose = observeLinuxHaptics(p);
    dispose();
    reply({ backend: 'hidraw' });
    await Promise.resolve();
    await Promise.resolve();
    expect(fakes.setHapticsDriver).not.toHaveBeenCalled();
  });

  it('uykudan donus olayinda hemen yeniler, destroy dinleyiciyi kaldirir', async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    let visible = false;
    const p = { ...probe({ backend: 'hidraw' }), events, visible: () => visible };
    const dispose = observeLinuxHaptics(p);
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.invoke).not.toHaveBeenCalled();
    visible = true;
    events.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fakes.setHapticsDriver).toHaveBeenCalledTimes(1);
    dispose();
    const commands = p.invoke.mock.calls.length;
    events.dispatchEvent(new Event('gamepadconnected'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(p.invoke.mock.calls.length).toBe(commands);
  });

  it('Linux disindaki native kabugu yoklamayi surdurmez', async () => {
    vi.useFakeTimers();
    const p = probe({ backend: 'none', platformSupported: false });
    const dispose = observeLinuxHaptics(p);
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(p.invoke).toHaveBeenCalledTimes(1);
      expect(fakes.setHapticsDriver).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it('pencere odagi kaybolunca kalan darbeyi iptal eder', async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    const record = { calls: [] as [string, unknown?][] };
    const p = { ...probe({ backend: 'hidraw' }, record), events };
    let finishGap!: () => void;
    p.sleep.mockImplementation(() => new Promise<void>((resolve) => (finishGap = resolve)));
    const dispose = observeLinuxHaptics(p);
    try {
      await vi.advanceTimersByTimeAsync(0);
      const driver = fakes.setHapticsDriver.mock.calls.at(-1)?.[0] as {
        play(pattern: 'error'): Promise<void>;
      };
      const playing = driver.play('error');
      await Promise.resolve();
      events.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(0);
      finishGap();
      await playing;
      expect(record.calls.filter(([command]) => command === 'vol_haptics_rumble')).toHaveLength(1);
    } finally {
      dispose();
    }
  });
});

describe('varsayılan prob', () => {
  it('native komutları kendi yüklemleriyle çağırır', async () => {
    tauri.invoke.mockResolvedValue({ backend: 'hidraw' });
    expect(await getLinuxHapticsStatus()).toEqual({ backend: 'hidraw' });

    const driver = createLinuxHapticsDriver();
    await driver.play('error');
    expect(tauri.invoke).toHaveBeenCalledWith(
      'vol_haptics_rumble',
      expect.objectContaining({ strong: 0.85, weak: 0.6, durationMs: 40 }),
    );
    await driver.cancel?.();
    expect(tauri.invoke).toHaveBeenCalledWith('vol_haptics_stop', undefined);
  });

  it('gözlemci varsayılan probla kurulur ve dispose edilir', async () => {
    const dispose = observeLinuxHaptics();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tauri.invoke).toHaveBeenCalledWith('vol_haptics_status', undefined);
    dispose();
  });

  it('Tauri dışında gözlemci boş temizleyici döndürür', () => {
    const dispose = observeLinuxHaptics({
      isTauri: () => false,
      invoke: () => Promise.resolve({ backend: 'hidraw' }),
      sleep: () => Promise.resolve(),
    });
    expect(() => dispose()).not.toThrow();
  });

  it('iptal komutu düşse de gözlemci sessiz kalır', async () => {
    vi.useFakeTimers();
    let backend = 'hidraw';
    const events = new EventTarget();
    const p = {
      isTauri: () => true,
      invoke: vi.fn(
        (command: string): Promise<unknown> =>
          command === 'vol_haptics_status'
            ? Promise.resolve({ backend })
            : Promise.reject(new Error('iptal yok')),
      ),
      sleep: () => Promise.resolve(),
      events,
    };
    const dispose = observeLinuxHaptics(p);
    await vi.advanceTimersByTimeAsync(0);
    expect(fakes.setHapticsDriver).toHaveBeenCalledTimes(1);

    events.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    backend = 'none';
    await vi.advanceTimersByTimeAsync(1000);
    expect(fakes.setHapticsDriver).toHaveBeenLastCalledWith(null);
    dispose();

    backend = 'hidraw';
    const second = observeLinuxHaptics(p);
    await vi.advanceTimersByTimeAsync(0);
    second();
    await vi.advanceTimersByTimeAsync(0);
    expect(fakes.setHapticsDriver).toHaveBeenLastCalledWith(null);
  });
});

describe('registerLinuxHaptics', () => {
  it('evdev varsa core sürücüsünü kaydeder', async () => {
    expect(await registerLinuxHaptics(probe({ backend: 'evdev' }))).toBe(true);
    const driver = fakes.setHapticsDriver.mock.calls[0]?.[0] as { play?: unknown };
    expect(typeof driver.play).toBe('function');
  });

  it('hidraw varsa da kaydeder — Deck için ölçülmüş yol', async () => {
    expect(await registerLinuxHaptics(probe({ backend: 'hidraw', device: 'hidraw2' }))).toBe(true);
  });

  it('aygıt yoksa sürücü kaydetmez ve false döner', async () => {
    expect(await registerLinuxHaptics(probe({ backend: 'none' }))).toBe(false);
  });
});
