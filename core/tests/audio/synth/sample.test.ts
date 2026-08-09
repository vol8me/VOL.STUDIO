import { describe, it, expect } from 'vitest';
import {
  applyEnvelopeToSample,
  decodeWav,
  loopSamples,
  mixSampleLayer,
  processSample,
  resampleLinear,
  trimSamples,
} from '@volstudio/core/audio/synth';

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
