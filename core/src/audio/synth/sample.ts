import type { EnvelopeParams, SampleParams } from './types';
import { Envelope } from './envelope';

/** Ham WAV dosyasından mono Float32Array ve orijinal örnek oranını döner. */
export function decodeWav(buffer: ArrayBuffer | Uint8Array): {
  samples: Float32Array;
  sampleRate: number;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const readString = (offset: number, length: number): string => {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i]);
    return s;
  };

  if (readString(0, 4) !== 'RIFF' || readString(8, 4) !== 'WAVE') {
    throw new Error('Geçersiz WAV dosyası');
  }

  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;

  let offset = 12;
  while (offset < bytes.byteLength - 8) {
    const chunkId = readString(offset, 4);
    const chunkSize = dataView.getUint32(offset + 4, true);
    if (chunkId === 'fmt ') {
      fmtOffset = offset + 8;
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (fmtOffset < 0 || dataOffset < 0) {
    throw new Error('WAV fmt veya data chunk bulunamadı');
  }

  const format = dataView.getUint16(fmtOffset, true);
  const numChannels = dataView.getUint16(fmtOffset + 2, true);
  const wavSampleRate = dataView.getUint32(fmtOffset + 4, true);
  const bitsPerSample = dataView.getUint16(fmtOffset + 14, true);

  // 1 = PCM tamsayı, 3 = IEEE float. WAVE_FORMAT_EXTENSIBLE (0xFFFE) için
  // gerçek format fmt chunk'ının uzantı kısmındaki GUID'in ilk 2 baytındadır.
  let effectiveFormat = format;
  if (format === 0xfffe) {
    effectiveFormat = dataView.getUint16(fmtOffset + 24, true);
  }

  if (effectiveFormat !== 1 && effectiveFormat !== 3) {
    throw new Error(`Desteklenmeyen WAV formatı: ${effectiveFormat} (PCM veya float bekleniyor)`);
  }
  if (effectiveFormat === 3 && bitsPerSample !== 32 && bitsPerSample !== 64) {
    throw new Error(`Float WAV yalnızca 32/64-bit destekler (verilen: ${bitsPerSample})`);
  }

  const sampleCount = Math.floor(dataSize / (numChannels * (bitsPerSample / 8)));
  const samples = new Float32Array(sampleCount);

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
        sum += dataView.getInt16(readIndex, true) / 32768;
        readIndex += 2;
      } else if (bitsPerSample === 24) {
        // 24-bit little-endian işaretli: üç baytı birleştirip işaret genişlet.
        const b0 = bytes[readIndex];
        const b1 = bytes[readIndex + 1];
        const b2 = bytes[readIndex + 2];
        const raw = (b2 << 16) | (b1 << 8) | b0;
        const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
        sum += signed / 8388608;
        readIndex += 3;
      } else if (bitsPerSample === 32) {
        sum += dataView.getInt32(readIndex, true) / 2147483648;
        readIndex += 4;
      } else if (bitsPerSample === 8) {
        // 8-bit WAV işaretsizdir (0-255, orta nokta 128).
        sum += (bytes[readIndex] - 128) / 128;
        readIndex += 1;
      } else {
        throw new Error(`Desteklenmeyen bit derinliği: ${bitsPerSample}`);
      }
    }
    samples[i] = sum / numChannels;
  }

  return { samples, sampleRate: wavSampleRate };
}

/**
 * Doğrusal enterpolasyonla yeniden örnekler.
 *
 * `factor > 1` (aşağı örnekleme) durumunda önce bir alçak geçiren uygulanır:
 * ön filtreleme olmadan yeni Nyquist'in üstündeki içerik katlanır (aliasing).
 * Filtre basit bir kayan ortalama — biquad kadar keskin değil ama hiç
 * filtrelememekten çok daha iyi ve tek geçişte çalışır.
 */
export function resampleLinear(samples: Float32Array, factor: number): Float32Array {
  if (factor <= 0 || samples.length === 0) return new Float32Array(0);
  if (factor === 1) return samples.slice();

  let source = samples;
  if (factor > 1) {
    const window = Math.max(2, Math.round(factor));
    const smoothed = new Float32Array(samples.length);
    let running = 0;
    for (let i = 0; i < samples.length; i++) {
      running += samples[i];
      if (i >= window) running -= samples[i - window];
      smoothed[i] = running / Math.min(i + 1, window);
    }
    source = smoothed;
  }

  const outLength = Math.max(1, Math.ceil(source.length / factor));
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const pos = i * factor;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, source.length - 1);
    const frac = pos - i0;
    out[i] = source[i0] * (1 - frac) + source[i1] * frac;
  }

  return out;
}

/** Saniye cinsinden kırpma uygular. `end` negatifse sondan geriye doğru. */
export function trimSamples(
  samples: Float32Array,
  trim: { start?: number; end?: number },
  sampleRate: number,
): Float32Array {
  const startSample = Math.max(0, Math.floor((trim.start ?? 0) * sampleRate));
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

/** Hedef uzunluğa ulaşana kadar örnekleri loop eder; crossfade istenirse kısa bir geçiş uygular. */
export function loopSamples(
  samples: Float32Array,
  targetLength: number,
  loop = true,
  crossfade = false,
): Float32Array {
  if (samples.length >= targetLength) return samples.slice(0, targetLength);
  if (samples.length === 0) return new Float32Array(targetLength);

  if (!loop) {
    const out = new Float32Array(targetLength);
    out.set(samples);
    return out;
  }

  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    out[i] = samples[i % samples.length];
  }

  if (crossfade) {
    const fadeSamples = Math.min(50, Math.floor(samples.length / 2));
    for (let i = 0; i < fadeSamples; i++) {
      const tailPos = samples.length - fadeSamples + i;
      const headPos = i;
      const ratio = i / fadeSamples;
      out[i] = samples[tailPos] * (1 - ratio) + samples[headPos] * ratio;
    }
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
  const gain = Math.max(0, Math.min(1, sample.gain ?? 1));

  let sourceSamples: Float32Array;
  let sourceRate: number;

  if (sample.data instanceof Float32Array) {
    sourceSamples = sample.data;
    sourceRate = sample.sampleRate ?? targetSampleRate;
  } else if (sample.data instanceof Uint8Array) {
    const decoded = decodeWav(sample.data);
    sourceSamples = decoded.samples;
    sourceRate = decoded.sampleRate;
  } else {
    const decoded = decodeWav(sample.data);
    sourceSamples = decoded.samples;
    sourceRate = decoded.sampleRate;
  }

  // Kırpma
  if (sample.trim) {
    sourceSamples = trimSamples(sourceSamples, sample.trim, sourceRate);
  }

  // Pitch shift + sample rate uyumu
  const pitchFactor = Math.pow(2, (sample.pitchShift ?? 0) / 12);
  const rateFactor = sourceRate / targetSampleRate;
  const resampleFactor = rateFactor * pitchFactor;
  let processed = resampleLinear(sourceSamples, resampleFactor);

  // Loop veya trim
  processed = loopSamples(processed, targetLength, sample.loop, sample.loopCrossfade);
  if (processed.length > targetLength) {
    processed = processed.slice(0, targetLength);
  } else if (processed.length < targetLength) {
    const padded = new Float32Array(targetLength);
    padded.set(processed);
    processed = padded;
  }

  // Envelope
  if (sample.envelope) {
    const duration = targetLength / targetSampleRate;
    processed = applyEnvelopeToSample(processed, sample.envelope, duration, targetSampleRate);
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
