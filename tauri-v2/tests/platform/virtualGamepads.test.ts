import { describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
import { singleVirtualPad, steamVirtualGamepads } from '../../src/platform/virtualGamepads';

const pad = { slot: 0, name: 'DualSense', vid: 0x054c, pid: 0x0ce6, type: 'ps5' };

describe('steamVirtualGamepads', () => {
  it('kabuğun listesini döner; tarayıcıda ve hatada boş', async () => {
    await expect(
      steamVirtualGamepads({ isTauri: () => true, invoke: () => Promise.resolve([pad]) }),
    ).resolves.toEqual([pad]);
    await expect(
      steamVirtualGamepads({ isTauri: () => false, invoke: () => Promise.resolve([pad]) }),
    ).resolves.toEqual([]);
    await expect(
      steamVirtualGamepads({ isTauri: () => true, invoke: () => Promise.reject(new Error('x')) }),
    ).resolves.toEqual([]);
  });

  it('varsayılan prob kabuk komutunu çağırır', async () => {
    await expect(steamVirtualGamepads()).resolves.toEqual([]);
    expect(fakes.invoke).toHaveBeenCalledWith('steam_virtual_gamepads');
  });

  it('ipucu yalnız tek kol varken verilir', () => {
    expect(singleVirtualPad([pad])).toEqual({ vid: 0x054c, type: 'ps5' });
    expect(singleVirtualPad([pad, { ...pad, slot: 1 }])).toBeUndefined();
    expect(singleVirtualPad([])).toBeUndefined();
  });
});
