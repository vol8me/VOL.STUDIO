import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_UI_AUDIO_SETTINGS,
  UI_AUDIO_STORAGE_KEY,
  UI_CRITICAL_EVENTS,
  UI_INTENT_SOUND,
  UI_MICRO_EVENTS,
  UI_OUTCOME_SOUND,
  UI_SOUND_EVENTS,
  UiSoundKit,
  channelGain,
  normalizeUiAudioSettings,
  type UiAudioSettingsStore,
  type UiSoundAssets,
} from '../../src/audio/ui';
import type { DuckingProfile, SidechainDucker } from '../../src/audio/sidechain';
import type { ScopedKey } from '../../src/persistence/scopedStorage';
import { uiIntentBusFor } from '../../src/ui/feedback/uiIntent';
import { Button } from '../../src/ui/primitives/Button';
import { FakeContext, playedUrls, stubFetch } from '../support/fakeAudio';

const ASSETS: UiSoundAssets = {
  press: ['p0.ogg', 'p1.ogg', 'p2.ogg'],
  sliderTick: ['t0.ogg', 't1.ogg', 't2.ogg'],
  denied: ['e0.ogg', 'e1.ogg', 'e2.ogg'],
  confirm: ['s0.ogg'],
};

let clock = 0;
const now = (): number => clock;

function kit(
  overrides: Partial<ConstructorParameters<typeof UiSoundKit>[0]> = {},
  context = new FakeContext(),
) {
  context.state = 'running';
  const instance = new UiSoundKit({
    assets: ASSETS,
    context: context as unknown as AudioContext,
    now,
    ...overrides,
  });
  return { kit: instance, context };
}

async function ready(overrides: Parameters<typeof kit>[0] = {}) {
  const made = kit(overrides);
  await made.kit.preload();
  return made;
}

function memoryStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  const saves: [string, unknown][] = [];
  const store: UiAudioSettingsStore = {
    load: <T>(key: ScopedKey, fallback: T) =>
      Promise.resolve((data.has(key) ? data.get(key) : fallback) as T),
    save: <T>(key: ScopedKey, value: T) => {
      saves.push([key, value]);
      data.set(key, value);
      return Promise.resolve();
    },
  };
  return { store, saves };
}

beforeEach(() => {
  clock = 1000;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ayarlar (cihaz kapsamı)', () => {
  it('varsayılanlar, kırpma ve bozuk değerin varsayılana inmesi', () => {
    expect(DEFAULT_UI_AUDIO_SETTINGS).toEqual({
      master: 1,
      ui: 0.8,
      sfx: 1,
      music: 0.8,
      speech: 1,
      muted: false,
    });
    expect(normalizeUiAudioSettings({ master: 3, ui: -1, sfx: Number.NaN, muted: 'evet' })).toEqual(
      { ...DEFAULT_UI_AUDIO_SETTINGS, master: 1, ui: 0 },
    );
    expect(normalizeUiAudioSettings(null)).toEqual(DEFAULT_UI_AUDIO_SETTINGS);
    expect(normalizeUiAudioSettings([1, 2])).toEqual(DEFAULT_UI_AUDIO_SETTINGS);
  });

  it('kanal kazancı master × kanaldır; sessizlik hepsini 0 yapar ama seviyeleri korur', () => {
    const settings = normalizeUiAudioSettings({ master: 0.5, ui: 0.8, sfx: 0.4, muted: false });
    expect(channelGain(settings, 'ui')).toBeCloseTo(0.4);
    expect(channelGain(settings, 'sfx')).toBeCloseTo(0.2);
    const muted = normalizeUiAudioSettings({ ...settings, muted: true });
    expect(channelGain(muted, 'music')).toBe(0);
    expect(muted.master).toBe(0.5);
  });

  it('UI otobüsüne yalnız master × ui uygulanır ve ayar değişince güncellenir', async () => {
    const { kit: instance, context } = await ready({ settings: { master: 0.5, ui: 0.5 } });
    instance.play('press');
    // İlk GainNode SoundBank otobüsüdür.
    expect(context.gains[0].gain.value).toBeCloseTo(0.25);
    instance.setSettings({ master: 1, ui: 1 });
    expect(context.gains[0].gain.value).toBe(1);
    expect(instance.channelGain('music')).toBeCloseTo(0.8);
  });

  it('değişiklik device.volui:audio anahtarına yazılır; restore uygular, bozuk kaydı düzeltir', async () => {
    const { store, saves } = memoryStore();
    const { kit: first } = kit({ store });
    first.setSettings({ master: 0.3, muted: true });
    await first.whenSaved;
    expect(saves).toEqual([
      [UI_AUDIO_STORAGE_KEY, { ...DEFAULT_UI_AUDIO_SETTINGS, master: 0.3, muted: true }],
    ]);
    expect(UI_AUDIO_STORAGE_KEY.startsWith('device.')).toBe(true);

    const second = kit({ store }).kit;
    await second.restore();
    expect(second.settings).toMatchObject({ master: 0.3, muted: true });

    const broken = memoryStore({ [UI_AUDIO_STORAGE_KEY]: { master: 'çok', ui: 7 } });
    const third = kit({ store: broken.store }).kit;
    await third.restore();
    expect(third.settings).toEqual({ ...DEFAULT_UI_AUDIO_SETTINGS, ui: 1 });
  });

  it('okuma/yazma hatası bildirilir ve ayar korunur', async () => {
    const errors: string[] = [];
    const failing: UiAudioSettingsStore = {
      load: () => Promise.reject(new Error('okuma')),
      save: () => Promise.reject(new Error('yazma')),
    };
    const { kit: instance } = kit({
      store: failing,
      onError: (e) => errors.push((e as Error).message),
    });
    await instance.restore();
    instance.setSettings({ ui: 0.1 });
    await instance.whenSaved;
    expect(instance.settings.ui).toBe(0.1);
    expect(errors).toEqual(['okuma', 'yazma']);
  });
});

