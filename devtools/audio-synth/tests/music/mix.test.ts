import { describe, expect, it } from 'vitest';
import { planMastering } from '../../src/music/mastering';
import { resolveMusicMix } from '../../src/music/mix';
import { validateMusicProgram } from '../../src/music/program';
import { renderMusicStem, REFERENCE_MIX_ID } from '../../src/music/stem';
import { AudioParamError } from '../../src/guard/errors';
import { hashCanonical } from '../../src/protocol/canonical';
import { clone, unitAdaptiveProgram, unitProgram } from './fixtures';

/**
 * Müzik bus/send grafiği (Dalga 10): drum/music stem'leri ayrı bus'lara
 * yönlenir, ortak return paylaşılır ve stem toplamı referans mix'e −90 dBFS
 * içinde eşit kalır. Doğrusal olmayan bus'a birden çok stem ve adaptive'de
 * stem'ler arası sidechain adıyla reddedilir.
 */
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});

const ADAPTIVE_MIX = {
  routes: { bass: 'drums', keys: 'music', lead: 'music' },
  laneSends: {
    bass: [{ bus: 'room', levelDb: -18 }],
    keys: [{ bus: 'room', levelDb: -12 }],
    lead: [{ bus: 'room', levelDb: -9 }],
  },
  buses: {
    drums: { effects: [node('effect.compressor', { thresholdDb: -24, ratio: 6 })], gainDb: -1 },
    music: { effects: [node('effect.eq-shelf', { edge: 'high', frequency: 4000, gainDb: -4 })] },
    room: { effects: [node('effect.reverb', { amount: 1, decay: 1.2 })], gainDb: -3 },
  },
};

function stemDocument(music: Record<string, unknown>, stem: string) {
  return {
    schema: 'MusicStemProgramV1',
    stem,
    mastering: planMastering({ playback: 'adaptiveLoop', targetLufs: -16, measuredLufs: -20 }),
    music,
  };
}

const rejects = (fn: () => unknown, issue: string, fragment: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AudioParamError);
    expect((error as AudioParamError).issue).toBe(issue);
    expect((error as Error).message).toContain(fragment);
    return;
  }
  throw new Error('reddedilmedi');
};

/*
 * Stem render'ları GERÇEK ses render eder; kapsam ölçümü (v8) sentezi birkaç
 * kat yavaşlatır ve 5 saniyelik varsayılan dolar (ölçülen: en ağır test
 * 15 sn). Süre sınırı bu yüzden blok başına verilir — ölçülen bir kısıt,
 * keyfi bir sayı değil.
 */
const HEAVY = { timeout: 60_000 };

