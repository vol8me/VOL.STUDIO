import type { Waveform } from '../types';

const TABLE_SIZE = 4096;

/** Sine lookup table — Math.sin çağrılarını önler, tutarlı ve hızlı. */
const SINE_TABLE = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  SINE_TABLE[i] = Math.sin((2 * Math.PI * i) / TABLE_SIZE);
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
 * Bant sınırlı basamak düzeltmesi (BLEP rezidüeli) — süreksizliğin ±`BLEP_RADIUS`
 * örnek komşuluğuna Kaiser pencereli sinc integraliyle dağıtılır. İki örneklik
 * PolyBLEP'in iç oranda bıraktığı katlanmayı ≈90 dB durdurma bandına indirir
 * (ölçüm: `scripts/polyblep-alias-report.ts` ızgarası).
 *
 * Çekirdek durumsuzdur: her örnek, penceresi içine düşen bütün kenarların
 * rezidüel katkısını toplar — durum nesnesi gerekmez, tek örneklik çağrılar
 * (`getWaveSampleWithPhase`) ile birikimli mimari (`retro.ts` `addBlep`) aynı
 * çekirdeği paylaşır.
 */
export const BLEP_RADIUS = 16;
const BLEP_SUBSTEPS = 64;
const BLEP_BETA = 8.6;

let bandStepTable: Float32Array | null = null;

/** Düzenli terimli Bessel I0 — sinc'in hangi deterministik ortamda aynı değeri verir. */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const y = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= y / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

/** Kaiser penceresi, `u ∈ [-1, 1]`. */
function kaiser(u: number): number {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  return besselI0(BLEP_BETA * Math.sqrt(1 - a * a)) / besselI0(BLEP_BETA);
}

/**
 * Bant sınırlı birim basamak `b(Δ)` tablosu (Δ örnek cinsinden uzaklık):
 * `∫ sinc·Kaiser` kümülatif integrali, `b(−K)=0`, `b(K)=1` normalize.
 * İlk kullanımda bir kez üretilir; tamamen kapalı biçim — deterministiktir.
 */
function getBandStepTable(): Float32Array {
  if (bandStepTable) return bandStepTable;
  const len = 2 * BLEP_RADIUS * BLEP_SUBSTEPS + 1;
  const table = new Float32Array(len);
  const dx = 1 / (BLEP_SUBSTEPS * 8);
  const kernel = (u: number) =>
    (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u)) * kaiser(u / BLEP_RADIUS);
  let total = 0;
  for (let u = -BLEP_RADIUS + dx / 2; u < BLEP_RADIUS; u += dx) total += kernel(u) * dx;
  let acc = 0;
  let cursor = -BLEP_RADIUS;
  for (let i = 0; i < len; i++) {
    const target = -BLEP_RADIUS + i / BLEP_SUBSTEPS;
    while (cursor < target) {
      acc += kernel(cursor + dx / 2) * dx;
      cursor += dx;
    }
    table[i] = acc / total;
  }
  table[len - 1] = 1;
  bandStepTable = table;
  return table;
}

/** Bant sınırlı birim basamağın değeri (`Δ` örnek cinsinden, lineer ara değer). */
function bandStep(delta: number): number {
  if (delta <= -BLEP_RADIUS) return 0;
  if (delta >= BLEP_RADIUS) return 1;
  const table = getBandStepTable();
  const pos = (delta + BLEP_RADIUS) * BLEP_SUBSTEPS;
  // `pos` kayan nokta hatasıyla son hücrenin üst kenarına düşebilir;
  // `i+1`'in tablo dışına taşmaması için üstten kelepçelenir.
  const i = Math.min(Math.floor(pos), table.length - 2);
  const frac = pos - i;
  return table[i] + (table[i + 1] - table[i]) * frac;
}

/**
 * Birim basamak rezidüeli: `b(Δ) − u(Δ)` — naif basamağa eklenince bant
 * sınırlı basamağı verir. `d` örnek cinsinden kenara uzaklık (negatif = kenar
 * öncesi). |d| ≥ `BLEP_RADIUS` ise katkı sıfırdır.
 */
export function blepResidual(d: number): number {
  if (d <= -BLEP_RADIUS || d >= BLEP_RADIUS) return 0;
  return bandStep(d) - (d >= 0 ? 1 : 0);
}

let blampTable: Float32Array | null = null;

/**
 * Bant sınırlı ramp rezidüeli (BLAMP): `∫ blepResidual` — eğim
 * süreksizliğinde (üçgen köşesi) naif kırığa eklenince bant sınırlı
 * rampayı verir. Çekirdek simetrik olduğundan rezidüel her iki uçta
 * sıfıra sönümlenir; tablo ilk kullanımda bir kez üretilir.
 */
