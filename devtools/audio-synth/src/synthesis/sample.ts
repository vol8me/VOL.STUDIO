import type { EnvelopeParams, SampleParams } from '../types';
import { resolveSample } from '../guard/synthesis';
import { checkNumber, checkSampleRate } from '../guard/read';
import { assertRenderBudget } from '../guard/budget';
import { Envelope } from './envelope';

/**
 * WAVE_FORMAT_EXTENSIBLE alt biçim GUID'lerinin ortak soneki (KSDATAFORMAT_SUBTYPE_*):
 * `xxxxxxxx-0000-0010-8000-00aa00389b71`, ilk iki bayt dışındaki 14 bayt.
 */
const KSDATAFORMAT_SUFFIX = [0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];

const SPEAKER_FRONT_LEFT = 0x1;
const SPEAKER_FRONT_RIGHT = 0x2;
/** MSB ya da 0xFFFFFFFF "her yapılandırma" demektir; konum bilgisi taşımaz. */
const SPEAKER_ALL = 0x80000000;

interface WavFormat {
  effectiveFormat: 1 | 3;
  numChannels: number;
  wavSampleRate: number;
  bitsPerSample: number;
  validBits: number;
}

function lowestBits(mask: number, count: number): number {
  let out = 0;
  let found = 0;
  for (let bit = 0; bit < 31 && found < count; bit++) {
    if (mask & (1 << bit)) {
      out |= 1 << bit;
      found++;
    }
  }
  return found === count ? out : -1;
}

/**
 * Kanal düzeni: çözücü mono'ya indirir, yani yalnız bu indirgemenin
 * belirsiz olmadığı düzenler kabul edilir — tek kanal ya da ön sol + ön sağ.
 * Maske kanal sayısından fazla bit taşıyorsa Microsoft sözleşmesine göre üst
 * bitler yok sayılır; eksik bit (atanmamış kanal), çok kanallı düzen ve
 * konumsuz 2+ kanal belirsizdir ve reddedilir (LFE'yi ya da arka kanalları
 * eşit ağırlıkla toplamak sessiz bir yeniden yorum olurdu).
 */
function checkChannelLayout(numChannels: number, channelMask: number | undefined): void {
  if (numChannels === 1) return;
  if (numChannels > 2) {
    throw new Error(
      `Desteklenmeyen WAV kanal düzeni: ${numChannels} kanal — mono'ya indirgeme belirsiz; ` +
        'kaynağı önceden mono ya da stereo indirin',
    );
  }
  if (channelMask === undefined || channelMask === 0 || (channelMask & SPEAKER_ALL) !== 0) return;
  const used = lowestBits(channelMask, numChannels);
  if (used !== (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT)) {
    throw new Error(
      `Desteklenmeyen WAV kanal düzeni: maske 0x${(channelMask >>> 0).toString(16)} ` +
        '(yalnız ön sol + ön sağ stereo desteklenir)',
    );
  }
}