describe('olay sözlüğü', () => {
  it('her niyet türü ve ürün sonucu tanımlı bir ses olayına eşlenir', () => {
    for (const event of [...Object.values(UI_INTENT_SOUND), ...Object.values(UI_OUTCOME_SOUND)]) {
      expect(UI_SOUND_EVENTS).toContain(event);
    }
    expect(UI_INTENT_SOUND.valuePreview).toBe('sliderTick');
    expect([...UI_MICRO_EVENTS].sort()).toEqual(['focus', 'hover', 'sliderTick']);
    expect(UI_CRITICAL_EVENTS).toEqual(['alert', 'denied']);
    expect(UI_SOUND_EVENTS.length).toBe(25);
  });
});

describe('çalma: sıralı varyant, ±%5 perde, bağımsız RNG', () => {
  it('3 varyantı sırayla seçer (başlangıç RNG, sonrası döngü)', async () => {
    const { kit: instance, context } = await ready();
    for (let i = 0; i < 7; i++) {
      clock += 500;
      expect(instance.play('press')).toBe(true);
    }
    const order = playedUrls(context).map((url) => Number(url[1]));
    // Her adım bir öncekinin (mod 3) ardılıdır.
    for (let i = 1; i < order.length; i++) expect(order[i]).toBe((order[i - 1] + 1) % 3);
  });

  it('perde her tetiklemede ±%5 içinde değişir', async () => {
    const { kit: instance, context } = await ready();
    for (let i = 0; i < 30; i++) {
      clock += 500;
      instance.play('press');
      context.sources.at(-1)!.onended?.();
    }
    const rates = context.sources.map((source) => source.playbackRate.value);
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.05);
    expect(new Set(rates.map((r) => r.toFixed(4))).size).toBeGreaterThan(5);
  });

  it('RNG akışı bağımsızdır ve tohumludur: Math.random hiç çağrılmaz, aynı tohum aynı dizi', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const run = async (seed: number): Promise<string[]> => {
      const made = await ready({ seed });
      for (let i = 0; i < 6; i++) {
        clock += 500;
        made.kit.play('press');
        made.context.sources.at(-1)!.onended?.();
      }
      return playedUrls(made.context).concat(
        made.context.sources.map((s) => s.playbackRate.value.toFixed(5)),
      );
    };
    const a = await run(11);
    const b = await run(11);
    const c = await run(12);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('yüklenmemiş varyant atlanır; hiçbiri yüklenmediyse sessiz kalır', async () => {
    stubFetch(['p1.ogg']);
    const { kit: instance, context } = await ready();
    for (let i = 0; i < 6; i++) {
      clock += 500;
      expect(instance.play('press')).toBe(true);
    }
    expect(playedUrls(context)).not.toContain('p1.ogg');
    stubFetch(['t0.ogg', 't1.ogg', 't2.ogg']);
    const none = await ready();
    expect(none.kit.play('sliderTick')).toBe(false);
  });
});

