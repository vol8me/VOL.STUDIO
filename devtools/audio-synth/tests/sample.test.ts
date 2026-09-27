import { describe, it, expect } from 'vitest';
import { createRandom } from '@volstudio/core/random';
import {
  applyEnvelopeToSample,
  decodeWav,
  loopSamples,
  mixSampleLayer,
  processSample,
  resample,
  trimSamples,
} from '@volstudio/audio-synth';
import { decodeWavChannels } from '../src/synthesis/sample';

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

  it('resample uzunluğu doğru değiştirir', () => {
    const data = new Float32Array([0, 1, 2, 3, 4, 5]);
    const resampled = resample(data, 2);
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

/** Minimal WAV üretici: biçim, bit ve veri doğrudan verilir (hata yolları için). */
function rawWav(opts: {
  format?: number;
  channels?: number;
  rate?: number;
  bits?: number;
  data: Uint8Array;
  fmtBody?: Uint8Array;
}): Uint8Array {
  const { format = 1, channels = 1, rate = 8000, bits = 16, data, fmtBody } = opts;
  const bytesPer = bits / 8;
  const fmtSize = fmtBody ? fmtBody.length : 16;
  const total = 12 + 8 + fmtSize + 8 + data.length;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, total - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, fmtSize, true);
  if (fmtBody) out.set(fmtBody, 20);
  else {
    view.setUint16(20, format, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * channels * bytesPer, true);
    view.setUint16(32, channels * bytesPer, true);
    view.setUint16(34, bits, true);
  }
  const dataAt = 20 + fmtSize;
  text(dataAt, 'data');
  view.setUint32(dataAt + 4, data.length, true);
  out.set(data, dataAt + 8);
  return out;
}

describe('decodeWav — hata ve biçim dalları', () => {
  it('RIFF/WAVE imzası, RIFF boyutu ve eksik chunk reddedilir', () => {
    const wav = createTestWav(440, 0.01, 8000);
    const badMagic = wav.slice();
    badMagic[0] = 0x58;
    expect(() => decodeWav(badMagic)).toThrow(/Geçersiz WAV/);
    const badSize = wav.slice();
    new DataView(badSize.buffer).setUint32(4, badSize.byteLength, true); // sınırı aşar
    expect(() => decodeWav(badSize)).toThrow(/RIFF boyutu/);
    // Yalnız fmt chunk'ı: data yok.
    const fmtOnly = wav.slice(0, 36);
    new DataView(fmtOnly.buffer).setUint32(4, fmtOnly.byteLength - 8, true);
    expect(() => decodeWav(fmtOnly)).toThrow(/fmt veya data/);
    // fmt chunk 16'dan kısa.
    const shortFmt = rawWav({ fmtBody: new Uint8Array(8), data: new Uint8Array(2) });
    expect(() => decodeWav(shortFmt)).toThrow(/fmt chunk çok kısa/);
  });

  it('kesik chunk başlığı ve padding eksikliği reddedilir', () => {
    const wav = createTestWav(440, 0.01, 8000);
    // riffEnd=40: fmt chunk tam okunur, 'data' başlığının ortasında kesilir.
    const cutHeader = wav.slice();
    new DataView(cutHeader.buffer).setUint32(4, 32, true);
    expect(() => decodeWav(cutHeader)).toThrow(/chunk başlığı kesik/);
    // Tek baytlık chunk + padding baytı eksik: RIFF sonu pad'i kapsamaz.
    const odd = new Uint8Array(12 + 8 + 3 + 8 + 4);
    const v = new DataView(odd.buffer);
    const t = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) odd[at + i] = s.charCodeAt(i);
    };
    t(0, 'RIFF');
    v.setUint32(4, odd.byteLength - 8, true);
    t(8, 'WAVE');
    t(12, 'JUNK');
    v.setUint32(16, 3, true);
    // JUNK verisi 20..23; padding 23'te olmalı ama riffEnd'i 23'e çekiyoruz.
    v.setUint32(4, 23 - 8, true);
    expect(() => decodeWav(odd)).toThrow(/boyutu dosya sınırını aşıyor|padding/);
  });

  it('desteklenmeyen format etiketi ve float derinliği reddedilir', () => {
    expect(() => decodeWav(rawWav({ format: 6, data: new Uint8Array(4) }))).toThrow(
      /Desteklenmeyen WAV formatı/,
    );
    // Float biçim 16-bit: desteklenmez.
    expect(() => decodeWav(rawWav({ format: 3, bits: 16, data: new Uint8Array(4) }))).toThrow(
      /32\/64-bit/,
    );
  });

  it('float32 ve float64 örnekler çözülür; sonlu olmayan reddedilir', () => {
    const f32 = new Uint8Array(8);
    new DataView(f32.buffer).setFloat32(0, 0.5, true);
    new DataView(f32.buffer).setFloat32(4, -0.25, true);
    const r32 = decodeWav(rawWav({ format: 3, bits: 32, data: f32 }));
    expect(r32.samples[0]).toBeCloseTo(0.5, 7);
    const f64 = new Uint8Array(8);
    new DataView(f64.buffer).setFloat64(0, 0.25, true);
    const r64 = decodeWav(rawWav({ format: 3, bits: 64, data: f64 }));
    expect(r64.samples[0]).toBeCloseTo(0.25, 9);
    const nan = new Uint8Array(4);
    new DataView(nan.buffer).setFloat32(0, Number.NaN, true);
    expect(() => decodeWav(rawWav({ format: 3, bits: 32, data: nan }))).toThrow(/sonlu değil/);
  });

  it('8-bit ve 32-bit PCM çözülür', () => {
    const eight = decodeWav(rawWav({ bits: 8, data: new Uint8Array([128, 255, 0, 64]) }));
    expect(eight.samples[0]).toBe(0);
    expect(eight.samples[1]).toBeCloseTo(127 / 128, 5);
    const i32 = new Uint8Array(8);
    new DataView(i32.buffer).setInt32(0, 2147483647, true);
    new DataView(i32.buffer).setInt32(4, -2147483648, true);
    const thirtyTwo = decodeWav(rawWav({ bits: 32, data: i32 }));
    expect(thirtyTwo.samples[0]).toBeCloseTo(1, 5);
    expect(thirtyTwo.samples[1]).toBe(-1);
  });
});