function getBlampTable(): Float32Array {
  if (blampTable) return blampTable;
  const steps = getBandStepTable();
  const len = steps.length;
  const dx = 1 / BLEP_SUBSTEPS;
  const table = new Float32Array(len);
  // ∫ blepResidual = ∫ bandStep − ∫ u: basamak terimi analitik çıkarılır,
  // bandStep parçalı doğrusal olduğundan yamuk toplamı tamdır — pencere
  // simetrisi sayesinde uç değer tam sıfıra döner, kenarda basamak kalmaz.
  let acc = 0;
  for (let i = 1; i < len; i++) {
    acc += ((steps[i - 1] + steps[i]) / 2) * dx;
    table[i] = acc - Math.max(0, -BLEP_RADIUS + i * dx);
  }
  blampTable = table;
  return table;
}

/** `d` örnek cinsinden köşeye uzaklık; |d| ≥ `BLEP_RADIUS` ise katkı sıfırdır. */
export function blampResidual(d: number): number {
  if (d <= -BLEP_RADIUS || d >= BLEP_RADIUS) return 0;
  const table = getBlampTable();
  const pos = (d + BLEP_RADIUS) * BLEP_SUBSTEPS;
  const i = Math.min(Math.floor(pos), table.length - 2);
  const frac = pos - i;
  return table[i] + (table[i + 1] - table[i]) * frac;
}

/**
 * Eğim süreksizliği düzeltmesi: faz ekseninde `at + k` konumlarındaki,
 * örnek başına `jump` büyüklüğündeki eğim sıçramalarının bu örneğe BLAMP
 * katkısı. `inc` örnek başına faz artışı; pencere içine düşen bütün
 * periyotların köşeleri toplanır.
 */
function slopeCorrection(phase: number, at: number, jump: number, inc: number): number {
  const span = BLEP_RADIUS * inc;
  let sum = 0;
  const first = Math.ceil(phase - at - span);
  const last = Math.floor(phase - at + span);
  for (let k = first; k <= last; k++) {
    sum += jump * inc * blampResidual((phase - at - k) / inc);
  }
  return sum;
}

/**
 * Faz ekseninde `at + k` konumlarındaki `h` genlikli sıçramaların bu örneğe
 * rezidüel katkısı. `inc` örnek başına faz artışıdır; pencere içine düşen
 * bütün periyotlar toplanır (yüksek inc'te komşu kenarlar üst üste biner).
 */
function edgeCorrection(phase: number, at: number, h: number, inc: number): number {
  const span = BLEP_RADIUS * inc;
  let sum = 0;
  const first = Math.ceil(phase - at - span);
  const last = Math.floor(phase - at + span);
  for (let k = first; k <= last; k++) {
    sum += h * blepResidual((phase - at - k) / inc);
  }
  return sum;
}

/**
 * Genişliği ayarlanabilir dikdörtgen dalga, PolyBLEP ile bant sınırlı.
 *
 * `square` bunun `pulseWidth = 0.5` özel hali — ayrı bir uygulaması yok.
 */
function rectangleSample(phase: number, pulseWidth: number, phaseInc: number): number {
  let sample = phase < pulseWidth ? 1 : -1;

  if (phaseInc > 0) {
    // 0'da yükselen kenar (+2 sıçrama), pulseWidth'te düşen kenar (−2).
    sample += edgeCorrection(phase, 0, 2, phaseInc);
    sample += edgeCorrection(phase, pulseWidth, -2, phaseInc);
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
    case 'triangle': {
      // Naif üçgen + köşe eğim sıçramalarına BLAMP (0.25'te −8, 0.75'te
      // +8 faz-eğimi). Sabit harmonik tablosunun yüksek f0 katlanmasını
      // taşımaz; `phaseInc ≤ 0` (LFO) ucuz naif yolda kalır.
      if (phaseInc <= 0) {
        if (phase < 0.25) return 4 * phase;
        if (phase < 0.75) return 2 - 4 * phase;
        return -4 + 4 * phase;
      }
      let sample = phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : -4 + 4 * phase;
      sample += slopeCorrection(phase, 0.25, -8, phaseInc);
      sample += slopeCorrection(phase, 0.75, 8, phaseInc);
      return sample;
    }
    case 'sawtooth': {
      let sample = 2 * phase - 1;
      if (phaseInc > 0) {
        sample += edgeCorrection(phase, 0, -2, phaseInc);
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
 * Periyodik dalga örnekleyicisinin tipi — v1 (`waveforms-v1`) ve v2
 * (`waveforms`) çekirdekleri aynı imzayı taşır; davul gibi çekirdeği
 * parametrik seçen yollar bu tip üzerinden enjekte edilir.
 */
export type WaveSampleFn = typeof getWaveSampleWithPhase;

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