describe('sıklık sınırı ve öncelik', () => {
  it('mikro olay 45 ms aralıkla sınırlıdır; kritik olay sınırdan muaftır', async () => {
    const { kit: instance, context } = await ready();
    expect(instance.play('sliderTick')).toBe(true);
    clock += 30;
    expect(instance.play('sliderTick')).toBe(false);
    clock += 20;
    expect(instance.play('sliderTick')).toBe(true);
    // Kritik olay arka arkaya çalar.
    expect(instance.play('denied')).toBe(true);
    expect(instance.play('denied')).toBe(true);
    expect(playedUrls(context).filter((url) => url.startsWith('e'))).toHaveLength(2);
  });

  it('toplam 4 ses; kritik normal sesleri düşürür, normal kritiği düşüremez', async () => {
    const { kit: instance, context } = await ready();
    for (let i = 0; i < 6; i++) {
      clock += 500;
      instance.play('press');
    }
    expect(context.active.length).toBeLessThanOrEqual(4);
    // Normaller doluyken kritik gelir: bir normal düşer, kritik çalar.
    expect(instance.play('denied')).toBe(true);
    expect(context.active.length).toBeLessThanOrEqual(4);
    expect(playedUrls(context).at(-1)).toMatch(/^e/);
    // Dört kritikle doldur; normal ses artık girmez.
    for (let i = 0; i < 4; i++) instance.play('denied');
    const before = context.sources.length;
    clock += 500;
    expect(instance.play('press')).toBe(false);
    expect(context.sources.length).toBe(before);
  });
});