describe('decodeWavChannels — çok kanallı çözümleme ve hata dalları', () => {
  it('stereo 24-bit PCM kanalları koruyarak çözer', () => {
    // İki kanal × iki çerçeve × 3 bayt.
    const data = new Uint8Array([0, 0, 32, 0, 0, 0, 0, 64, 0, 0, 0, 0]); // L1=0x002000, R1=0, L2=0x004000, R2=0
    const r = decodeWavChannels(rawWav({ channels: 2, bits: 24, data }));
    expect(r.channels).toHaveLength(2);
    expect(r.channels[0][0]).toBeCloseTo(0x200000 / 8388608, 9);
    expect(r.channels[0][1]).toBeCloseTo(0x4000 / 8388608, 9);
    expect(r.channels[1][0]).toBe(0);
  });

  it('float32 stereo ve 8-bit mono kanalları döner', () => {
    const f = new Uint8Array(16);
    const fv = new DataView(f.buffer);
    fv.setFloat32(0, 0.5, true);
    fv.setFloat32(4, -0.5, true);
    fv.setFloat32(8, 0.25, true);
    fv.setFloat32(12, -0.25, true);
    const rs = decodeWavChannels(rawWav({ format: 3, bits: 32, channels: 2, data: f }));
    expect(rs.channels[0][0]).toBeCloseTo(0.5, 7);
    expect(rs.channels[1][1]).toBeCloseTo(-0.25, 7);
    const u8 = decodeWavChannels(rawWav({ bits: 8, data: new Uint8Array([192]) }));
    expect(u8.channels[0][0]).toBeCloseTo((192 - 128) / 128, 7);
  });

  it('bozuk RIFF, eksik chunk ve frame hizasızlığı reddedilir', () => {
    expect(() => decodeWavChannels(new Uint8Array(8))).toThrow(/Geçersiz WAV/);
    // fmt yok: yalnız data chunk'ı.
    const onlyData = new Uint8Array(12 + 8 + 4);
    const v = new DataView(onlyData.buffer);
    const t = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) onlyData[at + i] = s.charCodeAt(i);
    };
    t(0, 'RIFF');
    v.setUint32(4, onlyData.byteLength - 8, true);
    t(8, 'WAVE');
    t(12, 'data');
    v.setUint32(16, 4, true);
    expect(() => decodeWavChannels(onlyData)).toThrow(/fmt veya data/);
    // Stereo 16-bit ama data tek frame değil (3 bayt).
    expect(() =>
      decodeWavChannels(rawWav({ channels: 2, bits: 16, data: new Uint8Array(6) })),
    ).toThrow(/tam örnek frame/);
  });

  it('extensible fmt çok kısa ve float/geçerli-bit uyuşmazlığı reddedilir', () => {
    // format 0xfffe ama fmtSize<40 → "çok kısa"; fmt gövdesi geçerli alanlar taşır.
    const fmtBody = new Uint8Array(18);
    const fv = new DataView(fmtBody.buffer);
    fv.setUint16(0, 0xfffe, true);
    fv.setUint16(2, 1, true);
    fv.setUint32(4, 48000, true);
    fv.setUint32(8, 96000, true);
    fv.setUint16(12, 2, true);
    fv.setUint16(14, 16, true);
    const shortFmt = rawWav({ fmtBody, data: new Uint8Array(4) });
    expect(() => decodeWavChannels(shortFmt)).toThrow(/çok kısa/);
    // float alt biçimde validBits≠bits.
    expect(() =>
      decodeWavChannels(
        extensibleWav({
          channels: 1,
          container: 32,
          valid: 24,
          mask: 0x4,
          float: true,
          frames: [[0.1]],
        }),
      ),
    ).toThrow(/geçerli bit/);
  });
});

