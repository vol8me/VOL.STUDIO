import { describe, expect, it, vi } from 'vitest';

/**
 * Varsayılan prob GERÇEK `@tauri-apps/api` yüklemlerini kullanır; bu dosya
 * onları taklit eder ve eklenti önekinin/payload indirgemesinin orada da
 * doğru olduğunu kanıtlar (özel prob testleri `steamworks.test.ts`te).
 */
const fakes = vi.hoisted(() => ({
  isTauri: vi.fn(() => true),
  invoke: vi.fn(() =>
    Promise.resolve({
      compiled: true,
      available: true,
      deck: false,
      bigPicture: false,
      overlayEnabled: true,
      inputReady: true,
    }),
  ),
  listen: vi.fn((_event: string, _handler: (event: { payload: unknown }) => void) =>
    Promise.resolve(() => undefined),
  ),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: fakes.isTauri, invoke: fakes.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: fakes.listen }));
vi.mock('@volstudio/core/ui', () => ({ OnScreenKeyboard: { open: vi.fn() } }));

import {
  onSteamOverlay,
  setSteamworksProbe,
  activateSteamActionSet,
  steamworksStatus,
} from '../../src/platform/steamworks';

describe('varsayılan Steamworks probu', () => {
  it('durum ve komutlar eklenti önekini kendiliğinden taşır', async () => {
    setSteamworksProbe(null);
    expect((await steamworksStatus()).available).toBe(true);
    expect(fakes.invoke).toHaveBeenCalledWith('plugin:vol-steamworks|status', undefined);

    await activateSteamActionSet('Gameplay');
    expect(fakes.invoke).toHaveBeenCalledWith('plugin:vol-steamworks|activate_action_set', {
      name: 'Gameplay',
    });
  });

  it('overlay olayı payload.active alanına indirgenir', async () => {
    setSteamworksProbe(null);
    let seen: boolean | undefined;
    await onSteamOverlay((active) => {
      seen = active;
    });
    const handler = fakes.listen.mock.calls.at(-1)?.[1] as (event: { payload: unknown }) => void;
    handler({ payload: { active: true } });
    expect(seen).toBe(true);
    handler({ payload: {} });
    expect(seen).toBe(false);
  });
});