describe('müzik bus grafiği', HEAVY, () => {
  it('drum/music stemleri ayrı bus’lara yönlenir; stem toplamı mix’e eşit (≤ −90 dBFS)', () => {
    const music = unitAdaptiveProgram({ mix: ADAPTIVE_MIX });
    const mix = renderMusicStem(stemDocument(music, REFERENCE_MIX_ID));
    const stems = ['bed', 'pulse', 'lead'].map((stem) =>
      renderMusicStem(stemDocument(music, stem)),
    );
    let worst = 0;
    mix.channels.forEach((channel, ch) => {
      for (let i = 0; i < channel.length; i++) {
        const sum = stems.reduce((acc, s) => acc + s.channels[ch][i], 0);
        worst = Math.max(worst, Math.abs(sum - channel[i]));
      }
    });
    expect(20 * Math.log10(worst + 1e-30)).toBeLessThan(-90);
    const plain = renderMusicStem(stemDocument(unitAdaptiveProgram(), REFERENCE_MIX_ID));
    expect(hashCanonical([...plain.channels[0].slice(0, 4000)])).not.toBe(
      hashCanonical([...mix.channels[0].slice(0, 4000)]),
    );
  });

  it('mix’siz program eski yoldan render edilir (bus grafiği isteğe bağlıdır)', () => {
    const music = unitAdaptiveProgram();
    expect(validateMusicProgram(music).mix).toBeUndefined();
    const a = renderMusicStem(stemDocument(music, 'bed'));
    const b = renderMusicStem(stemDocument(clone(music), 'bed'));
    expect(a.channels[0]).toEqual(b.channels[0]);
  });

  it('doğrusal olmayan bus birden çok stem’den beslenemez', () => {
    const mix = clone(ADAPTIVE_MIX);
    (mix.buses.music as Record<string, unknown>).effects = [node('effect.saturation')];
    rejects(() => validateMusicProgram(unitAdaptiveProgram({ mix })), 'combination', 'tek stem');
  });

  it('adaptive’de stem’ler arası sidechain reddedilir; loop’ta anahtar tam score’dan gelir', () => {
    const mix = clone(ADAPTIVE_MIX);
    (mix.buses.drums as Record<string, unknown>).effects = [
      { ...node('effect.compressor', { thresholdDb: -30, ratio: 8 }), sidechain: 'lead' },
    ];
    rejects(
      () => validateMusicProgram(unitAdaptiveProgram({ mix })),
      'combination',
      'pişmiş ducking',
    );
    const loopMix = {
      routes: { bass: 'low' },
      buses: {
        low: {
          effects: [
            { ...node('effect.compressor', { thresholdDb: -40, ratio: 10 }), sidechain: 'lead' },
          ],
        },
      },
    };
    const ducked = renderMusicStem({
      schema: 'MusicStemProgramV1',
      stem: REFERENCE_MIX_ID,
      mastering: planMastering({ playback: 'loop', targetLufs: -16, measuredLufs: -20 }),
      music: unitProgram({ mix: loopMix }),
    });
    const flat = renderMusicStem({
      schema: 'MusicStemProgramV1',
      stem: REFERENCE_MIX_ID,
      mastering: planMastering({ playback: 'loop', targetLufs: -16, measuredLufs: -20 }),
      music: unitProgram({ mix: { routes: { bass: 'low' }, buses: { low: {} } } }),
    });
    let energyDucked = 0;
    let energyFlat = 0;
    for (let i = 0; i < ducked.channels[0].length; i++) {
      energyDucked += ducked.channels[0][i] ** 2;
      energyFlat += flat.channels[0][i] ** 2;
    }
    expect(energyDucked).toBeLessThan(energyFlat);
  });

  it('bus sidechain kaynağı müzikte kabul edilmez; bilinmeyen rota adıyla reddedilir', () => {
    const lanes = [
      { id: 'a', stem: 'x' },
      { id: 'b', stem: 'x' },
    ];
    rejects(
      () =>
        resolveMusicMix(
          {
            routes: { a: 'one' },
            buses: {
              one: {},
              two: { effects: [{ ...node('effect.compressor'), sidechain: 'one' }] },
            },
            laneSends: { b: [{ bus: 'two', levelDb: -6 }] },
          },
          'mix',
          lanes,
          'loop',
          44100,
        ),
      'combination',
      'şerittir',
    );
    rejects(
      () => resolveMusicMix({ routes: { a: 'nowhere' }, buses: {} }, 'mix', lanes, 'loop', 44100),
      'unknown-id',
      'tanımlı bus',
    );
  });

  it('grafik deterministik: anahtar sırası çözümü ve kanonik özeti değiştirmez', () => {
    const lanes = [
      { id: 'bass', stem: 'bed' },
      { id: 'keys', stem: 'pulse' },
      { id: 'lead', stem: 'lead' },
    ];
    const reversed = {
      buses: Object.fromEntries(Object.entries(ADAPTIVE_MIX.buses).reverse()),
      laneSends: ADAPTIVE_MIX.laneSends,
      routes: ADAPTIVE_MIX.routes,
    };
    const a = resolveMusicMix(ADAPTIVE_MIX, 'mix', lanes, 'adaptiveLoop', 44100);
    const b = resolveMusicMix(reversed, 'mix', lanes, 'adaptiveLoop', 44100);
    expect(a.buses.map((bus) => bus.name)).toEqual(b.buses.map((bus) => bus.name));
    expect(hashCanonical(ADAPTIVE_MIX)).toBe(hashCanonical(reversed));
  });
});
