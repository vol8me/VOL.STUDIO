import { describe, expect, it, vi } from 'vitest';
import {
  cloudFileKey,
  cloudFileName,
  createSteamCloudAdapter,
  createSteamworksTextEntryProvider,
  onSteamOverlay,
  setSteamworksProbe,
  steamworksGlyphContext,
  steamworksStatus,
  type SteamworksProbe,
} from '../../src/platform/steamworks';

/*
 * '@volstudio/core' kök barrel'ı Phaser köprülerini çeker; burada yalnız
 * sağlayıcı tercümesi sınanır, gerçek OnScreenKeyboard core'un kendi
 * testlerinde kanıtlıdır.
 */
const fakes = vi.hoisted(() => ({
  OnScreenKeyboard: { open: vi.fn() },
}));

vi.mock('@volstudio/core', () => fakes);

function fakeProbe(handlers: Record<string, unknown>): {
  probe: SteamworksProbe;
  events: Map<string, (payload: unknown) => void>;
} {
  const events = new Map<string, (payload: unknown) => void>();
  const probe: SteamworksProbe = {
    isTauri: () => true,
    invoke: vi.fn((cmd: string): Promise<unknown> => {
      const h = handlers[cmd];
      if (h instanceof Error) return Promise.reject(h);
      if (typeof h === 'function') return Promise.resolve((h as () => unknown)());
      return Promise.resolve(h);
    }),
    listen: vi.fn((event: string, handler: (payload: unknown) => void) => {
      events.set(event, handler);
      return Promise.resolve(() => events.delete(event));
    }),
  };
  return { probe, events };
}

function afterEach(probe: SteamworksProbe) {
  setSteamworksProbe(probe);
  return () => setSteamworksProbe(null);
}

describe('steamworksStatus', () => {
  it('Tauri dışında dürüst "yok" gövdesi döner', async () => {
    const restore = afterEach({ ...fakeProbe({}).probe, isTauri: () => false });
    const s = await steamworksStatus();
    expect(s.compiled).toBe(false);
    expect(s.available).toBe(false);
    restore();
  });

  it('komut reddedilirse available:false + hata metni', async () => {
    const { probe } = fakeProbe({ status: new Error('plugin yok') });
    const restore = afterEach(probe);
    const s = await steamworksStatus();
    expect(s.available).toBe(false);
    expect(s.error).toContain('plugin yok');
    restore();
  });

  it('eklenti yanıtı aynen geçer', async () => {
    const { probe } = fakeProbe({
      status: {
        compiled: true,
        available: true,
        appId: 480,
        deck: true,
        bigPicture: true,
        overlayEnabled: true,
        cloudEnabled: true,
        inputReady: true,
      },
    });
    const restore = afterEach(probe);
    const s = await steamworksStatus();
    expect(s).toMatchObject({ available: true, deck: true, appId: 480 });
    restore();
  });
});

