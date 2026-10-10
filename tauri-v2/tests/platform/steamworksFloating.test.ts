import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSteamworksTextEntryProvider,
  setSteamworksProbe,
  showSteamFloatingKeyboard,
  showSteamFloatingKeyboardFor,
  type SteamFloatingKeyboardField,
  type SteamworksProbe,
} from '../../src/platform/steamworks';

/*
 * Kayan klavye (yazılan tuşlar doğrudan odaklı alana gider) diyalogdan ayrı bir giriştir: sonuç metni
 * taşımaz, `text-input` olayına bağlanmaz. Burada yalnız JS sözleşmesi sınanır; gerçek Steam runtime
 * sondası NOT-RUN (F04.4/F08.6) — AppID 480 ya da başarılı IPC ürün kabulü değildir.
 */
const fakes = vi.hoisted(() => ({ OnScreenKeyboard: { open: vi.fn() } }));
vi.mock('@volstudio/core/ui', () => fakes);

const FLOATING = 'vol-steamworks:floating-dismissed';
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const ANCHOR = { x: 10, y: 20, width: 300, height: 40 };

function bridge(show: boolean | Promise<boolean> = true) {
  const events = new Map<string, (payload: unknown) => void>();
  const removed = vi.fn();
  const probe: SteamworksProbe = {
    isTauri: () => true,
    invoke: vi.fn((command: string) =>
      Promise.resolve(
        command === 'show_floating_input' || command === 'show_text_input' ? show : undefined,
      ),
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
  const calls = (command: string) =>
    vi.mocked(probe.invoke).mock.calls.filter(([name]) => name === command);
  const requestId = (): string | undefined =>
    calls('show_floating_input').at(-1)?.[1]?.requestId as string | undefined;
  const dismiss = (payload: Record<string, unknown> = {}) =>
    events.get(FLOATING)?.({ requestId: requestId(), ...payload });
  return { probe, events, removed, calls, requestId, dismiss };
}

afterEach(() => {
  setSteamworksProbe(null);
  fakes.OnScreenKeyboard.open.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Steam kayan klavye: açılış ve kapanış', () => {
  it('olayı show öncesi dinler, alanı ölçekli piksel ve tek satır kipiyle gönderir', async () => {
    const steam = bridge();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1.5 });
    await turn();
    expect(steam.probe.listen).toHaveBeenCalledWith(FLOATING, expect.any(Function));
    const listenOrder = vi.mocked(steam.probe.listen).mock.invocationCallOrder[0] ?? Infinity;
    const invokeOrder = vi.mocked(steam.probe.invoke).mock.invocationCallOrder[0] ?? 0;
    expect(listenOrder).toBeLessThan(invokeOrder);
    expect(steam.calls('show_floating_input')).toHaveLength(1);
    const args = steam.calls('show_floating_input')[0]?.[1];
    expect(String(args?.requestId)).toMatch(/^float-\d+$/);
    expect(args).toMatchObject({ x: 15, y: 30, width: 450, height: 60, mode: 'singleLine' });
    steam.dismiss();
    await expect(opened).resolves.toBe('dismissed');
    expect(steam.events.size).toBe(0);
    expect(steam.removed).toHaveBeenCalledTimes(1);
    // Kullanıcı kapatması iptal çağrısı gerektirmez.
    expect(steam.calls('cancel_text_input')).toHaveLength(0);
  });

  it('çok satırlı alan multiLine kipiyle açılır', async () => {
    const steam = bridge();
    const opened = showSteamFloatingKeyboard(ANCHOR, { multiline: true, scale: 1 });
    await turn();
    expect(steam.calls('show_floating_input')[0]?.[1]).toMatchObject({ mode: 'multiLine' });
    steam.dismiss();
    await expect(opened).resolves.toBe('dismissed');
  });

  it('ölçek verilmezse devicePixelRatio kullanılır; konum yuvarlanır, boyut en az 1 olur', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const steam = bridge();
    const opened = showSteamFloatingKeyboard({ x: 0.26, y: -3.4, width: 0.2, height: 10.4 });
    await turn();
    expect(steam.calls('show_floating_input')[0]?.[1]).toMatchObject({
      x: 1,
      y: -7,
      width: 1,
      height: 21,
    });
    steam.dismiss();
    await opened;
  });

  it('dönen sonuç yalnız durumdur: kapanış yükündeki metin ve diyalog olayı sonucu belirlemez', async () => {
    const steam = bridge();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    // Diyalog sonuç olayına abone olunmaz; sızan metin yok sayılır.
    expect(steam.events.has('vol-steamworks:text-input')).toBe(false);
    steam.dismiss({ submitted: true, text: 'gizli' });
    await expect(opened).resolves.toBe('dismissed');
  });

  it('başka isteğin kapanış olayı bu klavyeyi kapatmaz', async () => {
    const steam = bridge();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    let settled = false;
    void opened.then(() => (settled = true));
    steam.events.get(FLOATING)?.({ requestId: 'float-0' });
    steam.events.get(FLOATING)?.(null);
    await turn();
    expect(settled).toBe(false);
    steam.dismiss();
    await expect(opened).resolves.toBe('dismissed');
  });

  it('show çözülmeden gelen kapanışı saklar', async () => {
    let finishShow!: (value: boolean) => void;
    const steam = bridge(
      new Promise<boolean>((resolve) => {
        finishShow = resolve;
      }),
    );
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    steam.dismiss();
    finishShow(true);
    await expect(opened).resolves.toBe('dismissed');
  });

  it('bu uçta açık klavye varken ikincisi busy döner ve native çağrı yapmaz; kapanınca yenisi açılır', async () => {
    const steam = bridge();
    const first = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 1 })).resolves.toBe('busy');
    expect(steam.calls('show_floating_input')).toHaveLength(1);
    steam.dismiss();
    await first;
    const second = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    expect(steam.calls('show_floating_input')).toHaveLength(2);
    expect(steam.requestId()).not.toBe(steam.calls('show_floating_input')[0]?.[1]?.requestId);
    steam.dismiss();
    await expect(second).resolves.toBe('dismissed');
  });
});

