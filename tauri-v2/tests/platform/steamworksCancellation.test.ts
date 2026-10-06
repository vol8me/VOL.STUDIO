import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSteamworksTextEntryProvider,
  setSteamworksProbe,
  type SteamworksProbe,
} from '../../src/platform/steamworks';

const fallback = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('@volstudio/core/ui', () => ({ OnScreenKeyboard: fallback }));

const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function bridge(show: boolean | Promise<boolean> = true) {
  const events = new Map<string, (payload: unknown) => void>();
  const removed = vi.fn();
  const probe: SteamworksProbe = {
    isTauri: () => true,
    invoke: vi.fn((command: string) =>
      Promise.resolve(command === 'show_text_input' ? show : undefined),
    ),
    listen: vi.fn((event: string, handler: (payload: unknown) => void) => {
      events.set(event, handler);
      return Promise.resolve(() => {
        events.delete(event);
        removed();
      });
    }),
  };
  setSteamworksProbe(probe);
  const requestId = () =>
    vi
      .mocked(probe.invoke)
      .mock.calls.slice()
      .reverse()
      .find(([command]) => command === 'show_text_input')?.[1]?.requestId;
  const close = () =>
    events.get('vol-steamworks:text-input')?.({ requestId: requestId(), submitted: false });
  return { probe, events, removed, requestId, close };
}

afterEach(() => {
  setSteamworksProbe(null);
  fallback.open.mockReset();
});