describe('hata ve kısıt durumları', () => {
  it('bağlam hiç yoksa kit etkisiz (inert) kalır ve hiçbir çağrı fırlatmaz', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const instance = new UiSoundKit({ assets: ASSETS });
    expect(await instance.preload()).toEqual({ loaded: [], failed: [] });
    expect(instance.play('press')).toBe(false);
    await expect(instance.unlock()).resolves.toBeUndefined();
    expect(instance.state).toBe('inert');
  });

  it('bağlam kurulumu fırlatırsa etkisiz olur ve hata bir kez bildirilir', async () => {
    const onError = vi.fn();
    const contextFactory = vi.fn(() => {
      throw new Error('izin yok');
    });
    const instance = new UiSoundKit({ assets: ASSETS, contextFactory, onError });
    await instance.unlock();
    await instance.unlock();
    expect(instance.play('press')).toBe(false);
    expect(contextFactory).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(instance.state).toBe('inert');
  });

  it('ön yükleme hatası olayı sessiz bırakır, kiti çökertmez ve rapor eder', async () => {
    stubFetch(['e0.ogg', 'e1.ogg', 'e2.ogg', 's0.ogg']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { kit: instance } = kit();
    const report = await instance.preload();
    expect(report.loaded).toEqual(['press', 'sliderTick']);
    expect(report.failed).toEqual(['confirm', 'denied']);
    expect(instance.play('denied')).toBe(false);
    expect(instance.play('press')).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('ses başlatma hatası bildirilir, kit çalışmaya devam eder', async () => {
    const onError = vi.fn();
    const { kit: instance, context } = await ready({ onError });
    const original = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      throw new Error('kaynak yok');
    };
    expect(instance.play('press')).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    context.createBufferSource = original;
    clock += 500;
    expect(instance.play('press')).toBe(true);
  });

  it('asset olmayan olay sessizdir', async () => {
    const { kit: instance } = await ready();
    expect(instance.play('panelClose')).toBe(false);
  });
});

describe('kullanıcı jesti, arka plan, sessizlik ve geri dönüş', () => {
  it('bağlam ilk kullanıcı jestinde oluşturulur ve açılır; jestin kendi sesi çalar', async () => {
    const created = new FakeContext();
    const contextFactory = vi.fn(() => created as unknown as AudioContext);
    const bus = uiIntentBusFor(document.body);
    const instance = new UiSoundKit({ assets: ASSETS, contextFactory, now });
    instance.attach(bus.bus);
    expect(contextFactory).not.toHaveBeenCalled();
    expect(instance.state).toBe('locked');
    // Jestten ÖNCE çalma isteği atlanır.
    expect(instance.play('press')).toBe(false);
    await instance.preload(); // bağlam ön yükleme için kurulur ama kilitli kalır
    expect(created.state).toBe('suspended');
    const button = new Button('Tamam');
    document.body.append(button.element);
    button.element.click();
    expect(created.resume).toHaveBeenCalledTimes(1);
    expect(created.sources).toHaveLength(1); // aynı jestin sesi, açma sürerken
    await Promise.resolve();
    expect(instance.state).toBe('ready');
    bus.release();
  });

  it('gizlenince sesler kesilir, bağlam askıya alınır; gizliyken gelenler geri dönüşte ÇALMAZ', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    const fake = new EventTarget() as unknown as Document;
    Object.defineProperty(fake, 'visibilityState', { get: () => visibility });
    const { kit: instance, context } = await ready({ visibilityTarget: fake });
    instance.play('press');
    expect(context.active).toHaveLength(1);

    visibility = 'hidden';
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(context.active).toHaveLength(0);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    expect(instance.state).toBe('suspended');
    for (let i = 0; i < 5; i++) {
      clock += 500;
      expect(instance.play('press')).toBe(false);
    }
    const startedWhileHidden = context.sources.length;

    visibility = 'visible';
    fake.dispatchEvent(new Event('visibilitychange'));
    expect(context.resume).toHaveBeenCalled();
    await Promise.resolve();
    // Biriken hiçbir ses geri dönüşte topluca başlamaz.
    expect(context.sources.length).toBe(startedWhileHidden);
    clock += 500;
    expect(instance.play('press')).toBe(true);
  });

  it('sessizlik çalanları keser, çalmayı engeller, seviyeyi korur; kapatınca ses döner', async () => {
    const { kit: instance, context } = await ready();
    instance.play('press');
    instance.setSettings({ muted: true });
    expect(context.active).toHaveLength(0);
    clock += 500;
    expect(instance.play('press')).toBe(false);
    expect(instance.settings.ui).toBe(0.8);
    expect(context.gains[0].gain.value).toBe(0);
    instance.setSettings({ muted: false });
    expect(context.gains[0].gain.value).toBeCloseTo(0.8);
    expect(instance.play('press')).toBe(true);
  });

  it('stopAll (iptal) çalan her UI sesini keser', async () => {
    const { kit: instance, context } = await ready();
    instance.play('press');
    clock += 500;
    instance.play('press');
    expect(context.active).toHaveLength(2);
    instance.stopAll();
    expect(context.active).toHaveLength(0);
  });
});

