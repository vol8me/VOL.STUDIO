import { describe, expect, it } from 'vitest';
import { powerSpectrum } from '../src/analysis/spectrum';
import { synthesize } from '../src/engine/synthesize';
import { blampResidual, BLEP_RADIUS } from '../src/synthesis/waveforms';
import { RENDER_BLOCK } from './support/timeouts';

const RATE = 44100;

function sample(wave: 'sawtooth' | 'square' | 'triangle', f: number): Float32Array {
  return synthesize({
    sampleRate: RATE,
    duration: 0.7,
    wave,
    frequency: f,
    normalize: false,
    envelope: { attack: 0, sustain: 1, release: 0, sustainLevel: 1 },
  }).channels[0];
}

/** Kafes dışı / kafes gücü (dB): harmonik olmayan her enerji katlanmadır. */
function aliasDb(x: Float32Array, f: number): number {
  const size = 16384;
  const power = powerSpectrum(x, Math.floor(0.25 * RATE), size);
  const binHz = RATE / size;
  const top = Math.floor((0.4535 * RATE) / binHz);
  const on = new Uint8Array(top + 1);
  for (let k = 0; k <= 5; k++) on[k] = 1;
  for (let m = 1; m * f <= 0.4535 * RATE + 5 * binHz; m++) {
    const c = Math.round((m * f) / binHz);
    for (let k = c - 5; k <= c + 5; k++) if (k >= 0 && k <= top) on[k] = 1;
  }
  let signal = 0;
  let alias = 0;
  for (let k = 0; k <= top; k++) {
    if (on[k]) signal += power[k];
    else alias += power[k];
  }
  return 10 * Math.log10(Math.max(alias / signal, 1e-30));
}

/**
 * Motor osilatör alias'ı ÖLÇÜLEREK kilitlenir: sınır ölçülen değerin 2 dB
 * üstüdür. Tam ızgara `scripts/research/polyblep-alias-report.ts` ile koşulur; bu
 * dosya temsil noktalarını ve F6a'nın sözleşme hedefini taşır.
 *
 * F6a öncesi 3.6 kHz testere ~−47 dB ölçülüyordu; pencerelenmiş-sinc BLEP
 * rezidüeli sonrası −88.3 dB. Retro yolun kilidi `tests/retro.test.ts`te.
 */
describe('motor osilatör alias kilidi', RENDER_BLOCK, () => {
  const limits: [wave: 'sawtooth' | 'square', f: number, limit: number][] = [
    ['sawtooth', 233, -86],
    ['sawtooth', 917, -87],
    ['sawtooth', 3600, -86],
    ['sawtooth', 5500, -86],
    ['sawtooth', 8000, -89],
    ['square', 233, -85],
    ['square', 917, -87],
    ['square', 3600, -85],
    ['square', 5500, -86],
  ];
  it.each(limits)('%s @ %d Hz ≤ %d dB', (wave, f, limit) => {
    expect(aliasDb(sample(wave, f), f)).toBeLessThanOrEqual(limit);
  });

  it('F6a sözleşme hedefi: 3.6 kHz testere < −70 dB', () => {
    expect(aliasDb(sample('sawtooth', 3600), 3600)).toBeLessThan(-70);
  });
});

/**
 * R2e üçgen taşıyıcı: sabit harmonik tablosu yerini naif üçgen + BLAMP
 * (BLEP rezidüelinin integrali) eğim-düzeltmesine bıraktı. 5 kHz'de tablo
 * yolu ~−43.3 dB ölçülüyordu; BLAMP ile −60.4 dB. Sınır ölçülenin 2 dB
 * üstündedir.
 */
describe('üçgen BLAMP alias kilidi', RENDER_BLOCK, () => {
  const limits: [f: number, limit: number][] = [
    [917, -58],
    [3600, -58],
    [5000, -58],
    [8000, -58],
  ];
  it.each(limits)('triangle @ %d Hz ≤ %d dB', (f, limit) => {
    expect(aliasDb(sample('triangle', f), f)).toBeLessThanOrEqual(limit);
  });

  it('K2 sözleşme hedefi: 5 kHz üçgen < −55 dB', () => {
    expect(aliasDb(sample('triangle', 5000), 5000)).toBeLessThan(-55);
  });
});

describe('blampResidual özellikleri', () => {
  it('pencere dışında sıfırdır', () => {
    expect(blampResidual(-BLEP_RADIUS - 1)).toBe(0);
    expect(blampResidual(BLEP_RADIUS)).toBe(0);
    expect(blampResidual(BLEP_RADIUS + 3)).toBe(0);
  });

  it('pencere içinde sonlu ve sınırlıdır', () => {
    for (let d = -BLEP_RADIUS + 0.5; d < BLEP_RADIUS; d += 0.5) {
      expect(Number.isFinite(blampResidual(d))).toBe(true);
      expect(Math.abs(blampResidual(d))).toBeLessThanOrEqual(BLEP_RADIUS);
    }
  });

  it('uçlara sürekli sönümlenir (rezidüel sıfıra döner)', () => {
    expect(Math.abs(blampResidual(BLEP_RADIUS - 0.5))).toBeLessThan(1e-3);
    expect(Math.abs(blampResidual(-BLEP_RADIUS + 0.5))).toBeLessThan(1e-3);
  });
});