function readWavFormat(
  dataView: DataView,
  bytes: Uint8Array,
  fmtOffset: number,
  fmtSize: number,
): WavFormat {
  const format = dataView.getUint16(fmtOffset, true);
  const numChannels = dataView.getUint16(fmtOffset + 2, true);
  const wavSampleRate = dataView.getUint32(fmtOffset + 4, true);
  const bitsPerSample = dataView.getUint16(fmtOffset + 14, true);
  if (numChannels <= 0) {
    throw new Error(`Geçersiz WAV kanal sayısı: ${numChannels}`);
  }
  if (wavSampleRate <= 0) {
    throw new Error(`Geçersiz WAV örnek oranı: ${wavSampleRate}`);
  }

  let effectiveFormat = format;
  let validBits = bitsPerSample;
  let channelMask: number | undefined;
  if (format === 0xfffe) {
    // WAVEFORMATEXTENSIBLE: cbSize ≥ 22 → geçerli bit (2) + kanal maskesi (4)
    // + alt biçim GUID'i (16).
    if (fmtSize < 40 || dataView.getUint16(fmtOffset + 16, true) < 22) {
      throw new Error('WAV extensible fmt chunk çok kısa (bozuk dosya)');
    }
    validBits = dataView.getUint16(fmtOffset + 18, true);
    channelMask = dataView.getUint32(fmtOffset + 20, true);
    effectiveFormat = dataView.getUint16(fmtOffset + 24, true);
    for (let i = 0; i < KSDATAFORMAT_SUFFIX.length; i++) {
      if (bytes[fmtOffset + 26 + i] !== KSDATAFORMAT_SUFFIX[i]) {
        throw new Error("Desteklenmeyen WAV alt biçim GUID'i (PCM/IEEE float değil)");
      }
    }
    if (validBits === 0 || validBits > bitsPerSample) {
      throw new Error(`Geçersiz WAV geçerli bit sayısı: ${validBits} (kap ${bitsPerSample} bit)`);
    }
  }

  if (effectiveFormat !== 1 && effectiveFormat !== 3) {
    throw new Error(`Desteklenmeyen WAV formatı: ${effectiveFormat} (PCM veya float bekleniyor)`);
  }
  if (effectiveFormat === 3 && bitsPerSample !== 32 && bitsPerSample !== 64) {
    throw new Error(`Float WAV yalnızca 32/64-bit destekler (verilen: ${bitsPerSample})`);
  }
  if (effectiveFormat === 3 && validBits !== bitsPerSample) {
    throw new Error(`Float WAV'da geçerli bit kabla aynı olmalı (${validBits}/${bitsPerSample})`);
  }
  // PCM için desteklenmeyen/sıfır bit derinliği burada kesilmezse aşağıdaki
  // `sampleCount` bölmesi bitsPerSample=0 iken Infinity üretir.
  if (effectiveFormat === 1 && ![8, 16, 24, 32].includes(bitsPerSample)) {
    throw new Error(`Desteklenmeyen bit derinliği: ${bitsPerSample}`);
  }
  checkChannelLayout(numChannels, channelMask);
  return { effectiveFormat, numChannels, wavSampleRate, bitsPerSample, validBits };
}

/**
 * Kanalları KORUYARAK çözer (mono ya da ön sol + ön sağ stereo); sample
 * kütüphanesi ve konvolüsyon IR'ları için. Kanal düzeni kuralları ve biçim
 * denetimi `decodeWav` ile aynıdır; tek fark mono'ya indirmemesidir.
 */
export function decodeWavChannels(buffer: ArrayBuffer | Uint8Array): {
  channels: Float32Array[];
  sampleRate: number;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks = locateChunks(bytes, view);
  const format = readWavFormat(view, bytes, chunks.fmtOffset, chunks.fmtSize);
  const bytesPerSample = format.bitsPerSample / 8;
  const frameSize = format.numChannels * bytesPerSample;
  if (chunks.dataSize % frameSize !== 0) {
    throw new Error('WAV data chunk tam örnek frame içermiyor (bozuk dosya)');
  }
  const frames = chunks.dataSize / frameSize;
  const channels = Array.from({ length: format.numChannels }, () => new Float32Array(frames));
  const padMask = ~((1 << (format.bitsPerSample - format.validBits)) - 1);
  let at = chunks.dataOffset;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < format.numChannels; ch++) {
      const value = readSampleValue(view, bytes, at, format, padMask);
      if (!Number.isFinite(value)) throw new Error('WAV örnek verisi sonlu değil');
      channels[ch][i] = value;
      at += bytesPerSample;
    }
  }
  return { channels, sampleRate: format.wavSampleRate };
}

function readSampleValue(
  view: DataView,
  bytes: Uint8Array,
  at: number,
  format: WavFormat,
  padMask: number,
): number {
  if (format.effectiveFormat === 3) {
    return format.bitsPerSample === 32 ? view.getFloat32(at, true) : view.getFloat64(at, true);
  }
  switch (format.bitsPerSample) {
    case 16:
      return (view.getInt16(at, true) & padMask) / 32768;
    case 24: {
      const raw = (bytes[at + 2] << 16) | (bytes[at + 1] << 8) | bytes[at];
      const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
      return (signed & padMask) / 8388608;
    }
    case 32:
      return (view.getInt32(at, true) & padMask) / 2147483648;
    default:
      return ((bytes[at] & padMask) - 128) / 128;
  }
}

