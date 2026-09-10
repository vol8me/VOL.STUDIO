import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSettings, AudioSettingsData } from '@/app/AudioSettings';
import { sfxDucking } from '@/config/audio';
import { soundAssets, type SoundEvent } from '@/config/sounds';
import { FakeAudioContext } from '../mocks/audio';

const { engines, duckers } = vi.hoisted(() => ({
  engines: [] as Array<
    Record<string, ReturnType<typeof vi.fn>> & {
      options: unknown;
      mixer: { output: Record<string, ReturnType<typeof vi.fn>> };
    }
  >,
  duckers: [] as Array<{
    gain: object;
    duck: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }>,
}));

/*
 * Müzik motoru ve sidechain CORE'da ayrıca test edilir. Burada ölçülen şey
 * GameAudio'nun kendi işi: yönlendirme, ayar uygulama, susturma, ducking ve
 * yaşam döngüsü.
 */
vi.mock('@volstudio/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@volstudio/core');
  class FakeMusicEngine {
    readonly mixer = { output: { connect: vi.fn(), disconnect: vi.fn() } };
    readonly loadTrack = vi.fn(() => Promise.resolve(true));
    readonly play = vi.fn(() => Promise.resolve());
    readonly crossfadeTo = vi.fn(() => Promise.resolve());
    readonly stop = vi.fn();
    readonly setState = vi.fn();
    readonly setMasterVolume = vi.fn();
    readonly dispose = vi.fn();
    constructor(readonly options: unknown) {
      engines.push(this as never);
    }
  }
  class FakeDucker {
    readonly gain = {};
    readonly duck = vi.fn();
    readonly dispose = vi.fn();
    constructor() {
      duckers.push(this);
    }
  }
  return { ...actual, MusicEngine: FakeMusicEngine, SidechainDucker: FakeDucker };
});

const { GameAudio } = await import('@/app/GameAudio');

const BASE: AudioSettingsData = {
  masterVolume: 0.8,
  sfxVolume: 0.7,
  musicVolume: 0.6,
  ambientVolume: 0.5,
  muted: false,
} as AudioSettingsData;

