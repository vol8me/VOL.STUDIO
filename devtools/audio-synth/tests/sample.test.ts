import { describe, it, expect } from 'vitest';
import {
  applyEnvelopeToSample,
  decodeWav,
  loopSamples,
  mixSampleLayer,
  processSample,
  resampleLinear,
  trimSamples,
} from '@volstudio/audio-synth';

function createTestWav(frequency: number, duration: number, sampleRate: number): Uint8Array {
  const sampleCount = Math.floor(sampleRate * duration);
  const byteRate = sampleRate * 2; // 16-bit mono
  const dataSize = sampleCount * 2;
  const headerSize = 44;
  const buffer = new Uint8Array(headerSize + dataSize);
  const view = new DataView(buffer.buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.8;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(sample * 32767))), true);
  }

  return buffer;
}

describe('Sample utils', () => {
  it('decodeWav PCM16 mono çözümlemesi', () => {
    const wav = createTestWav(440, 0.1, 44100);
    const { samples, sampleRate } = decodeWav(wav);
    expect(sampleRate).toBe(44100);
    expect(samples.length).toBe(4410);
    expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(0.5);
  });

  it("decodeWav kesik (truncated) data chunk'ı reddeder", () => {
    const wav = createTestWav(440, 0.1, 44100); // header(44) + data(4410*2=8820) = 8864 bayt
    const truncated = wav.slice(0, 44 + 100); // data chunk 8820 bayt iddia ediyor, yalnızca 100 bayt var
    new DataView(truncated.buffer).setUint32(4, truncated.byteLength - 8, true);
    expect(() => decodeWav(truncated)).toThrow(/data chunk boyutu/);
  });

  it('decodeWav imkânsız fmt chunk boyutunu DataView erişiminden önce reddeder', () => {
    const wav = createTestWav(440, 0.05, 44100);
    new DataView(wav.buffer).setUint32(16, 0xffff_ffff, true);

    expect(() => decodeWav(wav)).toThrow(/fmt  chunk boyutu/);
  });

  it('decodeWav tam frame olmayan data chunkını reddeder', () => {
    const wav = createTestWav(440, 0.05, 44100).slice(0, 46);
    const view = new DataView(wav.buffer);
    view.setUint32(4, 38, true);
    view.setUint32(40, 1, true);

    expect(() => decodeWav(wav)).toThrow(/tam örnek frame/);
  });

  it('decodeWav sıfır kanal sayısında temiz hata fırlatır (bölme sıfıra gitmez)', () => {
    const wav = createTestWav(440, 0.05, 44100);
    const corrupted = wav.slice();
    new DataView(corrupted.buffer).setUint16(22, 0, true); // numChannels ofseti
    expect(() => decodeWav(corrupted)).toThrow(/kanal sayısı/);
  });

  it('decodeWav sıfır örnek oranını reddeder', () => {
    const wav = createTestWav(440, 0.05, 44100);
    new DataView(wav.buffer).setUint32(24, 0, true);

    expect(() => decodeWav(wav)).toThrow(/örnek oranı/);
  });

  it('decodeWav desteklenmeyen PCM bit derinliğinde temiz hata fırlatır', () => {
    const wav = createTestWav(440, 0.05, 44100);
    const corrupted = wav.slice();
    new DataView(corrupted.buffer).setUint16(34, 0, true); // bitsPerSample ofseti
    expect(() => decodeWav(corrupted)).toThrow(/bit derinliği/);
  });

  it('resampleLinear uzunluğu doğru değiştirir', () => {
    const data = new Float32Array([0, 1, 2, 3, 4, 5]);
    const resampled = resampleLinear(data, 2);
    expect(resampled.length).toBe(3);
  });

  it('trimSamples saniye bazlı kırpar', () => {
    const data = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const trimmed = trimSamples(data, { start: 0.2, end: 0.6 }, 10);
    expect(trimmed.length).toBe(4);
    expect(trimmed[0]).toBe(2);
  });

  it('trimSamples negatif end sondan kırpar', () => {
    const data = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const trimmed = trimSamples(data, { start: 0.1, end: -0.2 }, 10);
    expect(trimmed.length).toBe(7);
    expect(trimmed[trimmed.length - 1]).toBe(7);
  });

  it('loopSamples loop=false padding yapar', () => {
    const data = new Float32Array([1, 2, 3]);
    const padded = loopSamples(data, 8, false);
    expect(padded.length).toBe(8);
    expect(padded[0]).toBe(1);
    expect(padded[3]).toBe(0);
  });

  it('loopSamples hedef uzunluğa uzatır', () => {
    const data = new Float32Array([1, 2, 3]);
    const looped = loopSamples(data, 8);
    expect(looped.length).toBe(8);
    expect(looped[0]).toBe(1);
    expect(looped[3]).toBe(1);
  });

  it('loopSamples crossfade her iç loop sınırında uygulanır (yalnızca ilkinde değil)', () => {
    const source = new Float32Array(20);
    for (let i = 0; i < source.length; i++) {
      source[i] = Math.sin((i / source.length) * Math.PI * 2);
    }
    const targetLength = source.length * 3 + 5;
    const withCrossfade = loopSamples(source, targetLength, true, true);
    const withoutCrossfade = loopSamples(source, targetLength, true, false);
    const fadeSamples = Math.min(50, Math.floor(source.length / 2));

    // Eski implementasyon yalnızca [0, fadeSamples) aralığını değiştiriyordu;
    // 2. sınırda (2×source.length) hiçbir fark yaratmıyordu. Bu sınırda da
    // fark olmalı ki her tekrarda değil yalnızca ilkinde crossfade
    // uygulandığı regresyonu yakalasın.
    const secondBoundary = source.length * 2;
    let differsAtSecondBoundary = false;
    for (let i = secondBoundary - fadeSamples; i < secondBoundary; i++) {
      if (Math.abs(withCrossfade[i] - withoutCrossfade[i]) > 1e-6) {
        differsAtSecondBoundary = true;
        break;
      }
    }
    expect(differsAtSecondBoundary).toBe(true);
  });

  it('applyEnvelopeToSample zarf uygular', () => {
    const data = new Float32Array(100).fill(1);
    const out = applyEnvelopeToSample(
      data,
      { attack: 0, hold: 0, decay: 0.05, sustain: 0.05, release: 0, sustainLevel: 0.5 },
      0.1,
      1000,
    );
    expect(out[0]).toBeCloseTo(1, 3);
    expect(out[out.length - 1]).toBeLessThan(0.6);
  });

  it('processSample Float32Array ile çalışır', () => {
    const data = new Float32Array(441).fill(0.5); // 0.01s @ 44100
    const result = processSample({ data, gain: 0.8 }, 44100, 441);
    expect(result.length).toBe(441);
    expect(Math.max(...result)).toBeCloseTo(0.4, 5);
  });

  it('processSample WAV buffer çözümler ve resampler', () => {
    const wav = createTestWav(880, 0.05, 22050);
    const result = processSample({ data: wav.buffer as ArrayBuffer }, 44100, 2205);
    expect(result.length).toBe(2205);
    expect(Math.max(...result.map(Math.abs))).toBeGreaterThan(0);
  });

  it('mixSampleLayer target üzerine ekler', () => {
    const target = new Float32Array(10).fill(1);
    const source = new Float32Array([1, 2, 3]);
    mixSampleLayer(target, source, 2);
    expect(target[2]).toBe(2);
    expect(target[3]).toBe(3);
    expect(target[4]).toBe(4);
  });
});
