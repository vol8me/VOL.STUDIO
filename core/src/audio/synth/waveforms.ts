import type { Waveform } from './types';

const TABLE_SIZE = 4096;

/** Sine lookup table — Math.sin çağrılarını önler, tutarlı ve hızlı. */
const SINE_TABLE = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  SINE_TABLE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);
}

/**
 * Bandlimited triangle tablosu — 200 tek harmonik (1/n² amplitüd).
 * İlk triangle isteğinde bir kez üretilir (tembel başlatma).
 *
 * NOT: "aliasing yok" değil, "naive triangle'a göre çok daha az aliasing".
 * Sabit harmonik sayılı bir tablo yalnızca tabloya göre bant sınırlıdır;
 * yüksek f0'da üst harmonikler yine katlanır.
 */
let triangleTable: Float32Array | null = null;

function getTriangleTable(): Float32Array {
  if (triangleTable) return triangleTable;

  const table = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    const phase = i / TABLE_SIZE;
    let s = 0;
    for (let n = 1; n <= 200; n += 2) {
      s += Math.sin(2 * Math.PI * n * phase) / (n * n);
    }
    // 8/π² normalizasyon → [-1, 1]
    table[i] = (s * 8) / (Math.PI * Math.PI);
  }
  triangleTable = table;
  return table;
}

/** Lookup table'dan linear interpolasyon ile örnek okur. */
function tableLookup(table: Float32Array, phase: number): number {
  const idx = phase * table.length;
  const i0 = Math.floor(idx) % table.length;
  const i1 = (i0 + 1) % table.length;
  const frac = idx - Math.floor(idx);
  return table[i0] + (table[i1] - table[i0]) * frac;
}

/**
 * PolyBLEP düzeltmesi — bir süreksizlik noktasındaki aliasing'i azaltır.
 * Yükselen kenarda EKLENİR, düşen kenarda ÇIKARILIR.
 */
function polyblep(phase: number, inc: number): number {
  // Süreksizlikten hemen sonra
  if (phase < inc) {
    const t = phase / inc;
    return t + t - t * t - 1;
  }
  // Süreksizlikten hemen önce (faz sarmadan)
  if (phase > 1 - inc) {
    const t = (phase - 1) / inc;
    return t * t + t + t + 1;
  }
  return 0;
}

/**
 * Genişliği ayarlanabilir dikdörtgen dalga, PolyBLEP ile bant sınırlı.
 *
 * `square` bunun `pulseWidth = 0.5` özel hali — ayrı bir uygulaması yok.
 */
function rectangleSample(phase: number, pulseWidth: number, phaseInc: number): number {
  let sample = phase < pulseWidth ? 1 : -1;

  if (phaseInc > 0) {
    // 0'da yükselen kenar (+2 sıçrama) → BLEP eklenir.
    sample += polyblep(phase, phaseInc);
    // pulseWidth'te düşen kenar (-2 sıçrama) → BLEP çıkarılır.
    sample -= polyblep((phase - pulseWidth + 1) % 1, phaseInc);
  }

  return sample;
}

/** Verilen faz (0-1 döngü) ve dalga şekli için bir örnek döner. */
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
      return tableLookup(getTriangleTable(), phase);
    case 'sawtooth': {
      let sample = 2 * phase - 1;
      if (phaseInc > 0) {
        sample -= polyblep(phase, phaseInc);
      }
      return sample;
    }
    case 'square':
      return rectangleSample(phase, 0.5, phaseInc);
    case 'pulse':
      return rectangleSample(phase, pulseWidth, phaseInc);
    default:
      return 0;
  }
}

/**
 * SABİT frekanslı bir dalga için örnek döner (faz mutlak zamandan türetilir).
 *
 * DİKKAT: Yalnızca frekans zaman içinde DEĞİŞMEDİĞİNDE doğrudur. Değişen
 * frekansta faz, frekansın integralidir; `freq * t` kullanmak duyulan frekansı
 * bozar (lineer slide'da nota sonunda `2·f₁ - f₀` duyulur). Modülasyonlu
 * sentez için `getWaveSampleWithPhase()` ile faz biriktirilmelidir —
 * bkz. `engine.ts` içindeki `advancePhase()`.
 */
export function getWaveSampleConstantFreq(
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