function locateChunks(bytes: Uint8Array, view: DataView) {
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.byteLength < 12 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') {
    throw new Error('Geçersiz WAV dosyası');
  }
  const end = Math.min(bytes.byteLength, view.getUint32(4, true) + 8);
  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;
  for (let offset = 12; offset + 8 <= end; ) {
    const id = text(offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > end) throw new Error(`WAV ${id} chunk boyutu dosya sınırını aşıyor`);
    if (id === 'fmt ') [fmtOffset, fmtSize] = [offset + 8, size];
    if (id === 'data') [dataOffset, dataSize] = [offset + 8, size];
    offset += 8 + size + (size % 2);
  }
  if (fmtOffset < 0 || dataOffset < 0 || fmtSize < 16) {
    throw new Error('WAV fmt veya data chunk bulunamadı');
  }
  return { fmtOffset, fmtSize, dataOffset, dataSize };
}

/** Ham WAV dosyasından mono Float32Array ve orijinal örnek oranını döner. */
export function decodeWav(buffer: ArrayBuffer | Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < 12) throw new Error('Geçersiz WAV dosyası: RIFF başlığı eksik');
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const readString = (offset: number, length: number): string => {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
    return s;
  };

  if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') {
    throw new Error('Geçersiz WAV dosyası');
  }
  const riffSize = dataView.getUint32(4, true);
  if (riffSize < 4 || riffSize > bytes.byteLength - 8) {
    throw new Error('Geçersiz WAV RIFF boyutu: chunk sınırları dosyayı aşıyor');
  }
  const riffEnd = riffSize + 8;

  let fmtOffset = -1;
  let fmtSize = 0;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) {
      throw new Error('WAV chunk başlığı kesik (bozuk dosya)');
    }
    const chunkId = readString(offset, 4);
    const chunkSize = dataView.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    if (chunkSize > riffEnd - chunkDataStart) {
      throw new Error(`WAV ${chunkId} chunk boyutu dosya sınırını aşıyor`);
    }
    const nextOffset = chunkDataStart + chunkSize + (chunkSize % 2);
    if (nextOffset > riffEnd) {
      throw new Error(`WAV ${chunkId} chunk padding'i kesik (bozuk dosya)`);
    }

    if (chunkId === 'fmt ') {
      fmtOffset = chunkDataStart;
      fmtSize = chunkSize;
    } else if (chunkId === 'data') {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
    }
    offset = nextOffset;
  }

  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error('WAV fmt veya data chunk bulunamadı');
  }
  if (fmtSize < 16 || fmtOffset + fmtSize > bytes.byteLength) {
    throw new Error('WAV fmt chunk çok kısa (bozuk dosya)');
  }

  const { effectiveFormat, numChannels, wavSampleRate, bitsPerSample, validBits } = readWavFormat(
    dataView,
    bytes,
    fmtOffset,
    fmtSize,
  );

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = numChannels * bytesPerSample;
  if (dataSize % frameSize !== 0) {
    throw new Error('WAV data chunk tam örnek frame içermiyor (bozuk dosya)');
  }
  const sampleCount = dataSize / frameSize;
  const samples = new Float32Array(sampleCount);
  // Geçerli bitler kabın EN ANLAMLI bitleridir; alttaki dolgu bitleri
  // sözleşmeye göre 0 olmalı, olmayan dosyada çöp olarak maskelenir. Ölçek
  // kabın tam ölçeğidir — sola yaslı veri böyle doğru genliği verir.
  const padMask = ~((1 << (bitsPerSample - validBits)) - 1);

  let readIndex = dataOffset;
  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      if (effectiveFormat === 3) {
        if (bitsPerSample === 32) {
          sum += dataView.getFloat32(readIndex, true);
          readIndex += 4;
        } else {
          sum += dataView.getFloat64(readIndex, true);
          readIndex += 8;
        }
      } else if (bitsPerSample === 16) {
        sum += (dataView.getInt16(readIndex, true) & padMask) / 32768;
        readIndex += 2;
      } else if (bitsPerSample === 24) {
        // 24-bit little-endian işaretli: üç baytı birleştirip işaret genişlet.
        const b0 = bytes[readIndex];
        const b1 = bytes[readIndex + 1];
        const b2 = bytes[readIndex + 2];
        const raw = (b2 << 16) | (b1 << 8) | b0;
        const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
        sum += (signed & padMask) / 8388608;
        readIndex += 3;
      } else if (bitsPerSample === 32) {
        sum += (dataView.getInt32(readIndex, true) & padMask) / 2147483648;
        readIndex += 4;
      } else if (bitsPerSample === 8) {
        // 8-bit WAV işaretsizdir (0-255, orta nokta 128).
        sum += ((bytes[readIndex] & padMask) - 128) / 128;
        readIndex += 1;
      } else {
        throw new Error(`Desteklenmeyen bit derinliği: ${bitsPerSample}`);
      }
    }
    const sample = sum / numChannels;
    if (!Number.isFinite(sample)) throw new Error('WAV örnek verisi sonlu değil');
    samples[i] = sample;
  }

  return { samples, sampleRate: wavSampleRate };
}

