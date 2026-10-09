import { describe, expect, it, vi } from 'vitest';
import {
  activateSteamActionSet,
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

vi.mock('@volstudio/core/ui', () => fakes);

function fakeProbe(handlers: Record<string, unknown>): {
  probe: SteamworksProbe;
  events: Map<string, (payload: unknown) => void>;
} {
  const events = new Map<string, (payload: unknown) => void>();
  const probe: SteamworksProbe = {
    isTauri: () => true,
    invoke: vi.fn((cmd: string, args?: Record<string, unknown>): Promise<unknown> => {
      const h = handlers[cmd];
      if (h instanceof Error) return Promise.reject(h);
      if (typeof h === 'function')
        return Promise.resolve((h as (args?: Record<string, unknown>) => unknown)(args));
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

const requestId = (probe: SteamworksProbe) =>
  vi
    .mocked(probe.invoke)
    .mock.calls.slice()
    .reverse()
    .find(([command]) => command === 'show_text_input')?.[1]?.requestId;

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
  it.each([
    ['password', 'password'],
    ['default', 'normal'],
    ['search', 'normal'],
    [undefined, 'normal'],
  ] as const)('%s amacı native klavyede %s kipine gider', async (purpose, mode) => {
    const { probe, events } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk', purpose });
    try {
      await nextTurn();
      expect(probe.invoke).toHaveBeenCalledWith('show_text_input', {
        requestId: expect.any(String) as unknown,
        description: '',
        existingText: 'ilk',
        maxCharacters: 4096,
        multiline: false,
        mode,
      });
    } finally {
      events.get('vol-steamworks:text-input')?.({ requestId: requestId(probe), submitted: false });
      await opened;
      restore();
    }
  });

  it('show sırasında gelen hızlı kapanışı kaçırmaz ve aboneliği kaldırır', async () => {
    const { probe, events } = fakeProbe({
      show_text_input: (args: Record<string, unknown>) => {
        events.get('vol-steamworks:text-input')?.({
          requestId: args.requestId,
          submitted: true,
          text: 'hızlı',
        });
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
      events.get('vol-steamworks:text-input')?.({ requestId: requestId(probe), submitted: false });
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
      for (const handler of handlers) handler({ requestId: requestId(probe), submitted: false });
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

  it('show öncesi eski olayı yok sayar; geç abonelik tutuşunu kapanışta bırakır', async () => {
    const unlisten = vi.fn();
    let handler!: (payload: unknown) => void;
    const { probe } = fakeProbe({
      show_text_input: (args: Record<string, unknown>) => {
        handler({ requestId: args.requestId, submitted: true, text: 'güncel' });
        return true;
      },
    });
    const restore = afterEach({
      ...probe,
      listen: async (event, nextHandler) => {
        if (event === 'vol-steamworks:text-input') {
          handler = nextHandler;
          handler({ requestId: 'eski', submitted: true, text: 'erken' });
        }
        await nextTurn();
        return unlisten;
      },
    });
    try {
      expect(await createSteamworksTextEntryProvider().open({ value: 'ilk' })).toEqual({
        value: 'güncel',
        canceled: false,
      });
      expect(unlisten).toHaveBeenCalledTimes(2);
    } finally {
      restore();
    }
  });

  it('overlay sonuç göndermeden kapanırsa giriş iptal olur, sonraki giriş kilitlenmez', async () => {
    vi.useFakeTimers();
    const { probe, events } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    try {
      const provider = createSteamworksTextEntryProvider();
      const opened = provider.open({ value: 'ilk' });
      await vi.advanceTimersByTimeAsync(0);
      events.get('vol-steamworks:overlay')?.({ active: false });
      await vi.advanceTimersByTimeAsync(750);
      await expect(opened).resolves.toEqual({ value: 'ilk', canceled: true });

      const next = provider.open({ value: 'ikinci' });
      await vi.advanceTimersByTimeAsync(0);
      events.get('vol-steamworks:text-input')?.({
        requestId: requestId(probe),
        submitted: true,
        text: 'tamam',
      });
      await expect(next).resolves.toEqual({ value: 'tamam', canceled: false });
    } finally {
      restore();
      vi.useRealTimers();
    }
  });

  it('hiçbir olay gelmezse üst süre sınırında iptal olur', async () => {
    vi.useFakeTimers();
    const { probe } = fakeProbe({ show_text_input: true });
    const restore = afterEach(probe);
    try {
      const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' });
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
      await expect(opened).resolves.toEqual({ value: 'ilk', canceled: true });
    } finally {
      restore();
      vi.useRealTimers();
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
      events.get('vol-steamworks:text-input')?.({
        requestId: requestId(probe),
        submitted: true,
        text: 'beklenen',
      });
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
    await nextTurn();
    events.get('vol-steamworks:text-input')?.({
      requestId: requestId(probe),
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
    await nextTurn();
    events.get('vol-steamworks:text-input')?.({
      requestId: requestId(probe),
      submitted: false,
      text: 'iptal metni',
    });
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
    expect(fakes.OnScreenKeyboard.open).toHaveBeenCalledWith({ value: 'x' }, undefined);
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
    await nextTurn();
    const second = await provider.open({ value: 'b' });
    expect(second.canceled).toBe(true);
    events.get('vol-steamworks:text-input')?.({ requestId: requestId(probe), submitted: false });
    await first;
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
      const { probe } = fakeProbe(handlers);
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

describe('Steam aksiyon seti', () => {
  it('etkinleştirme gerçek komutun kol sayısını döndürür', async () => {
    const { probe } = fakeProbe({ activate_action_set: 2 });
    const restore = afterEach(probe);
    expect(await activateSteamActionSet('Gameplay')).toBe(2);
    expect(probe.invoke).toHaveBeenCalledWith('activate_action_set', { name: 'Gameplay' });
    restore();
  });
});
