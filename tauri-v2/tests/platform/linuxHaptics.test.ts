import { describe, expect, it, vi } from 'vitest';
import {
  createLinuxHapticsDriver,
  getLinuxHapticsStatus,
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

vi.mock('@volstudio/core', () => fakes);

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