describe('Steam kayan klavye: açılamayan durumlar yedeğe bırakılır', () => {
  it('parola alanında klavye açılmaz (maskeli giriş diyalogun Password kipine ayrılır)', async () => {
    const steam = bridge();
    await expect(showSteamFloatingKeyboard(ANCHOR, { password: true })).resolves.toBe(
      'unavailable',
    );
    expect(steam.probe.listen).not.toHaveBeenCalled();
    expect(steam.probe.invoke).not.toHaveBeenCalled();
  });

  it('geçersiz alan dikdörtgeni native çağrı yapmadan unavailable döner', async () => {
    const steam = bridge();
    for (const bad of [
      { x: Number.NaN, y: 0, width: 10, height: 10 },
      { x: 0, y: Number.POSITIVE_INFINITY, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: 10, height: -4 },
    ]) {
      await expect(showSteamFloatingKeyboard(bad, { scale: 1 })).resolves.toBe('unavailable');
    }
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 0 })).resolves.toBe('unavailable');
    expect(steam.probe.invoke).not.toHaveBeenCalled();
  });

  it('Steam false dönerse (overlay yok ya da başka giriş açık) unavailable; abonelik bırakılır ve yenisi açılabilir', async () => {
    const steam = bridge(false);
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 1 })).resolves.toBe('unavailable');
    expect(steam.events.size).toBe(0);
    expect(steam.removed).toHaveBeenCalledTimes(1);
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 1 })).resolves.toBe('unavailable');
    expect(steam.calls('show_floating_input')).toHaveLength(2);
  });

  it('komut reddi ve abonelik reddi unavailable olur, kilitlenme bırakmaz', async () => {
    const steam = bridge();
    vi.mocked(steam.probe.invoke).mockRejectedValueOnce(new Error('izin yok'));
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 1 })).resolves.toBe('unavailable');
    vi.mocked(steam.probe.listen).mockRejectedValueOnce(new Error('olay yok'));
    await expect(showSteamFloatingKeyboard(ANCHOR, { scale: 1 })).resolves.toBe('unavailable');
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    steam.dismiss();
    await expect(opened).resolves.toBe('dismissed');
  });

  it('diyalog sağlayıcısı kayan klavyeyi tetiklemez ve OSK yedeği korunur', async () => {
    const steam = bridge(false);
    fakes.OnScreenKeyboard.open.mockResolvedValue({ value: 'yerel', canceled: false });
    await expect(createSteamworksTextEntryProvider().open({ value: 'ilk' })).resolves.toEqual({
      value: 'yerel',
      canceled: false,
    });
    expect(steam.calls('show_text_input')).toHaveLength(1);
    expect(steam.calls('show_floating_input')).toHaveLength(0);
    expect(fakes.OnScreenKeyboard.open).toHaveBeenCalledOnce();
  });
});