describe('Steam metin oturumu sahipliği', () => {
  it('abort sonrası geç kurulan aboneliği hemen bırakır ve native show açmaz', async () => {
    const current = bridge();
    let attach!: (remove: () => void) => void;
    const remove = vi.fn();
    vi.mocked(current.probe.listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          attach = resolve;
        }),
    );
    const controller = new AbortController();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    controller.abort();
    await expect(opened).resolves.toEqual({ value: 'ilk', canceled: true });
    attach(remove);
    await turn();
    expect(remove).toHaveBeenCalledOnce();
    expect(current.probe.invoke).not.toHaveBeenCalled();
    expect(current.probe.listen).toHaveBeenCalledTimes(1);
  });

  it('eski show geç tamamlanınca yeni pending sahibi serbest bırakılmaz', async () => {
    let finishOld!: (value: boolean) => void;
    const current = bridge();
    vi.mocked(current.probe.invoke).mockImplementation((command) => {
      if (command !== 'show_text_input') return Promise.reject(new Error('iptal köprüsü reddi'));
      if (!finishOld)
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return Promise.resolve(true);
    });
    const provider = createSteamworksTextEntryProvider();
    const controller = new AbortController();
    const first = provider.open({ value: 'ilk' }, controller.signal);
    await turn();
    const oldId = current.requestId();
    controller.abort();
    await first;
    const second = provider.open({ value: 'yeni' });
    await turn();
    const newId = current.requestId();
    expect(newId).not.toBe(oldId);
    expect(newId).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
    finishOld(true);
    await turn();
    expect(await provider.open({ value: 'üçüncü' })).toEqual({ value: 'üçüncü', canceled: true });
    current.events.get('vol-steamworks:text-input')?.({
      requestId: oldId,
      submitted: true,
      text: 'eski',
    });
    current.events.get('vol-steamworks:text-input')?.({
      requestId: newId,
      submitted: true,
      text: 'son',
    });
    await expect(second).resolves.toEqual({ value: 'son', canceled: false });
  });

  it('ayrı provider kayıtları global olarak ayrı native istek kimliği taşır', async () => {
    const current = bridge();
    const firstOwner = new AbortController();
    const first = createSteamworksTextEntryProvider().open({ value: 'ilk' }, firstOwner.signal);
    await turn();
    const oldId = current.requestId();
    firstOwner.abort();
    await first;
    const second = createSteamworksTextEntryProvider().open({ value: 'yeni' });
    await turn();
    expect(current.requestId()).not.toBe(oldId);
    current.close();
    await second;
  });

  it('yerel fallback iptali prompt döner; geç ret gözlenir', async () => {
    const current = bridge(false);
    let reject!: (error: unknown) => void;
    fallback.open.mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const controller = new AbortController();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    await turn();
    expect(fallback.open).toHaveBeenCalledWith({ value: 'ilk' }, controller.signal);
    controller.abort();
    await expect(opened).resolves.toEqual({ value: 'ilk', canceled: true });
    reject(new Error('geç fallback reddi'));
    await turn();
    expect(current.events.size).toBe(0);
  });

  it('abort sonrası abonelik reddi fallback açmaz ve gözlenir', async () => {
    const current = bridge();
    let reject!: (error: unknown) => void;
    vi.mocked(current.probe.listen).mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const controller = new AbortController();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    controller.abort();
    await opened;
    reject(new Error('geç listen reddi'));
    await turn();
    expect(fallback.open).not.toHaveBeenCalled();
    expect(current.probe.invoke).not.toHaveBeenCalled();
  });

  it('önceden iptal edilmiş owner native veya yerel klavye açmaz', async () => {
    const current = bridge();
    const controller = new AbortController();
    controller.abort();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    let result: unknown;
    void opened.then((value) => (result = value));
    try {
      await turn();
      expect(result).toEqual({ value: 'ilk', canceled: true });
      expect(current.probe.invoke).not.toHaveBeenCalled();
      expect(current.probe.listen).not.toHaveBeenCalled();
      expect(fallback.open).not.toHaveBeenCalled();
    } finally {
      current.close();
      await opened;
    }
  });

  it('destroy/abort açık native oturumu beklemeden kapatır ve kaynakları bırakır', async () => {
    const current = bridge();
    const controller = new AbortController();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    let result: unknown;
    void opened.then((value) => (result = value));
    try {
      await turn();
      const requestId = current.requestId();
      controller.abort();
      await turn();
      expect(result).toEqual({ value: 'ilk', canceled: true });
      expect(current.probe.invoke).toHaveBeenCalledWith('cancel_text_input', { requestId });
      expect(current.events.size).toBe(0);
      expect(current.removed).toHaveBeenCalledTimes(2);
    } finally {
      current.close();
      await opened;
    }
  });

  it('başka native isteğin geç sonucu yeni oturuma uygulanmaz', async () => {
    const current = bridge();
    const opened = createSteamworksTextEntryProvider().open({ value: 'yeni' });
    let result: unknown;
    void opened.then((value) => (result = value));
    try {
      await turn();
      expect(current.requestId()).toEqual(expect.any(String));
      current.events.get('vol-steamworks:text-input')?.({
        requestId: 'eski-owner',
        submitted: true,
        text: 'eski cevap',
      });
      await turn();
      expect(result).toBeUndefined();
      current.events.get('vol-steamworks:text-input')?.({
        requestId: current.requestId(),
        submitted: true,
        text: 'güncel cevap',
      });
      await expect(opened).resolves.toEqual({ value: 'güncel cevap', canceled: false });
    } finally {
      current.close();
      await opened;
    }
  });

  it('native show gecikse bile abort owner sonucunu ve temizliğini bekletmez', async () => {
    let show!: (value: boolean) => void;
    const shown = new Promise<boolean>((resolve) => (show = resolve));
    const current = bridge(shown);
    const controller = new AbortController();
    const opened = createSteamworksTextEntryProvider().open({ value: 'ilk' }, controller.signal);
    let result: unknown;
    void opened.then((value) => (result = value));
    try {
      await turn();
      controller.abort();
      await turn();
      expect(result).toEqual({ value: 'ilk', canceled: true });
      expect(current.events.size).toBe(0);
      show(true);
      await turn();
      expect(current.probe.invoke).toHaveBeenCalledWith('cancel_text_input', {
        requestId: current.requestId(),
      });
      expect(fallback.open).not.toHaveBeenCalled();
    } finally {
      show(true);
      await turn();
      current.close();
      await opened;
    }
  });
});