describe('niyet veriyolu, sonuç ve kaynak temizliği', () => {
  it('niyetler sese döner; aynı veriyoluna ikinci attach ses çoğaltmaz', async () => {
    const bus = uiIntentBusFor(document.body);
    const { kit: instance, context } = await ready();
    instance.attach(bus.bus);
    instance.attach(bus.bus);
    const button = new Button('Tamam');
    document.body.append(button.element);
    button.element.click();
    expect(context.sources).toHaveLength(1);
    expect(bus.bus.listenerCount).toBe(1);
    bus.release();
  });

  it('Promise çözülmesi başarı sesi DEĞİLDİR; host reportOutcome ile bildirince çalar', async () => {
    const bus = uiIntentBusFor(document.body);
    const { kit: instance, context } = await ready();
    instance.attach(bus.bus);
    const button = new Button('Kaydet', { onClick: () => Promise.resolve() });
    document.body.append(button.element);
    button.element.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(playedUrls(context).filter((url) => url.startsWith('s'))).toEqual([]);
    clock += 500;
    bus.bus.reportOutcome(button.element, 'success');
    expect(playedUrls(context).filter((url) => url.startsWith('s'))).toEqual(['s0.ogg']);
    bus.release();
  });

  it('programatik ayar ve devre dışı hedef sessizdir (niyet yok, ses yok)', async () => {
    const bus = uiIntentBusFor(document.body);
    const { kit: instance, context } = await ready();
    instance.attach(bus.bus);
    const button = new Button('Pasif', { disabled: true });
    document.body.append(button.element);
    button.element.click();
    expect(context.sources).toHaveLength(0);
    bus.release();
  });

  it('kritik olay yapılandırılmış sidechain profiliyle kısar; profil yoksa kısmaz', async () => {
    const profile: DuckingProfile = { target: 0.5, attack: 0.12, hold: 0.08, release: 0.45 };
    const duck = vi.fn();
    const ducker = { duck } as unknown as SidechainDucker;
    const { kit: instance } = await ready({ duck: { ducker, profiles: { denied: profile } } });
    instance.play('press');
    expect(duck).not.toHaveBeenCalled();
    instance.play('denied');
    expect(duck).toHaveBeenCalledWith(profile);
  });

  it('dispose: sesleri keser, sahip olunan bağlamı kapatır, dinleyicileri ve niyetleri susturur', async () => {
    const bus = uiIntentBusFor(document.body);
    const created = new FakeContext();
    created.state = 'running';
    const instance = new UiSoundKit({
      assets: ASSETS,
      contextFactory: () => created as unknown as AudioContext,
      now,
    });
    instance.attach(bus.bus);
    await instance.preload();
    instance.play('press');
    expect(created.active).toHaveLength(1);
    instance.dispose();
    instance.dispose();
    expect(created.active).toHaveLength(0);
    expect(created.close).toHaveBeenCalledTimes(1);
    expect(instance.state).toBe('disposed');
    expect(bus.bus.listenerCount).toBe(0);
    expect(instance.play('press')).toBe(false);
    expect(instance.setSettings({ ui: 0 })).toEqual(instance.settings);
    bus.release();
  });

  it('dışarıdan verilen bağlam kit tarafından kapatılmaz', async () => {
    const { kit: instance, context } = await ready();
    instance.dispose();
    expect(context.close).not.toHaveBeenCalled();
  });

  it('ses erişimi kilitliyken ve resume reddedilse bile eylem aynen yapılır; ses yalnız eksik kalır', async () => {
    const bus = uiIntentBusFor(document.body);
    const locked = new FakeContext();
    locked.resume.mockImplementation(() => Promise.reject(new Error('jest yok')));
    const onError = vi.fn();
    const instance = new UiSoundKit({
      assets: ASSETS,
      context: locked as unknown as AudioContext,
      now,
      onError,
    });
    await instance.preload();
    instance.attach(bus.bus);
    const handler = vi.fn();
    const button = new Button('Kaydet', { onClick: handler });
    document.body.append(button.element);
    expect(() => button.element.click()).not.toThrow();
    await Promise.resolve();
    // Eylem (işlev ve görsel durum) sesten bağımsız gerçekleşti.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(button.element.getAttribute('aria-busy')).toBe('false');
    expect(onError).toHaveBeenCalledTimes(1);
    bus.release();
  });

  it('ölçüler: çalan ses, başlayan ve düşen istekler ayrı sayılır', async () => {
    const { kit: instance } = await ready();
    expect(instance.metrics).toEqual({ active: 0, played: 0, dropped: 0 });
    expect(instance.play('press')).toBe(true);
    expect(instance.metrics).toEqual({ active: 1, played: 1, dropped: 0 });
    // Sözlükte yüklü varyantı olmayan olay düşer; başlayan sayısı değişmez.
    expect(instance.play('valueCommit')).toBe(false);
    expect(instance.metrics.dropped).toBe(1);
    instance.stopAll();
    expect(instance.metrics.active).toBe(0);
    instance.setSettings({ muted: true });
    expect(instance.play('press')).toBe(false);
    expect(instance.metrics).toMatchObject({ played: 1, dropped: 2 });
  });
});
