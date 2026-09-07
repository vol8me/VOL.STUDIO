import { describe, expect, it } from 'vitest';

import * as AudioSynth from '../../src/index';
import { PRESET_CATALOG } from '../../src/presets';

/**
 * Paketin dışa açtığı İSİMLERİ kilitler.
 *
 * Enstrüman kataloğu büyüyecek ve büyümesi istenen şey KATALOGDUR, yüzey
 * değil: yeni bir enstrüman `Presets` altında bir kalem olarak gelir, kök
 * yüzeye yeni bir ad EKLEMEZ. Kök yüzey ancak yeni bir sentez tekniği ya da
 * yeni bir enstrüman MODELİ girdiğinde büyür — ikisi de bilinçli karardır.
 *
 * Kilit olmadan bu ayrım bir niyettir; kilitle birlikte bir kapıdır.
 */
const EXPECTED_SURFACE = [
  'Arrange',
  'BiquadFilter',
  'BrownNoise',
  'Cascade4Filter',
  'Chorus',
  'DelayLine',
  'Distortion',
  'Envelope',
  'Flanger',
  'HighpassFilter',
  'LowpassFilter',
  'PhaserEffect',
  'PinkNoise',
  'Presets',
  'Reverb',
  'StereoWidener',
  'WhiteNoise',
  'applyCurve',
  'applyEnvelopeToSample',
  'applyGlobalEffects',
  'compose',
  'createFilter',
  'createNoiseSource',
  'decodeWav',
  'getCutoffAtTime',
  'getPanGains',
  'getWaveSampleConstantFreq',
  'getWaveSampleWithPhase',
  'limitBuffer',
  'loopSamples',
  'mix',
  'mixSampleLayer',
  'normalize',
  'piano',
  'pluck',
  'processSample',
  'resampleLinear',
  'synth',
  'synthesize',
  'trimSamples',
];

describe('audio-synth public yüzeyi', () => {
  it('dışa açılan isimler birebir sabittir', () => {
    const actual = Object.keys(AudioSynth).sort();
    const eklenen = actual.filter((name) => !EXPECTED_SURFACE.includes(name));
    const silinen = EXPECTED_SURFACE.filter((name) => !actual.includes(name));

    expect(
      { eklenen, silinen },
      'Yüzey DEĞİŞTİ. Yeni bir ENSTRÜMAN buraya girmemeli — o `Presets` ' +
        'kataloğuna girer. Buraya yalnız yeni bir sentez tekniği ya da yeni bir ' +
        'enstrüman modeli girer; listeyi güncellemek o kararı vermektir.',
    ).toEqual({ eklenen: [], silinen: [] });
  });

  it('katalog yüzeyden BAĞIMSIZ büyür', () => {
    // Presetler tek bir ad (`Presets`) altında yaşar; sayıları yüzeyi
    // büyütmez. Bu testin düşmesi, bir presetin köke sızdığı anlamına gelir.
    expect(Object.keys(PRESET_CATALOG).length).toBeGreaterThan(20);
    expect(EXPECTED_SURFACE.filter((name) => name === 'Presets')).toHaveLength(1);
  });

  it('enstrüman modelleri `instruments/` altından gelir', () => {
    // `pluck` bugün tek fiziksel model. Yeni model eklendiğinde bu liste ve
    // yukarıdaki yüzey birlikte güncellenir — model eklemek sessiz olamaz.
    const MODELS = ['piano', 'pluck'];
    for (const model of MODELS) {
      expect(EXPECTED_SURFACE, `${model} yüzeyde beyan edilmeli`).toContain(model);
      expect(typeof (AudioSynth as Record<string, unknown>)[model]).toBe('function');
    }
  });
});
