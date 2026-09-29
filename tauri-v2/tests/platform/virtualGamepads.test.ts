import { describe, expect, it } from 'vitest';
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

  it('ipucu yalnız tek kol varken verilir', () => {
    expect(singleVirtualPad([pad])).toEqual({ vid: 0x054c, type: 'ps5' });
    expect(singleVirtualPad([pad, { ...pad, slot: 1 }])).toBeUndefined();
    expect(singleVirtualPad([])).toBeUndefined();
  });
});