describe('kenar dallar — resample / trim / loop / processSample', () => {
  it('resample factor=1 kopya döner; boş kaynak boş döner', () => {
    const src = new Float32Array([1, 2, 3]);
    expect(resample(src, 1)).toEqual(src);
    expect(resample(new Float32Array(0), 2).length).toBe(0);
  });

  it('trimSamples end=0 boş döner; geçersiz giriş reddedilir', () => {
    const data = new Float32Array(10);
    expect(trimSamples(data, { start: 0, end: 0 }, 10).length).toBe(0);
    expect(() => trimSamples(data, { start: -1 }, 10)).toThrow();
    expect(() => trimSamples(data, {}, 0)).toThrow();
  });

  it('loopSamples negatif/tamsayısız hedefi ve boş kaynağı işler', () => {
    const data = new Float32Array([1, 2, 3]);
    expect(() => loopSamples(data, -1)).toThrow(/negatif\/tamsayı/);
    expect(() => loopSamples(data, 2.5)).toThrow(/negatif\/tamsayı/);
    expect(loopSamples(new Float32Array(0), 4).length).toBe(4);
  });

  it('loopSamples kısa kaynakta crossfade istenirse fade=0 yoluna düşer', () => {
    // crossfadeSamples > length/2 → fade sınırlanır; yine de geçiş uygulanır.
    const data = new Float32Array(8).fill(0.5);
    const out = loopSamples(data, 20, true, true, 100);
    expect(out.length).toBe(20);
    // Tek örneklik kaynak: fade=0, mod döngüsü.
    const one = loopSamples(new Float32Array([0.75]), 5, true, true);
    expect(one.every((v) => v === 0.75)).toBe(true);
  });

  it('processSample trim + envelope uygular; kısa kaynakta pad eder', () => {
    const data = new Float32Array(8000).fill(0.5); // 1 sn @8kHz
    const out = processSample(
      {
        data,
        trim: { start: 0.2, end: 0.6 },
        envelope: { attack: 0, hold: 0, decay: 0.01, sustain: 0.01, release: 0, sustainLevel: 0.5 },
        loop: false,
      },
      8000,
      4000,
    );
    expect(out.length).toBe(4000);
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(0.5);
  });
});

/**
 * Gerçekçi WAVE_FORMAT_EXTENSIBLE dosyası: fmt uzunluğu 40, cbSize 22,
 * geçerli bit, kanal maskesi ve 16 baytlık alt biçim GUID'i. Veri sola
 * yaslı yazılır; `junkLowBits` sözleşmeye aykırı dolgu çöpünü taklit eder.
 */