/**
 * Kaiser penceresinin durdurma bandı zayıflaması (dB). 96 dB, 16-bit
 * teslim biçiminin kuantizasyon tabanıdır: alias bu tabanın altında kalır.
 */
const RESAMPLE_STOPBAND_DB = 96;
/** Geçiş bandı: etkin Nyquist'in %90'ından %100'üne. Durdurma bandı tam Nyquist'te başlar. */
const RESAMPLE_TRANSITION = 0.1;
/** Çekirdek tablosu çözünürlüğü: giriş örneği başına nokta (doğrusal enterpolasyonlu). */
const KERNEL_TABLE_DENSITY = 512;

/** Sıfırıncı derece değiştirilmiş Bessel fonksiyonu (seri açılımı). */
function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-16) break;
  }
  return sum;
}

interface ResampleKernel {
  readonly halfWidth: number;
  readonly table: Float64Array;
}

/**
 * Kaiser pencereli sinc çekirdeği: h(t) = 2fc·sinc(2fc·t)·w(t / halfWidth).
 * β ve uzunluk Kaiser'in tasarım formüllerinden gelir (Oppenheim & Schafer):
 * β = 0.1102(A − 8.7), mertebe N = (A − 7.95) / (2.285·Δω).
 */
function kernelHalfWidth(scale: number): number {
  const deltaOmega = 2 * Math.PI * 0.5 * scale * RESAMPLE_TRANSITION;
  return Math.ceil((RESAMPLE_STOPBAND_DB - 7.95) / (2.285 * deltaOmega) / 2);
}

function buildKernel(scale: number): ResampleKernel {
  const cutoff = 0.5 * scale * (1 - RESAMPLE_TRANSITION / 2);
  const beta = 0.1102 * (RESAMPLE_STOPBAND_DB - 8.7);
  const halfWidth = kernelHalfWidth(scale);
  const size = halfWidth * KERNEL_TABLE_DENSITY + 2;
  const table = new Float64Array(size);
  const norm = besselI0(beta);
  for (let j = 0; j < size; j++) {
    const t = j / KERNEL_TABLE_DENSITY;
    const u = t / halfWidth;
    if (u >= 1) break;
    const x = 2 * cutoff * t;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    table[j] = 2 * cutoff * sinc * (besselI0(beta * Math.sqrt(1 - u * u)) / norm);
  }
  return { halfWidth, table };
}

/**
 * Bant sınırlı yeniden örnekleme (J.O. Smith, "Digital Audio Resampling").
 *
 * `factor` kaynak örneği / çıkış örneğidir: 2 → yarı oran (aşağı), 0.5 → iki
 * kat (yukarı). Çekirdeğin kesimi kaynak ve çıkış Nyquist'inin küçüğüne göre
 * ölçeklenir; aşağı örneklemede bu, anti-alias filtresidir, yukarıda görüntü
 * bastırıcıdır. `maxLength` gerekenden fazla çıkış hesaplanmasını önler.
 * Kaynak sınırların dışında sıfır sayılır.
 */
export function resample(
  samples: Float32Array,
  factor: number,
  maxLength = Number.POSITIVE_INFINITY,
): Float32Array {
  checkNumber(factor, 'factor', { above: 0 });
  const outLength = Math.min(maxLength, Math.ceil(samples.length / factor));
  if (samples.length === 0 || outLength <= 0) return new Float32Array(0);
  if (factor === 1) return samples.slice(0, outLength);

  const { halfWidth, table } = buildKernel(Math.min(1, 1 / factor));
  const out = new Float32Array(outLength);
  const last = samples.length - 1;
  for (let i = 0; i < outLength; i++) {
    const position = i * factor;
    const first = Math.max(0, Math.ceil(position - halfWidth));
    const end = Math.min(last, Math.floor(position + halfWidth));
    let acc = 0;
    for (let k = first; k <= end; k++) {
      const at = Math.abs(position - k) * KERNEL_TABLE_DENSITY;
      const j = Math.floor(at);
      const frac = at - j;
      acc += samples[k] * (table[j] + (table[j + 1] - table[j]) * frac);
    }
    out[i] = acc;
  }
  return out;
}

