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