describe('Steam kayan klavye: sahibin iptali', () => {
  it('açıkken abort canceled döner, aynı kimlikle native kapatır ve aboneliği bırakır', async () => {
    const steam = bridge();
    const controller = new AbortController();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1, signal: controller.signal });
    await turn();
    const id = steam.requestId();
    controller.abort();
    await expect(opened).resolves.toBe('canceled');
    expect(steam.calls('cancel_text_input')).toEqual([['cancel_text_input', { requestId: id }]]);
    expect(steam.events.size).toBe(0);
    // Kapanış sonrası gelen geç Steam olayı hiçbir şeyi değiştirmez ve yeni açılışı engellemez.
    const next = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await turn();
    steam.dismiss();
    await expect(next).resolves.toBe('dismissed');
  });

  it('önceden iptal edilmiş sinyal hiçbir native çağrı yapmaz', async () => {
    const steam = bridge();
    await expect(
      showSteamFloatingKeyboard(ANCHOR, { scale: 1, signal: AbortSignal.abort() }),
    ).resolves.toBe('canceled');
    expect(steam.probe.listen).not.toHaveBeenCalled();
    expect(steam.probe.invoke).not.toHaveBeenCalled();
  });

  it('show yanıtı gelmeden abort: geç gelen açılış yine kapatılır', async () => {
    let finishShow!: (value: boolean) => void;
    const steam = bridge(
      new Promise<boolean>((resolve) => {
        finishShow = resolve;
      }),
    );
    const controller = new AbortController();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1, signal: controller.signal });
    await turn();
    controller.abort();
    await expect(opened).resolves.toBe('canceled');
    const before = steam.calls('cancel_text_input').length;
    finishShow(true);
    await turn();
    expect(steam.calls('cancel_text_input').length).toBe(before + 1);
    expect(steam.events.size).toBe(0);
  });

  it('abonelik beklerken abort native show açmaz', async () => {
    const steam = bridge();
    let attach!: (remove: () => void) => void;
    const remove = vi.fn();
    vi.mocked(steam.probe.listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          attach = resolve;
        }),
    );
    const controller = new AbortController();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1, signal: controller.signal });
    controller.abort();
    await expect(opened).resolves.toBe('canceled');
    attach(remove);
    await turn();
    expect(remove).toHaveBeenCalledOnce();
    expect(steam.probe.invoke).not.toHaveBeenCalled();
  });

  it('kapatma komutu reddedilse de sonuç canceled kalır ve uyarı verir', async () => {
    const steam = bridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(steam.probe.invoke).mockImplementation((command) =>
      command === 'cancel_text_input'
        ? Promise.reject(new Error('reddedildi'))
        : Promise.resolve(true),
    );
    const controller = new AbortController();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1, signal: controller.signal });
    await turn();
    controller.abort();
    await expect(opened).resolves.toBe('canceled');
    await turn();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('kapanış olayı hiç gelmezse üst süre sınırında iptal edilir ve uç serbest kalır', async () => {
    vi.useFakeTimers();
    const steam = bridge();
    const opened = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    await expect(opened).resolves.toBe('canceled');
    expect(steam.calls('cancel_text_input')).toHaveLength(1);
    const next = showSteamFloatingKeyboard(ANCHOR, { scale: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(steam.calls('show_floating_input')).toHaveLength(2);
    steam.dismiss();
    await expect(next).resolves.toBe('dismissed');
  });
});

describe('showSteamFloatingKeyboardFor: alandan türetme', () => {
  const field = (patch: Partial<SteamFloatingKeyboardField> = {}): SteamFloatingKeyboardField => ({
    tagName: 'INPUT',
    type: 'text',
    getBoundingClientRect: () => ANCHOR,
    ...patch,
  });

  it('input tek satır, textarea çok satır açılır', async () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const steam = bridge();
    const single = showSteamFloatingKeyboardFor(field());
    await turn();
    expect(steam.calls('show_floating_input')[0]?.[1]).toMatchObject({
      mode: 'singleLine',
      x: 10,
      y: 20,
      width: 300,
      height: 40,
    });
    steam.dismiss();
    await single;
    const multi = showSteamFloatingKeyboardFor(field({ tagName: 'TEXTAREA', type: 'textarea' }));
    await turn();
    expect(steam.calls('show_floating_input')[1]?.[1]).toMatchObject({ mode: 'multiLine' });
    steam.dismiss();
    await expect(multi).resolves.toBe('dismissed');
  });

  it('parola, salt okunur ve devre dışı alanlarda klavye açılmaz', async () => {
    const steam = bridge();
    for (const blocked of [{ type: 'password' }, { readOnly: true }, { disabled: true }]) {
      await expect(showSteamFloatingKeyboardFor(field(blocked))).resolves.toBe('unavailable');
    }
    expect(steam.probe.invoke).not.toHaveBeenCalled();
  });

  it('sinyal alana kadar iletilir', async () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const steam = bridge();
    const controller = new AbortController();
    const opened = showSteamFloatingKeyboardFor(field(), controller.signal);
    await turn();
    controller.abort();
    await expect(opened).resolves.toBe('canceled');
    expect(steam.calls('cancel_text_input')).toHaveLength(1);
  });
});
