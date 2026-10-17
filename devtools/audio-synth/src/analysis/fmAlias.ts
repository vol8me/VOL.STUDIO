import { synthesize } from '../engine/synthesize';
import type { FmParams, Waveform } from '../types';
import { powerSpectrum } from './spectrum';

/**
 * FM alias ölçümü — kafes yöntemi.
 *
 * Periyodik bir modülatörle faz modülasyonu yalnız `fc + k·fm` çizgilerinde
 * enerji taşır; oran p/q ise bu çizgiler `fc/q` aralıklı bir kafese düşer.
 * Kafes dışındaki her enerji ya katlanmadır (alias) ya da modülatörün
 * periyodik olmamasıdır (kaotik feedback). Pencere 4 terimli Blackman-Harris
 * (±5 kutu ana lob); ölçüm işitilir bantla (≤ 0.4535·fs) sınırlıdır.
 * Bir alias çizgisi tesadüfen kafes çizgisinin lobuna düşerse sayılmaz: sonuç
 * ölçülmüş bir ALT sınırdır.
 */
export interface FmAliasMeasurement {
  /** Kafes dışı / kafes gücü (dB). */
  readonly aliasToSignalDb: number;
  /** En güçlü kafes dışı kutu / en güçlü kafes kutusu (dBc). */
  readonly worstSpurDbc: number;
}

const SAMPLE_RATE = 44100;
const FFT_SIZE = 16384;
const LOBE_BINS = 5;
const AUDIBLE_FRACTION = 0.4535;

function latticeDenominator(ratio: number): number {
  for (let q = 1; q <= 64; q++) {
    if (Math.abs(ratio * q - Math.round(ratio * q)) < 1e-9) return q;
  }
  throw new RangeError(`oran rasyonel bir kafese oturmuyor: ${ratio}`);
}

export function measureFmAlias(
  carrierWave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>,
  carrierFrequency: number,
  fm: FmParams,
): FmAliasMeasurement {
  const result = synthesize({
    sampleRate: SAMPLE_RATE,
    duration: 0.7,
    wave: carrierWave,
    frequency: carrierFrequency,
    normalize: false,
    envelope: { attack: 0, sustain: 1, release: 0, sustainLevel: 1 },
    fm,
  });
  const power = powerSpectrum(result.channels[0], Math.floor(0.25 * SAMPLE_RATE), FFT_SIZE);
  const binHz = SAMPLE_RATE / FFT_SIZE;
  const topBin = Math.floor((AUDIBLE_FRACTION * SAMPLE_RATE) / binHz);
  const grid = carrierFrequency / latticeDenominator(fm.ratio ?? 1);
  const onLattice = new Uint8Array(topBin + 1);
  for (let k = 0; k <= LOBE_BINS; k++) onLattice[k] = 1;
  for (let m = 1; m * grid <= AUDIBLE_FRACTION * SAMPLE_RATE + LOBE_BINS * binHz; m++) {
    const center = Math.round((m * grid) / binHz);
    for (let k = center - LOBE_BINS; k <= center + LOBE_BINS; k++) {
      if (k >= 0 && k <= topBin) onLattice[k] = 1;
    }
  }
  let signal = 0;
  let alias = 0;
  let strongest = 0;
  let worstSpur = 0;
  for (let k = 0; k <= topBin; k++) {
    if (onLattice[k]) {
      signal += power[k];
      strongest = Math.max(strongest, power[k]);
    } else {
      alias += power[k];
      worstSpur = Math.max(worstSpur, power[k]);
    }
  }
  const db = (ratio: number): number => 10 * Math.log10(Math.max(ratio, 1e-30));
  return {
    aliasToSignalDb: db(alias / signal),
    worstSpurDbc: db(worstSpur / strongest),
  };
}
