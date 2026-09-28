import { describe, expect, it, vi } from 'vitest';
import {
  activateSteamActionSet,
  cloudFileKey,
  cloudFileName,
  createSteamCloudAdapter,
  createSteamworksTextEntryProvider,
  onSteamFloatingKeyboardDismissed,
  onSteamOverlay,
  setSteamInputManifest,
  setSteamworksProbe,
  showSteamBindingPanel,
  showSteamFloatingKeyboard,
  steamActionGlyph,
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

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  it('show sırasında gelen hızlı kapanışı kaçırmaz ve aboneliği kaldırır', async () => {
    const { probe, events } = fakeProbe({
      show_text_input: () => {
        events.get('vol-steamworks:text-input')?.({ submitted: true, text: 'hızlı' });
        return true;
      },
    });
    const restore = afterEach(probe);
    let result: unknown;
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' });
    void opened.then((value) => (result = value));
    try {
      await nextTurn();
      expect(result).toEqual({ value: 'hızlı', canceled: false });
      expect(events.size).toBe(0);
    } finally {
      events.get('vol-steamworks:text-input')?.({ submitted: false });
      await opened;
      restore();
    }
  });

  it('ilk await öncesindeki ikinci open da iptal olur', async () => {
    const { probe, events } = fakeProbe({ show_text_input: true });
    const handlers: Array<(payload: unknown) => void> = [];
    const listen = probe.listen;
    const restore = afterEach({
      ...probe,
      listen: (event, handler) => {
        handlers.push(handler);
        return listen(event, handler);
      },
    });
    const provider = createSteamworksTextEntryProvider();
    const first = provider.open({ value: 'a' });
    const second = provider.open({ value: 'b' });
    let result: unknown;
    void second.then((value) => (result = value));
    try {
      await nextTurn();
      expect(result).toEqual({ value: 'b', canceled: true });
      expect(probe.invoke).toHaveBeenCalledTimes(1);
    } finally {
      for (const handler of handlers) handler({ submitted: false });
      await Promise.all([first, second]);
      expect(events.size).toBe(0);
      restore();
    }
  });

  it('yerel klavye tamamlanana dek ikinci open iptal olur', async () => {
    let complete!: (value: { value: string; canceled: boolean }) => void;
    fakes.OnScreenKeyboard.open.mockImplementationOnce(
      () => new Promise((resolve) => (complete = resolve)),
    );
    fakes.OnScreenKeyboard.open.mockResolvedValue({ value: 'ikinci', canceled: false });
    const { probe } = fakeProbe({ show_text_input: false });
    const restore = afterEach(probe);
    const provider = createSteamworksTextEntryProvider();
    const first = provider.open({ value: 'a' });
    try {
      await nextTurn();
      expect(await provider.open({ value: 'b' })).toEqual({ value: 'b', canceled: true });
    } finally {
      complete({ value: 'yerel', canceled: false });
      await first;
      restore();
    }
  });

  it('abonelik reddedilirse show çağırmadan yerel klavyeye düşer', async () => {
    fakes.OnScreenKeyboard.open.mockResolvedValue({ value: 'yerel', canceled: false });
    const { probe } = fakeProbe({ show_text_input: true });
    const restore = afterEach({
      ...probe,
      listen: () => Promise.reject(new Error('abonelik yok')),
    });
    try {
      const provider = createSteamworksTextEntryProvider();
      expect(await provider.open({ value: 'ilk' })).toEqual({ value: 'yerel', canceled: false });
      expect(probe.invoke).not.toHaveBeenCalled();
      expect(await provider.open({ value: 'sonraki' })).toEqual({
        value: 'yerel',
        canceled: false,
      });
    } finally {
      restore();
    }
  });

  it('abonelik tutuşu çözülmeden gelen olayın dinleyicisini de kaldırır', async () => {
    const unlisten = vi.fn();
    const { probe } = fakeProbe({ show_text_input: true });
    const restore = afterEach({
      ...probe,
      listen: async (_, handler) => {
        handler({ submitted: true, text: 'erken' });
        await Promise.resolve();
        return unlisten;
      },
    });
    try {
      expect(await createSteamworksTextEntryProvider().open({ value: 'ilk' })).toEqual({
        value: 'erken',
        canceled: false,
      });
      expect(unlisten).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it('show çözülmeden gelen kapanışı saklar', async () => {
    let show!: (value: boolean) => void;
    const { probe, events } = fakeProbe({
      show_text_input: () => new Promise<boolean>((resolve) => (show = resolve)),
    });
    const restore = afterEach(probe);
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' });
    try {
      await nextTurn();
      events.get('vol-steamworks:text-input')?.({ submitted: true, text: 'beklenen' });
      show(true);
      expect(await opened).toEqual({ value: 'beklenen', canceled: false });
      expect(events.size).toBe(0);
    } finally {
      restore();
    }
  });

  it.each([false, new Error('show reddi')])(
    'show reddinde yerel klavye açılmadan abonelik temizlenir (%s)',
    async (show) => {
      const { probe, events } = fakeProbe({ show_text_input: show });
      const restore = afterEach(probe);
      fakes.OnScreenKeyboard.open.mockImplementationOnce(() => {
        expect(events.size).toBe(0);
        return Promise.resolve({ value: 'yerel', canceled: false });
      });
      try {
        expect(await createSteamworksTextEntryProvider().open({ value: 'ilk' })).toEqual({
          value: 'yerel',
          canceled: false,
        });
      } finally {
        restore();
      }
    },
  );

  it('yerel klavye reddinden sonra pending sıfırlanır', async () => {
    const { probe, events } = fakeProbe({ show_text_input: false });
    const restore = afterEach(probe);
    fakes.OnScreenKeyboard.open.mockRejectedValueOnce(new Error('yerel reddi'));
    fakes.OnScreenKeyboard.open.mockResolvedValue({ value: 'tekrar', canceled: false });
    try {
      const provider = createSteamworksTextEntryProvider();
      await expect(provider.open({ value: 'ilk' })).rejects.toThrow('yerel reddi');
      expect(await provider.open({ value: 'sonraki' })).toEqual({
        value: 'tekrar',
        canceled: false,
      });
      expect(events.size).toBe(0);
    } finally {
      restore();
    }
  });

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
    events.get('vol-steamworks:text-input')?.({ submitted: false, text: 'iptal metni' });
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

describe('Steam Input ve kayan klavye komutları', () => {
  it('manifest, aksiyon seti, glif, panel ve klavye komutlarına çevrilir', async () => {
    const { probe } = fakeProbe({
      set_input_manifest: true,
      activate_action_set: 2,
      action_glyph: [{ name: 'A', pngBase64: null }],
      show_binding_panel: true,
      show_floating_input: true,
    });
    const restore = afterEach(probe);

    expect(await setSteamInputManifest('steam_input_manifest.vdf')).toBe(true);
    expect(await activateSteamActionSet('Gameplay')).toBe(2);
    expect(await steamActionGlyph('Gameplay', 'fire')).toEqual([{ name: 'A', pngBase64: null }]);
    expect(await showSteamBindingPanel()).toBe(true);
    expect(await showSteamFloatingKeyboard({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);

    expect(probe.invoke).toHaveBeenCalledWith('set_input_manifest', {
      path: 'steam_input_manifest.vdf',
    });
    expect(probe.invoke).toHaveBeenCalledWith('activate_action_set', { name: 'Gameplay' });
    expect(probe.invoke).toHaveBeenCalledWith('action_glyph', {
      actionSet: 'Gameplay',
      action: 'fire',
    });
    expect(probe.invoke).toHaveBeenCalledWith('show_floating_input', {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    restore();
  });

  it('kayan klavye kapanışı abonelikten bildirilir', async () => {
    const { probe, events } = fakeProbe({});
    const restore = afterEach(probe);
    const onDismiss = vi.fn();
    await onSteamFloatingKeyboardDismissed(onDismiss);
    events.get('vol-steamworks:floating-dismissed')?.({});
    expect(onDismiss).toHaveBeenCalledOnce();
    restore();
  });
});