function extensibleWav(opts: {
  channels: number;
  container: 16 | 24 | 32;
  valid: number;
  mask: number;
  subtype?: number;
  guidTail?: number[];
  frames: number[][];
  junkLowBits?: boolean;
  float?: boolean;
}): Uint8Array {
  const bytesPer = opts.container / 8;
  const dataSize = opts.frames.length * opts.channels * bytesPer;
  const out = new Uint8Array(12 + 8 + 40 + 8 + dataSize);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, out.length - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 40, true);
  view.setUint16(20, 0xfffe, true);
  view.setUint16(22, opts.channels, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 48000 * opts.channels * bytesPer, true);
  view.setUint16(32, opts.channels * bytesPer, true);
  view.setUint16(34, opts.container, true);
  view.setUint16(36, 22, true);
  view.setUint16(38, opts.valid, true);
  view.setUint32(40, opts.mask >>> 0, true);
  view.setUint16(44, opts.subtype ?? (opts.float ? 3 : 1), true);
  const tail = opts.guidTail ?? [0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xaa, 0, 0x38, 0x9b, 0x71];
  tail.forEach((b, i) => (out[46 + i] = b));
  text(60, 'data');
  view.setUint32(64, dataSize, true);
  let at = 68;
  const pad = opts.container - opts.valid;
  for (const frame of opts.frames) {
    for (const value of frame) {
      if (opts.float) {
        view.setFloat32(at, value, true);
      } else {
        // `value` geçerli bit çözünürlüğünde tamsayıdır; sola yaslanır.
        let word = value * 2 ** pad;
        if (opts.junkLowBits && pad > 0) word += (1 << pad) - 1;
        if (opts.container === 16) view.setInt16(at, word, true);
        else if (opts.container === 32) view.setInt32(at, word, true);
        else {
          const u = word < 0 ? word + 0x1000000 : word;
          out[at] = u & 0xff;
          out[at + 1] = (u >> 8) & 0xff;
          out[at + 2] = (u >> 16) & 0xff;
        }
      }
      at += bytesPer;
    }
  }
  return out;
}

describe('decodeWav — WAVE_FORMAT_EXTENSIBLE', () => {
  it('20 geçerli bit 24-bit kapta: dolgu bitleri maskelenir, genlik doğru', () => {
    // Yirmi bitlik tamsayılar; beklenen genlik value / 2^19 (sola yaslı veri
    // kabın tam ölçeğiyle okunur). Dolgu bitlerindeki çöp sonucu değiştirmez.
    const values = [0, 1, -1, 262143, -262144, 12345];
    const frames = values.map((v) => [v, v]);
    const clean = decodeWav(
      extensibleWav({ channels: 2, container: 24, valid: 20, mask: 0x3, frames }),
    );
    const dirty = decodeWav(
      extensibleWav({
        channels: 2,
        container: 24,
        valid: 20,
        mask: 0x3,
        frames,
        junkLowBits: true,
      }),
    );
    for (let i = 0; i < values.length; i++) {
      expect(clean.samples[i]).toBeCloseTo(values[i] / 2 ** 19, 9);
      expect(dirty.samples[i]).toBe(clean.samples[i]);
    }
    expect(clean.sampleRate).toBe(48000);
  });

  it('16 geçerli bit 32-bit kapta da aynı sözleşme', () => {
    const dirty = decodeWav(
      extensibleWav({
        channels: 1,
        container: 32,
        valid: 16,
        mask: 0x4,
        frames: [[-12000], [300]],
        junkLowBits: true,
      }),
    );
    expect(dirty.samples[0]).toBeCloseTo(-12000 / 2 ** 15, 9);
    expect(dirty.samples[1]).toBeCloseTo(300 / 2 ** 15, 9);
  });

  it('IEEE float alt biçimi okunur', () => {
    const result = decodeWav(
      extensibleWav({
        channels: 2,
        container: 32,
        valid: 32,
        mask: 0x3,
        float: true,
        frames: [[0.5, -0.25]],
      }),
    );
    expect(result.samples[0]).toBeCloseTo(0.125, 7);
  });

  it('maske kanal sayısından fazla bit taşırsa üst bitler yok sayılır (FL|FR|FC, 2 kanal)', () => {
    const result = decodeWav(
      extensibleWav({ channels: 2, container: 16, valid: 16, mask: 0x7, frames: [[1000, 3000]] }),
    );
    expect(result.samples[0]).toBeCloseTo(2000 / 32768, 9);
  });

  it('belirsiz ya da desteklenmeyen düzen SESSİZCE mono’ya indirilmez', () => {
    const frame = (n: number) => [Array.from({ length: n }, () => 100)];
    // 5.1: LFE ve arka kanalları eşit ağırlıkla toplamak yanlış bir indirgemedir.
    expect(() =>
      decodeWav(
        extensibleWav({ channels: 6, container: 16, valid: 16, mask: 0x3f, frames: frame(6) }),
      ),
    ).toThrow(/kanal düzeni/);
    // Ön sol + LFE: iki kanal ama stereo çift değil.
    expect(() =>
      decodeWav(
        extensibleWav({ channels: 2, container: 16, valid: 16, mask: 0x9, frames: frame(2) }),
      ),
    ).toThrow(/kanal düzeni/);
    // Maske iki kanal için tek bit taşıyor: ikinci kanal atanmamış.
    expect(() =>
      decodeWav(
        extensibleWav({ channels: 2, container: 16, valid: 16, mask: 0x1, frames: frame(2) }),
      ),
    ).toThrow(/kanal düzeni/);
  });

  it('yabancı alt biçim GUID’i ve geçersiz geçerli bit reddedilir', () => {
    const frames = [[100, 100]];
    const ambisonic = [0x21, 0x07, 0xd3, 0x11, 0x86, 0x44, 0xc8, 0xc1, 0xca, 0, 0, 0, 0, 0];
    expect(() =>
      decodeWav(
        extensibleWav({
          channels: 2,
          container: 16,
          valid: 16,
          mask: 0x3,
          guidTail: ambisonic,
          frames,
        }),
      ),
    ).toThrow(/alt biçim/);
    expect(() =>
      decodeWav(extensibleWav({ channels: 2, container: 16, valid: 20, mask: 0x3, frames })),
    ).toThrow(/geçerli bit/);
    expect(() =>
      decodeWav(extensibleWav({ channels: 2, container: 16, valid: 0, mask: 0x3, frames })),
    ).toThrow(/geçerli bit/);
  });

  it('düz PCM’de 2’den fazla kanal belirsizdir ve reddedilir', () => {
    const wav = createTestWav(440, 0.01, 44100);
    const view = new DataView(wav.buffer);
    // 441 örnek 1 kanal → aynı veri 3 kanallı (147 çerçeve) olarak işaretlenir.
    view.setUint16(22, 3, true);
    view.setUint16(32, 6, true);
    view.setUint32(40, 147 * 6, true);
    view.setUint32(4, 36 + 147 * 6, true);
    expect(() => decodeWav(wav.slice(0, 44 + 147 * 6))).toThrow(/kanal düzeni/);
  });
});