describe('createSteamworksTextEntryProvider', () => {
  it('diyalog açılırsa sonuç olaydan döner', async () => {
    const { probe, events } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    const provider = createSteamworksTextEntryProvider();
    const promise = provider.open({ value: 'merhaba' });
    await Promise.resolve();
    events.get('vol-steamworks:text-input')?.({
      submitted: true,
      text: 'dünya',
    });
    const result = await promise;
    expect(result).toEqual({ value: 'dünya', canceled: false });
    restore();
  });

  it('kullanıcı iptalinde canceled:true ve ilk değer kalır', async () => {
    const { probe, events } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    const provider = createSteamworksTextEntryProvider();
    const promise = provider.open({ value: 'eskisi' });
    await Promise.resolve();
    events.get('vol-steamworks:text-input')?.({ submitted: false });
    const result = await promise;
    expect(result).toEqual({ value: 'eskisi', canceled: true });
    restore();
  });

  it('diyalog açılamazsa yerel ekran klavyesine düşer', async () => {
    fakes.OnScreenKeyboard.open.mockResolvedValue({
      value: 'yerel',
      canceled: false,
    });
    const { probe } = fakeProbe({ show_text_input: false });
    const restore = afterEach(probe);
    const result = await createSteamworksTextEntryProvider().open({
      value: 'x',
    });
    expect(fakes.OnScreenKeyboard.open).toHaveBeenCalledWith({ value: 'x' });
    expect(result.value).toBe('yerel');
    restore();
  });

  it('komut hatası da yerel klavyeye düşer', async () => {
    fakes.OnScreenKeyboard.open.mockResolvedValue({
      value: 'yerel2',
      canceled: false,
    });
    const { probe } = fakeProbe({ show_text_input: new Error('stub') });
    const restore = afterEach(probe);
    const result = await createSteamworksTextEntryProvider().open({
      value: 'y',
    });
    expect(fakes.OnScreenKeyboard.open).toHaveBeenCalled();
    expect(result.value).toBe('yerel2');
    restore();
  });

  it('açık diyalog varken ikinci open iptal döner', async () => {
    const { probe, events } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    const provider = createSteamworksTextEntryProvider();
    const first = provider.open({ value: 'a' });
    await Promise.resolve();
    const second = await provider.open({ value: 'b' });
    expect(second.canceled).toBe(true);
    events.get('vol-steamworks:text-input')?.({ submitted: false });
    await first;
    restore();
  });
});

describe('Steam Cloud adaptörü', () => {
  it('anahtar ⇄ dosya adı karşılıklı dönüşür', () => {
    for (const key of ['volui:display-quality', 'save slot 1', 'ç/ğ/ü']) {
      const name = cloudFileName(key);
      expect(name).not.toContain(':');
      expect(cloudFileKey(name)).toBe(key);
    }
    expect(cloudFileKey('başka_dosya')).toBeNull();
  });

  it('get/set/remove/keys bulut komutlarına tercüme edilir', async () => {
    const store = new Map<string, string>();
    const { probe } = fakeProbe({});
    // invoke'un argümanlı sürümü: basit bir sahte depo davranışı
    const invoke = vi.fn((cmd: string, args?: Record<string, unknown>) => {
      const name = args?.name as string;
      let result: unknown = null;
      if (cmd === 'cloud_write') {
        store.set(name, args?.dataBase64 as string);
        result = true;
      } else if (cmd === 'cloud_read') {
        result = store.get(name) ?? null;
      } else if (cmd === 'cloud_delete') {
        result = store.delete(name);
      } else if (cmd === 'cloud_list') {
        result = [...store.keys()].map((n) => ({ name: n }));
      }
      return Promise.resolve(result);
    });
    const restore = afterEach({ ...probe, invoke });
    const adapter = createSteamCloudAdapter();
    await adapter.set('k1', { hp: 42 });
    expect(await adapter.get('k1')).toEqual({ hp: 42 });
    expect(await adapter.keys()).toEqual(['k1']);
    await adapter.remove('k1');
    expect(await adapter.get('k1')).toBeUndefined();
    restore();
  });
});

describe('glif ipucu ve overlay', () => {
  it('ilk kolun InputType adı steamworksType olur', async () => {
    const { probe } = fakeProbe({
      controllers: [{ handle: 1, steamworksType: 'steamdeck' }],
    });
    const restore = afterEach(probe);
    expect(await steamworksGlyphContext()).toEqual({
      steamworksType: 'steamdeck',
    });
    restore();
  });

  it('kol yoksa ya da eklenti kapalıysa boş bağlam', async () => {
    for (const handlers of [{ controllers: [] }, { controllers: new Error('stub') }]) {
      const { probe } = fakeProbe(handlers as Record<string, unknown>);
      const restore = afterEach(probe);
      expect(await steamworksGlyphContext()).toEqual({});
      restore();
    }
  });

  it('overlay olayı boolean active alanına çevrilir', async () => {
    const { probe, events } = fakeProbe({});
    const restore = afterEach(probe);
    const seen: boolean[] = [];
    await onSteamOverlay((active) => seen.push(active));
    events.get('vol-steamworks:overlay')?.({ active: true });
    events.get('vol-steamworks:overlay')?.({ active: false });
    expect(seen).toEqual([true, false]);
    restore();
  });
});