/** Saniye cinsinden kırpma uygular. `end` negatifse sondan geriye doğru. */
export function trimSamples(
  samples: Float32Array,
  trim: { start?: number; end?: number },
  sampleRate: number,
): Float32Array {
  checkNumber(sampleRate, 'trim.sampleRate', { above: 0 });
  checkNumber(trim.start ?? 0, 'trim.start', { min: 0 });
  if (trim.end !== undefined) checkNumber(trim.end, 'trim.end');
  const startSample = Math.floor((trim.start ?? 0) * sampleRate);
  let endSample = samples.length;

  if (trim.end !== undefined) {
    if (trim.end > 0) {
      endSample = Math.min(samples.length, Math.floor(trim.end * sampleRate));
    } else if (trim.end < 0) {
      endSample = samples.length + Math.floor(trim.end * sampleRate);
    } else {
      endSample = 0;
    }
  }

  endSample = Math.max(startSample, Math.min(samples.length, endSample));
  return samples.slice(startSample, endSample);
}

/** Loop geçişinin en uzun süresi (örnek); kaynağın yarısını aşmaz. */
const LOOP_CROSSFADE_SAMPLES = 50;

/**
 * Kuyruk → baş geçişi. Ağırlıklar ilintiye göre güç tamamlayıcıdır (Fink,
 * Holters, Zölzer, DAFx-16): f² + g² + 2r·f·g = 1. İlintisiz içerikte (r = 0)
 * eşit güç (sin/cos) olur ve doğrusal geçişin −3 dB çukurunu önler; tam
 * ilintili içerikte (r = 1) eşit kazanca iner ve +3 dB tümsek oluşmaz.
 * Negatif ilinti 0'da kırpılır: ters fazlı bir loop noktası bozuk bir
 * noktadır, onu kazançla şişirmek çözmez.
 */
function crossfadeBlock(samples: Float32Array, fade: number): Float32Array {
  const tailStart = samples.length - fade;
  let cross = 0;
  let tailEnergy = 0;
  let headEnergy = 0;
  for (let i = 0; i < fade; i++) {
    cross += samples[tailStart + i] * samples[i];
    tailEnergy += samples[tailStart + i] ** 2;
    headEnergy += samples[i] ** 2;
  }
  const denom = Math.sqrt(tailEnergy * headEnergy);
  const r = denom > 0 ? Math.min(1, Math.max(0, cross / denom)) : 0;
  const block = new Float32Array(fade);
  for (let i = 0; i < fade; i++) {
    const angle = (Math.PI / 2) * ((i + 0.5) / fade);
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const norm = Math.sqrt(1 + 2 * r * sin * cos);
    block[i] = (samples[tailStart + i] * cos + samples[i] * sin) / norm;
  }
  return block;
}

/**
 * Hedef uzunluğa ulaşana kadar örnekleri loop eder.
 *
 * `crossfade` ile ilk geçiş kaynağın `[0, L−F)` kısmını çalar; her sınırda
 * kuyruk ile başın F örneklik karışımı gelir ve çıktı `samples[F]`ten sürer
 * — başın ilk F örneği karışımın içinde zaten çalındı. Dönem böylece L−F'dir
 * ve sınırda sıçrama yoktur; karışımdan sonra yeniden `samples[0]`a dönmek
 * her turda `head[F−1] → head[0]` sıçraması bırakırdı.
 */
