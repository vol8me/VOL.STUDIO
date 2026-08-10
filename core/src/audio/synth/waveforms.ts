import type { Waveform } from './types';

// Sine lookup table — Math.sin çağrılarını önler, tutarlı ve hızlı.
// 4096 sample, linear interpolasyon yeterli doğruluk verir.
const TABLE_SIZE = 4096;
const SINE_TABLE = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  SINE_TABLE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);
}

// Bandlimited triangle — additive synthesis ile üretilmiş.
// 200 tek harmonik (1/n² amplitüd) doğal triangle verir, aliasing yok.
// Düşük frekanslarda zengin harmonik, yüksek frekanslarda doğal sönüm.
const TRIANGLE_TABLE = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  const phase = i / TABLE_SIZE;
  let s = 0;
  for (let n = 1; n <= 200; n += 2) {
    s += Math.sin(2 * Math.PI * n * phase) / (n * n);
  }
  // 8/π² normalizasyon → [-1, 1]
  TRIANGLE_TABLE[i] = (s * 8) / (Math.PI * Math.PI);
}

/** Lookup table'dan linear interpolasyon ile örnek okur. */
function tableLookup(table: Float32Array, phase: number): number {
  const idx = phase * table.length;
  const i0 = Math.floor(idx) % table.length;
  const i1 = (i0 + 1) % table.length;
  const frac = idx - Math.floor(idx);
  return table[i0]! + (table[i1]! - table[i0]!) * frac;
}

/** PolyBLEP düzeltmesi — discontinuity noktasında anti-aliasing.
 *  Naive dalga şekline eklenerek aliasing'i azaltır. */
function polyblep(phase: number, inc: number): number {
  // phase 0 civarında discontinuity
  if (phase < inc) {
    const t = phase / inc;
    return t + t - t * t - 1;
  }
  // phase 1 civarında discontinuity
  if (phase > 1 - inc) {
    const t = (phase - 1) / inc;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Verilen faz (0-1 döngü) ve dalga şekli için bir örnek döner.
 *  Sine ve triangle lookup table, sawtooth/square/pulse PolyBLEP kullanır. */
export function getWaveSampleWithPhase(
  wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>,
  phase: number,
  pulseWidth = 0.5,
  phaseInc = 0,
): number {
  phase %= 1;
  if (phase < 0) phase += 1;

  switch (wave) {
    case 'sine':
      return tableLookup(SINE_TABLE, phase);
    case 'triangle':
      // Düşük frekanslarda (LFO vb.) naive triangle — hesaplama daha ucuz
      if (phaseInc <= 0) {
        if (phase < 0.25) return 4 * phase;
        if (phase < 0.75) return 2 - 4 * phase;
        return -4 + 4 * phase;
      }
      // Bandlimited triangle — lookup table, aliasing yok
      return tableLookup(TRIANGLE_TABLE, phase);
    case 'sawtooth': {
      let sample = 2 * phase - 1;
      if (phaseInc > 0) {
        sample += polyblep(phase, phaseInc);
      }
      return sample;
    }
    case 'square': {
      let sample = phase < 0.5 ? 1 : -1;
      if (phaseInc > 0) {
        // 0.5 noktasında discontinuity
        if (Math.abs(phase - 0.5) < phaseInc || phase < phaseInc) {
          const blep = polyblep(phase, phaseInc);
          const blepHalf = polyblep((phase - 0.5 + 1) % 1, phaseInc);
          sample += blep + blepHalf;
        }
      }
      return sample;
    }
    case 'pulse': {
      let sample = phase < pulseWidth ? 1 : -1;
      if (phaseInc > 0) {
        // pulseWidth ve 0 noktalarında discontinuity
        const blep0 = polyblep(phase, phaseInc);
        const blepPw = polyblep((phase - pulseWidth + 1) % 1, phaseInc);
        sample += blep0 - blepPw;
      }
      return sample;
    }
    default:
      return 0;
  }
}

/** Verilen dalga şekli ve frekans için bir örnek döner.
 *  phaseInc otomatik hesaplanır — PolyBLEP için gerekli. */
export function getWaveSample(
  wave: Exclude<Waveform, 'noise' | 'pink' | 'brown'>,
  freq: number,
  t: number,
  pulseWidth = 0.5,
  sampleRate = 44100,
): number {
  const phaseInc = freq / sampleRate;
  const phase = (freq * t) % 1;
  return getWaveSampleWithPhase(wave, phase, pulseWidth, phaseInc);
}
