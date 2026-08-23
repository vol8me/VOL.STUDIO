import { describe, expect, it } from 'vitest';
import {
  buildPeakPyramid,
  deinterleaveInt16,
  measureAudio,
  selectPeakLevel,
  type PcmInput,
} from '../../server/audioPeaks.js';

/** Interleaved 16-bit PCM üretir. */
function interleaved(
  frames: number,
  channels: number,
  value: (f: number, c: number) => number,
): Buffer {
  const buffer = Buffer.alloc(frames * channels * 2);
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      buffer.writeInt16LE(
        Math.max(-32_768, Math.min(32_767, Math.round(value(frame, channel) * 32_768))),
        (frame * channels + channel) * 2,
      );
    }
  }
  return buffer;
}

function sine(frames: number, channels = 1, amplitude = 0.8): PcmInput {
  return deinterleaveInt16(
    interleaved(frames, channels, (frame) => amplitude * Math.sin((frame / 48) * Math.PI * 2)),
    channels,
    48_000,
  );
}

describe('deinterleaveInt16', () => {
  it('kanalları ayırır ve -1..1 aralığına indirger', () => {
    const buffer = interleaved(4, 2, (frame, channel) => (channel === 0 ? 0.5 : -0.5));

    const pcm = deinterleaveInt16(buffer, 2, 48_000);

    expect(pcm.channelCount).toBe(2);
    expect(pcm.channels).toHaveLength(2);
    expect(pcm.channels[0][0]).toBeCloseTo(0.5, 4);
    expect(pcm.channels[1][0]).toBeCloseTo(-0.5, 4);
  });

  it('negatif uç simetriktir', () => {
    const buffer = Buffer.alloc(2);
    buffer.writeInt16LE(-32_768, 0);

    // 32767 ile bölmek burada -1.00003 verirdi.
    expect(deinterleaveInt16(buffer, 1, 48_000).channels[0][0]).toBe(-1);
  });

  it('eksik frame kalıntısını atar', () => {
    const buffer = Buffer.alloc(5); // 2 kanal × 2 bayt = 4; 1 bayt artıyor

    expect(deinterleaveInt16(buffer, 2, 48_000).channels[0]).toHaveLength(1);
  });

  it('sıfır kanalı reddeder', () => {
    expect(() => deinterleaveInt16(Buffer.alloc(4), 0, 48_000)).toThrow(RangeError);
  });
});

describe('buildPeakPyramid', () => {
  it('kanal başına min/max peak üretir', () => {
    const pyramid = buildPeakPyramid(sine(4096, 2));

    expect(pyramid.channelCount).toBe(2);
    expect(pyramid.frameCount).toBe(4096);
    expect(pyramid.levels[0].framesPerPeak).toBe(256);
    expect(pyramid.levels[0].channels).toHaveLength(2);
    // Her peak min VE max tutar: yalnız mutlak değer asimetriyi yok ederdi.
    expect(pyramid.levels[0].channels[0]).toHaveLength((4096 / 256) * 2);
  });

  it('min ve max gerçek uçları korur', () => {
    const pcm = sine(1024, 1, 0.9);

    const level = buildPeakPyramid(pcm).levels[0];

    expect(level.channels[0][0]).toBeLessThan(-0.8);
    expect(level.channels[0][1]).toBeGreaterThan(0.8);
  });

  it('uzun seste birden çok seviye üretir', () => {
    const pyramid = buildPeakPyramid(sine(48_000 * 10));

    expect(pyramid.levels.length).toBeGreaterThan(1);
    // Seviyeler kabalaşarak ilerler.
    for (let index = 1; index < pyramid.levels.length; index += 1) {
      expect(pyramid.levels[index].framesPerPeak).toBeGreaterThan(
        pyramid.levels[index - 1].framesPerPeak,
      );
    }
  });

  it('çok kısa ses en az bir seviye verir', () => {
    const pyramid = buildPeakPyramid(sine(10));

    expect(pyramid.levels).toHaveLength(1);
    expect(pyramid.levels[0].channels[0].length).toBeGreaterThanOrEqual(2);
  });

  it('boş ses çökmez', () => {
    const pyramid = buildPeakPyramid({
      sampleRate: 48_000,
      channelCount: 1,
      channels: [new Float32Array(0)],
    });

    expect(pyramid.frameCount).toBe(0);
    expect(pyramid.levels).toHaveLength(1);
  });
});

describe('selectPeakLevel', () => {
  it('geniş pencerede kaba, dar pencerede ince seviye seçer', () => {
    const pyramid = buildPeakPyramid(sine(48_000 * 20));

    const wide = selectPeakLevel(pyramid, pyramid.frameCount, 800);
    const narrow = selectPeakLevel(pyramid, 4096, 800);

    expect(wide.framesPerPeak).toBeGreaterThanOrEqual(narrow.framesPerPeak);
  });

  it('aşırı dar pencerede en ince seviyeye düşer', () => {
    const pyramid = buildPeakPyramid(sine(48_000));

    expect(selectPeakLevel(pyramid, 100, 800).framesPerPeak).toBe(pyramid.levels[0].framesPerPeak);
  });
});

describe('measureAudio', () => {
  it('sağlıklı sesi geçirir', () => {
    const report = measureAudio(sine(4800, 2, 0.7));

    expect(report.pass).toBe(true);
    expect(report.clippedFrames).toBe(0);
    expect(report.peakDbfs).toBeLessThan(0);
    expect(Math.abs(report.dcOffset)).toBeLessThan(0.01);
  });

  it('kırpılmış sesi düşürür', () => {
    const clipped = deinterleaveInt16(
      interleaved(1000, 1, () => 1),
      1,
      48_000,
    );

    const report = measureAudio(clipped);

    expect(report.clippedFrames).toBeGreaterThan(0);
    expect(report.pass).toBe(false);
  });

  it('tamamen sessiz çıktıyı düşürür', () => {
    const report = measureAudio(deinterleaveInt16(Buffer.alloc(2000), 1, 48_000));

    expect(report.pass).toBe(false);
    expect(report.peakDbfs).toBe(-Infinity);
  });

  it('DC kaymasını yakalar', () => {
    const offset = deinterleaveInt16(
      interleaved(1000, 1, () => 0.5),
      1,
      48_000,
    );

    const report = measureAudio(offset);

    expect(report.dcOffset).toBeGreaterThan(0.4);
    expect(report.pass).toBe(false);
  });

  it('baştaki ve sondaki sessizliği ölçer', () => {
    const pcm = deinterleaveInt16(
      interleaved(300, 1, (frame) => (frame >= 100 && frame < 200 ? 0.5 : 0)),
      1,
      48_000,
    );

    const report = measureAudio(pcm);

    expect(report.silentLeadFrames).toBe(100);
    expect(report.silentTailFrames).toBe(100);
  });
});
