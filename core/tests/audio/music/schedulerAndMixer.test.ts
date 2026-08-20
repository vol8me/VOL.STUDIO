import { describe, it, expect } from 'vitest';
import { MusicScheduler } from '../../../src/audio/music/scheduler';
import { MusicMixer } from '../../../src/audio/music/mixer';
import { FakeAudioContext } from './mock-audio';

/** MusicScheduler ve MusicMixer davranışını doğrular. */

describe('S15 — ölçü paydası hesaba katılır', () => {
  it('6/8 barı 4/4 barından farklı', () => {
    const common = new MusicScheduler(120, [4, 4]);
    const compound = new MusicScheduler(120, [6, 8]);

    // 120 bpm → dörtlük 0.5 sn. 4/4 barı = 4 × 0.5 = 2 sn.
    expect(common.beatDuration).toBeCloseTo(0.5, 6);
    expect(common.barDuration).toBeCloseTo(2, 6);

    // 6/8'de vuruş SEKİZLİK → 0.25 sn, bar = 6 × 0.25 = 1.5 sn.
    expect(compound.beatDuration).toBeCloseTo(0.25, 6);
    expect(compound.barDuration).toBeCloseTo(1.5, 6);
  });

  it('2/2 (cut time) doğru hesaplanır', () => {
    const cut = new MusicScheduler(120, [2, 2]);
    expect(cut.beatDuration).toBeCloseTo(1, 6);
    expect(cut.barDuration).toBeCloseTo(2, 6);
  });
});

describe('S23 — geçersiz tempo/ölçü reddedilir', () => {
  it('bpm 0 veya negatifse fırlatır', () => {
    expect(() => new MusicScheduler(0)).toThrow(/bpm pozitif/i);
    expect(() => new MusicScheduler(-120)).toThrow(/bpm pozitif/i);
    expect(() => new MusicScheduler(Number.NaN)).toThrow(/bpm pozitif/i);
  });

  it('geçersiz ölçü fırlatır', () => {
    expect(() => new MusicScheduler(120, [0, 4])).toThrow(/ölçü/i);
    expect(() => new MusicScheduler(120, [4, 0])).toThrow(/ölçü/i);
  });
});

describe('S22 — sınırdaki "sonraki" gerçekten sonraki', () => {
  it('tam bar sınırında bir sonraki barı döner', () => {
    const scheduler = new MusicScheduler(120, [4, 4]); // bar = 2 sn

    // t=0 tam bar başı → sonraki bar 2 sn'de olmalı, 0'da değil.
    expect(scheduler.getNextBarTime(0, 0)).toBeCloseTo(2, 6);
    // t=2 yine tam sınır → 4.
    expect(scheduler.getNextBarTime(2, 0)).toBeCloseTo(4, 6);
    // Sınır dışı bir an normal davranır.
    expect(scheduler.getNextBarTime(0.5, 0)).toBeCloseTo(2, 6);
  });

  it('tam vuruş sınırında bir sonraki vuruşu döner', () => {
    const scheduler = new MusicScheduler(120, [4, 4]); // vuruş = 0.5 sn

    expect(scheduler.getNextBeatTime(0, 0)).toBeCloseTo(0.5, 6);
    expect(scheduler.getNextBeatTime(0.5, 0)).toBeCloseTo(1, 6);
    expect(scheduler.getNextBeatTime(0.2, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('S9/S10 — mixer sustur/aç ve rampalar', () => {
  function setup() {
    const context = new FakeAudioContext();
    const mixer = new MusicMixer(context as unknown as AudioContext, { compressor: false });
    const gain = mixer.masterGain.gain as unknown as { value: number; advanceTo(t: number): void };
    const settle = (): void => {
      context.currentTime += 1;
      gain.advanceTo(context.currentTime);
    };
    return { context, mixer, gain, settle };
  }

  it('mute(false) ayarlanan seviyeye döner', () => {
    const { mixer, gain, settle } = setup();

    mixer.setMasterGain(0.3, 0);
    expect(gain.value).toBeCloseTo(0.3, 6);

    mixer.mute(true);
    settle();
    expect(gain.value).toBe(0);

    mixer.mute(false);
    settle();
    // Sessizlik kapatıldığında kazanç ayarlanan seviyeye dönmeli.
    expect(gain.value).toBeCloseTo(0.3, 6);
  });

  it('mute açıkken setMasterGain sesi geri açmaz', () => {
    const { mixer, gain, settle } = setup();

    mixer.mute(true);
    settle();
    mixer.setMasterGain(0.7, 0);
    settle();
    expect(gain.value).toBe(0);

    mixer.mute(false);
    settle();
    expect(gain.value).toBeCloseTo(0.7, 6);
  });

  it('kanal fade-out hedefe TAM varır', () => {
    const context = new FakeAudioContext();
    const mixer = new MusicMixer(context as unknown as AudioContext, { compressor: false });
    const channel = mixer.createChannel('a');
    const gain = channel.gain as unknown as { value: number; advanceTo(t: number): void };

    mixer.setChannelGain('a', 1, 0);
    expect(gain.value).toBeCloseTo(1, 6);

    mixer.setChannelGain('a', 0, 0.5);
    context.currentTime += 0.5;
    gain.advanceTo(context.currentTime);

    // Fade-out sonunda hedef gain 0'a tam olarak ulaşmalı.
    expect(gain.value).toBe(0);
  });

  it('clear tüm kanalları bırakır', () => {
    const context = new FakeAudioContext();
    const mixer = new MusicMixer(context as unknown as AudioContext, { compressor: false });

    mixer.createChannel('a');
    mixer.createChannel('b');
    expect(mixer.getChannel('a')).toBeDefined();

    mixer.clear();
    expect(mixer.getChannel('a')).toBeUndefined();
    expect(mixer.getChannel('b')).toBeUndefined();
  });
});