function fakeSettings(initial: Partial<AudioSettingsData> = {}) {
  let data = { ...BASE, ...initial };
  const listeners = new Set<(next: AudioSettingsData) => void>();
  const settings = {
    getData: () => data,
    getMusicVolume: () => data.musicVolume,
    getAmbientVolume: () => data.ambientVolume,
    isMuted: () => data.muted,
    onChange: (listener: (next: AudioSettingsData) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const change = (patch: Partial<AudioSettingsData>) => {
    data = { ...data, ...patch };
    for (const listener of listeners) listener(data);
  };
  return { settings: settings as unknown as AudioSettings, change, listeners };
}

function build(initial: Partial<AudioSettingsData> = {}) {
  const { settings, change, listeners } = fakeSettings(initial);
  const audio = new GameAudio(settings);
  const context = audio.context as unknown as FakeAudioContext;
  const internals = audio as unknown as {
    masterGain: { gain: { value: number }; connect: ReturnType<typeof vi.fn> };
    limiter: Record<string, { value: number }> & { connect: ReturnType<typeof vi.fn> };
  };
  const [music, ambient] = engines;
  const [musicDucker, ambientDucker] = duckers;
  return {
    audio,
    context,
    change,
    listeners,
    internals,
    music,
    ambient,
    musicDucker,
    ambientDucker,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  engines.length = 0;
  duckers.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GameAudio — kurulum', () => {
  it('Web Audio yoksa açık bir hatayla durur', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const { settings } = fakeSettings();

    expect(() => new GameAudio(settings)).toThrow(/Web Audio API desteklenmiyor/);
  });

  it('master zinciri limiter üzerinden hedefe bağlanır', () => {
    const { context, internals } = build();

    expect(internals.masterGain.connect).toHaveBeenCalledWith(internals.limiter);
    expect(internals.limiter.connect).toHaveBeenCalledWith(context.destination);
    expect(internals.limiter.threshold.value).toBe(-6);
    expect(internals.limiter.ratio.value).toBe(20);
  });

  it('müzik ve ambiyans kendi duck kazancına yönlenir ve ayar düzeyiyle açılır', () => {
    const { music, ambient, musicDucker, ambientDucker } = build();

    expect(music.mixer.output.disconnect).toHaveBeenCalled();
    expect(music.mixer.output.connect).toHaveBeenCalledWith(musicDucker.gain);
    expect(ambient.mixer.output.connect).toHaveBeenCalledWith(ambientDucker.gain);
    expect(music.options).toMatchObject({ masterVolume: BASE.musicVolume });
    expect(ambient.options).toMatchObject({
      masterVolume: BASE.musicVolume * BASE.ambientVolume,
    });
  });
});

describe('GameAudio — ayarlar', () => {
  it('açılışta ayarları uygular; ambiyans müzik düzeyine bağlıdır', () => {
    const { audio, internals, music, ambient } = build();

    expect(internals.masterGain.gain.value).toBe(BASE.masterVolume);
    expect(music.setMasterVolume).toHaveBeenCalledWith(BASE.musicVolume, 0.05);
    expect(ambient.setMasterVolume).toHaveBeenCalledWith(
      BASE.musicVolume * BASE.ambientVolume,
      0.05,
    );
    expect(audio.sfx).toBeDefined();
  });

  it('ayar değişince yeniden uygular; sessiz mod master düzeyini sıfırlar', () => {
    const { change, internals, music } = build();

    change({ muted: true, musicVolume: 0.2 });

    expect(internals.masterGain.gain.value).toBe(0);
    expect(music.setMasterVolume).toHaveBeenLastCalledWith(0.2, 0.05);
  });

  it('sessizken SFX, müzik ve ambiyans hiç çalmaz', async () => {
    const { audio, music, ambient } = build({ muted: true });
    const play = vi.spyOn(audio.sfx, 'play');

    await audio.playSfx('menuBlip');
    await audio.playMusic('menu');
    await audio.playAmbient('wind');

    expect(play).not.toHaveBeenCalled();
    expect(music.play).not.toHaveBeenCalled();
    expect(ambient.play).not.toHaveBeenCalled();
  });
});

describe('GameAudio — SFX', () => {
  it('kesilecek olayları çalmadan ÖNCE durdurur ve ducking profilini uygular', async () => {
    const { audio, musicDucker, ambientDucker } = build();
    const order: string[] = [];
    vi.spyOn(audio.sfx, 'stopEvent').mockImplementation(
      (event) => void order.push(`stop:${event}`),
    );
    vi.spyOn(audio.sfx, 'play').mockImplementation((event) => {
      order.push(`play:${event}`);
      return Promise.resolve();
    });

    await audio.playSfx('death', { stopEvents: ['hurt'] });

    expect(order).toEqual(['stop:hurt', 'play:death']);
    expect(musicDucker.duck).toHaveBeenCalledWith(sfxDucking.death?.music);
    expect(ambientDucker.duck).toHaveBeenCalledWith(sfxDucking.death?.ambient);
  });

  it('profili olmayan olay müziği bastırmaz', async () => {
    const { audio, musicDucker, ambientDucker } = build();
    vi.spyOn(audio.sfx, 'play').mockResolvedValue();
    const quiet = (Object.keys(soundAssets) as SoundEvent[]).find((event) => !sfxDucking[event]);
    expect(quiet).toBeDefined();

    await audio.playSfx(quiet!);

    expect(musicDucker.duck).not.toHaveBeenCalled();
    expect(ambientDucker.duck).not.toHaveBeenCalled();
  });

  it('çalma hatası yutulur ve uyarı olarak kalır', async () => {
    const { audio } = build();
    vi.spyOn(audio.sfx, 'play').mockRejectedValue(new Error('bozuk'));

    await expect(audio.playSfx('menuBlip')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('bütün SFX yüklenir; bozuk bir dosya diğerlerini engellemez', async () => {
    const { audio } = build();
    const events = Object.keys(soundAssets) as SoundEvent[];
    const load = vi
      .spyOn(audio.sfx, 'load')
      .mockImplementation((event) =>
        event === events[0] ? Promise.reject(new Error('bozuk')) : Promise.resolve(),
      );

    await audio.loadAllSfx();

    expect(load).toHaveBeenCalledTimes(events.length);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('oyun seslerini keserken arayüz geri bildirimini korur', () => {
    const { audio } = build();
    const except = vi.spyOn(audio.sfx, 'stopAllExcept').mockImplementation(() => {});
    const all = vi.spyOn(audio.sfx, 'stopAll').mockImplementation(() => {});

    audio.stopGameplaySfx();
    audio.stopAllSfx();

    const kept = except.mock.calls[0][0];
    expect(kept).toContain('menuBlip');
    expect(kept).toContain('pause');
    expect(kept).not.toContain('death');
    expect(all).toHaveBeenCalledTimes(1);
  });
});

describe('GameAudio — müzik ve ambiyans', () => {
  it('crossfade ile düz çalma ayrı yollardan gider', async () => {
    const { audio, music } = build();

    await audio.playMusic('battle', { crossfade: true, fadeIn: 3 });
    await audio.playMusic('menu', { fadeIn: 1 });

    expect(music.crossfadeTo).toHaveBeenCalledWith('battle', 3, { state: {} });
    expect(music.play).toHaveBeenCalledWith('menu', { fadeIn: 1 });
  });

  it('ambiyans aynı sözleşmeyi izler; crossfade varsayılanı 2 sn', async () => {
    const { audio, ambient } = build();

    await audio.playAmbient('wind', { crossfade: true });
    await audio.playAmbient('rain');

    expect(ambient.crossfadeTo).toHaveBeenCalledWith('wind', 2, { state: {} });
    expect(ambient.play).toHaveBeenCalledWith('rain', { fadeIn: undefined });
  });

  it('müzik ve ambiyans hataları yutulur', async () => {
    const { audio, music, ambient } = build();
    music.play.mockRejectedValue(new Error('yok'));
    ambient.play.mockRejectedValue(new Error('yok'));

    await expect(audio.playMusic('menu')).resolves.toBeUndefined();
    await expect(audio.playAmbient('wind')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('yükleme, durdurma ve durum komutları doğru motora iletilir', async () => {
    const { audio, music, ambient } = build();
    const track = { id: 't' } as never;

    await audio.loadMusic(track);
    await audio.loadAmbient(track);
    audio.stopMusic(3);
    audio.stopAmbient();
    audio.setMusicState({ intensity: 1 } as never, 0.2);

    expect(music.loadTrack).toHaveBeenCalledWith(track);
    expect(ambient.loadTrack).toHaveBeenCalledWith(track);
    expect(music.stop).toHaveBeenCalledWith({ fadeOut: 3 });
    expect(ambient.stop).toHaveBeenCalledWith({ fadeOut: 2 });
    expect(music.setState).toHaveBeenCalledWith({ intensity: 1 }, 0.2);
  });
});

describe('GameAudio — tarayıcı yaşam döngüsü', () => {
  it('ilk etkileşim askıdaki bağlamı sürdürür', () => {
    const { context } = build();
    context.state = 'suspended';
    const resume = vi.spyOn(context, 'resume');

    window.dispatchEvent(new Event('pointerdown'));

    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('sekme gizlenince askıya alır, dönünce sürdürür', () => {
    const { context } = build();
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const suspend = vi.spyOn(context, 'suspend');
    const resume = vi.spyOn(context, 'resume');

    document.dispatchEvent(new Event('visibilitychange'));
    expect(suspend).toHaveBeenCalledTimes(1);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('sürdürme ve askıya alma hataları uyarıya düşer', async () => {
    const { context } = build();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    vi.spyOn(context, 'suspend').mockRejectedValue(new Error('hayır'));

    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));

    expect(warn).toHaveBeenCalled();
  });

  it('dispose kaynakları BİR kez bırakır, bağlamı kapatır ve dinleyicileri söker', async () => {
    const { audio, context, listeners, music, ambient, musicDucker, ambientDucker } = build();
    const release = vi.spyOn(audio.sfx, 'release');
    const close = vi.spyOn(context, 'close');
    const suspend = vi.spyOn(context, 'suspend');

    await audio.dispose();
    await audio.dispose();

    for (const resource of [music, ambient, musicDucker, ambientDucker]) {
      expect(resource.dispose).toHaveBeenCalledTimes(1);
    }
    expect(release).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);

    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(suspend).not.toHaveBeenCalled();
  });

  it('kapalı bağlam yeniden kapatılmaz; kapatma hatası uyarıya düşer', async () => {
    const closed = build();
    closed.context.state = 'closed';
    const close = vi.spyOn(closed.context, 'close');
    await closed.audio.dispose();
    expect(close).not.toHaveBeenCalled();

    engines.length = 0;
    duckers.length = 0;
    const failing = build();
    vi.spyOn(failing.context, 'close').mockRejectedValue(new Error('hayır'));
    await failing.audio.dispose();
    expect(warn).toHaveBeenCalled();
  });
});
