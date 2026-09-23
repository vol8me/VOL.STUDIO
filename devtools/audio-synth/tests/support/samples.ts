import { createHash } from 'node:crypto';
import type { SampleData, SampleDeclV1 } from '../../src/program/samples';

/**
 * Testlerin bellek-içi sample kütüphanesi: deterministik, küçük sentetik
 * kayıtlar. Protokol diskten okur ve WAV baytlarını özetler; burada özet
 * float verinin baytlarıdır — çözücü sözleşmesi (bildirim ↔ veri) aynıdır.
 */
export interface ProbeSample {
  readonly decl: SampleDeclV1;
  readonly data: SampleData;
}

const library = new Map<string, SampleData>();

export function registerSample(id: string, data: SampleData): SampleDeclV1 {
  const hash = createHash('sha256');
  for (const channel of data.channels)
    hash.update(Buffer.from(channel.buffer, channel.byteOffset, channel.byteLength));
  const decl: SampleDeclV1 = {
    id,
    hash: `sha256:${hash.digest('hex')}`,
    sampleRate: data.sampleRate,
    channels: data.channels.length as 1 | 2,
    frames: data.channels[0].length,
  };
  library.set(decl.hash, data);
  return decl;
}

export const probeResolver = (decl: SampleDeclV1): SampleData => {
  const data = library.get(decl.hash);
  if (!data) throw new Error(`test kütüphanesinde yok: ${decl.id}`);
  return data;
};

/** k. yoklama kaydı: sönümlü tonal + gürültü çarpması, k'ye göre farklı perde/renk. */
export function probeSample(k: number, sampleRate = 44100, seconds = 0.6): ProbeSample {
  const frames = Math.round(sampleRate * seconds);
  const out = new Float32Array(frames);
  let state = 0x9e3779b9 ^ (k * 7919);
  const f = 220 * Math.pow(2, k * 0.75);
  for (let i = 0; i < frames; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const noise = state / 2 ** 31 - 1;
    const t = i / sampleRate;
    const tone = Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * 2.01 * f * t);
    const click = t < 0.015 ? noise * (1 - t / 0.015) : 0;
    out[i] = 0.45 * Math.exp(-4 * t) * tone + 1.3 * click;
  }
  const data = { channels: [out], sampleRate };
  return { decl: registerSample(`probe-${k}`, data), data };
}

/** Stereo yoklama kaydı (sol/sağ farklı). */
export function probeStereoSample(sampleRate = 48000, seconds = 0.8): ProbeSample {
  const frames = Math.round(sampleRate * seconds);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    left[i] = 0.4 * Math.exp(-3 * t) * Math.sin(2 * Math.PI * 330 * t);
    right[i] = 0.4 * Math.exp(-2 * t) * Math.sin(2 * Math.PI * 495 * t);
  }
  const data = { channels: [left, right], sampleRate };
  return { decl: registerSample('probe-stereo', data), data };
}