describe('loopSamples crossfade — geçiş ölçülür', () => {
  const FADE = 50;

  it('her sınırda sıçrama yoktur: dalga kaldığı yerden sürer', () => {
    // Periyodu kaynağa tam bölünmeyen sinüs: loop noktası keyfi fazda.
    // Eski geçiş başın ilk F örneğine karışıp yeniden samples[0]'dan
    // başlıyordu → her turda head[F−1] → head[0] sıçraması. 220 Hz'de
    // head[49] ≈ 1, head[0] = 0: sıçrama tam genlik olurdu.
    const omega = (2 * Math.PI * 220) / 44100;
    const source = Float32Array.from({ length: 1234 }, (_, i) => Math.sin(i * omega));
    const out = loopSamples(source, 1234 * 6, true, true);
    let worst = 0;
    for (let i = 1; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - out[i - 1]));
    // Sinüsün kendi en büyük örnek farkı ω'dır; geçiş kazancının türevi
    // (≈ π/2F) buna eklenebilir, sıçrama ise ~1 olurdu.
    expect(worst).toBeLessThan(omega + Math.PI / (2 * FADE));
  });

  it('ilintisiz içerikte geçiş gücü düz kalır (doğrusal geçişin −3 dB çukuru yok)', () => {
    // Geçişin ortasındaki güç, bağımsız gürültü kaynakları üzerinden
    // ortalanır; kaynağın geri kalanıyla aynı olmalı.
    const length = 400;
    const trials = 300;
    let middle = 0;
    let rest = 0;
    let restCount = 0;
    for (let seed = 0; seed < trials; seed++) {
      const random = createRandom(seed + 1);
      const source = Float32Array.from({ length }, () => random.bipolar());
      const out = loopSamples(source, length * 2, true, true);
      // İlk geçiş bloğu [length − FADE, length) aralığındadır.
      const center = length - FADE + FADE / 2;
      for (let i = center - 2; i <= center + 2; i++) middle += out[i] ** 2;
      for (let i = 0; i < length - FADE; i++) {
        rest += out[i] ** 2;
        restCount++;
      }
    }
    const ratioDb = 10 * Math.log10(middle / (5 * trials) / (rest / restCount));
    expect(Math.abs(ratioDb)).toBeLessThan(0.5);
  });

  it('tam ilintili içerikte geçiş tümsek üretmez (eşit güç +3 dB verirdi)', () => {
    // Kaynak tam periyotlardan oluşur: kuyruk ile baş aynı dalgadır.
    const period = 40;
    const source = Float32Array.from({ length: period * 10 }, (_, i) =>
      Math.sin((2 * Math.PI * i) / period),
    );
    const out = loopSamples(source, source.length * 3, true, true);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThan(1.01);
  });
});