export function loopSamples(
  samples: Float32Array,
  targetLength: number,
  loop = true,
  crossfade = false,
  crossfadeSamples = LOOP_CROSSFADE_SAMPLES,
): Float32Array {
  if (!Number.isInteger(targetLength) || targetLength < 0) {
    throw new Error(`loopSamples hedef uzunluğu negatif/tamsayı değil: ${targetLength}`);
  }
  if (samples.length >= targetLength) return samples.slice(0, targetLength);
  if (samples.length === 0) return new Float32Array(targetLength);

  const out = new Float32Array(targetLength);
  if (!loop) {
    out.set(samples);
    return out;
  }

  const fade = crossfade ? Math.min(crossfadeSamples, Math.floor(samples.length / 2)) : 0;
  if (fade === 0) {
    for (let i = 0; i < targetLength; i++) out[i] = samples[i % samples.length];
    return out;
  }

  const block = crossfadeBlock(samples, fade);
  const body = samples.subarray(fade, samples.length - fade);
  let at = 0;
  const write = (part: Float32Array): void => {
    const count = Math.min(part.length, targetLength - at);
    out.set(part.subarray(0, count), at);
    at += count;
  };
  write(samples.subarray(0, samples.length - fade));
  while (at < targetLength) {
    write(block);
    write(body);
  }
  return out;
}

/** Sample'a zarf uygular. */
export function applyEnvelopeToSample(
  samples: Float32Array,
  envelope: EnvelopeParams,
  duration: number,
  sampleRate: number,
): Float32Array {
  checkNumber(sampleRate, 'sampleRate', { above: 0 });
  const env = new Envelope(envelope, duration);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    out[i] = samples[i] * env.value(t);
  }
  return out;
}

/** Sample parametrelerini işleyip hedef uzunlukta mono buffer üretir. */
export function processSample(
  sample: SampleParams,
  targetSampleRate: number,
  targetLength: number,
): Float32Array {
  const resolved = resolveSample(sample, 'sample');
  checkSampleRate(targetSampleRate, 'targetSampleRate');
  checkNumber(targetLength, 'targetLength', { min: 0, integer: true });
  const { gain } = resolved;

  let sourceSamples: Float32Array;
  let sourceRate: number;

  if (resolved.data instanceof Float32Array) {
    sourceSamples = resolved.data;
    sourceRate = resolved.sampleRate ?? targetSampleRate;
  } else {
    const decoded = decodeWav(resolved.data);
    sourceSamples = decoded.samples;
    sourceRate = decoded.sampleRate;
  }

  // Kırpma
  if (resolved.trim) {
    sourceSamples = trimSamples(sourceSamples, resolved.trim, sourceRate);
  }

  // Pitch shift + sample rate uyumu
  const pitchFactor = Math.pow(2, resolved.pitchShift / 12);
  const rateFactor = sourceRate / targetSampleRate;
  const resampleFactor = rateFactor * pitchFactor;
  // Çekirdek, aşağı örnekleme oranıyla uzar (pitchShift +60 ≈ 4000 tap):
  // kesin maliyet kaynak çözüldükten sonra, tamponlardan ÖNCE denetlenir.
  // Tap ≈ 3.6 ns ölçüldü; iş birimi ≈ 10 ns (bkz. guard/budget.ts).
  const taps = 2 * kernelHalfWidth(Math.min(1, 1 / resampleFactor));
  assertRenderBudget(
    {
      peakBytes: 4 * (sourceSamples.length + 3 * targetLength),
      workUnits: Math.ceil(targetLength * taps * 0.36),
    },
    'processSample',
  );
  let processed = resample(sourceSamples, resampleFactor, targetLength);

  // Loop veya trim
  processed = loopSamples(processed, targetLength, resolved.loop, resolved.loopCrossfade);
  if (processed.length > targetLength) {
    processed = processed.slice(0, targetLength);
  } else if (processed.length < targetLength) {
    const padded = new Float32Array(targetLength);
    padded.set(processed);
    processed = padded;
  }

  // Envelope
  if (resolved.envelope) {
    const duration = targetLength / targetSampleRate;
    processed = applyEnvelopeToSample(processed, resolved.envelope, duration, targetSampleRate);
  }

  // Gain
  if (gain !== 1) {
    for (let i = 0; i < processed.length; i++) processed[i] *= gain;
  }

  return processed;
}

/** Hedef mono buffer'ın üzerine kaynak ekler. */
export function mixSampleLayer(target: Float32Array, source: Float32Array, offset = 0): void {
  for (let i = 0; i < source.length; i++) {
    const idx = offset + i;
    if (idx >= 0 && idx < target.length) target[idx] += source[i];
  }
}
