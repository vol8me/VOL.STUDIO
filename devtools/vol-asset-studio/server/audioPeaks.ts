import type { AudioPeakLevel, AudioPeakPyramid } from '../shared/audio.js';

/** İlk seviyede bir peak kaç frame'i temsil eder. */
const BASE_FRAMES_PER_PEAK = 256;
/** Seviyeler arası küçültme çarpanı. */
const LEVEL_STEP = 4;
/** En üst seviyede en fazla bu kadar peak kalır. */
const MIN_PEAKS = 64;

export interface PcmInput {
  sampleRate: number;
  channelCount: number;
  /** Kanal başına ayrılmış (deinterleaved) örnekler, -1..1. */
  channels: Float32Array[];
}

/**
 * Interleaved 16-bit PCM'i kanallara ayırır ve -1..1 aralığına normalize eder.
 *
 * Kanalları ayırmak zorunludur: waveform kanal başına çizilir ve interleaved
 * tampon üzerinde her okuma bir çarpma-toplama gerektirir; uzun seslerde bu
 * maliyet zoom sırasında hissedilir.
 */
export function deinterleaveInt16(
  buffer: Buffer,
  channelCount: number,
  sampleRate: number,
): PcmInput {
  if (channelCount < 1) throw new RangeError('channelCount pozitif olmalı');
  const frameCount = Math.floor(buffer.length / 2 / channelCount);
  const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const offset = (frame * channelCount + channel) * 2;
      // 32768 ile bölmek -1..1 aralığını simetrik tutar; 32767 kullanmak
      // negatif uçta taşma yaratır.
      channels[channel][frame] = buffer.readInt16LE(offset) / 32_768;
    }
  }
  return { sampleRate, channelCount, channels };
}

/**
 * Kanal başına min/max peak piramidi kurar.
 *
 * Piramit ZORUNLUDUR: 5 dakikalık 48 kHz stereo ses 28 milyon örnektir ve
 * tarayıcıya tam PCM göndermek hem bandı hem belleği tüketir. Zoom seviyesine
 * uygun seviye seçilir, yalnız o taşınır.
 *
 * Her peak min VE max tutar; yalnız mutlak değer saklamak dalga formunun
 * asimetrisini yok eder ve DC kaymasını görünmez kılar.
 */
export function buildPeakPyramid(input: PcmInput): AudioPeakPyramid {
  const frameCount = input.channels[0]?.length ?? 0;
  const levels: AudioPeakLevel[] = [];
  let framesPerPeak = BASE_FRAMES_PER_PEAK;

  while (framesPerPeak <= Math.max(frameCount, 1)) {
    const peakCount = Math.max(1, Math.ceil(frameCount / framesPerPeak));
    const channels = input.channels.map((samples) => {
      const peaks = new Float32Array(peakCount * 2);
      for (let peak = 0; peak < peakCount; peak += 1) {
        const start = peak * framesPerPeak;
        const end = Math.min(frameCount, start + framesPerPeak);
        let minimum = 0;
        let maximum = 0;
        for (let index = start; index < end; index += 1) {
          const value = samples[index];
          if (value < minimum) minimum = value;
          if (value > maximum) maximum = value;
        }
        peaks[peak * 2] = minimum;
        peaks[peak * 2 + 1] = maximum;
      }
      return peaks;
    });
    levels.push({ framesPerPeak, channels });
    if (peakCount <= MIN_PEAKS) break;
    framesPerPeak *= LEVEL_STEP;
  }

  if (levels.length === 0) {
    levels.push({
      framesPerPeak: BASE_FRAMES_PER_PEAK,
      channels: input.channels.map(() => new Float32Array(2)),
    });
  }

  return {
    sampleRate: input.sampleRate,
    channelCount: input.channelCount,
    frameCount,
    levels,
  };
}

/**
 * Görünür pencere için en uygun seviyeyi seçer.
 *
 * Hedef, bir ekran pikseline yaklaşık bir peak düşürmektir: daha ince seviye
 * boşuna veri taşır, daha kaba seviye dalga formunu bozar.
 */
export function selectPeakLevel(
  pyramid: AudioPeakPyramid,
  visibleFrames: number,
  pixelWidth: number,
): AudioPeakLevel {
  const desired = Math.max(1, visibleFrames / Math.max(1, pixelWidth));
  let best = pyramid.levels[0];
  for (const level of pyramid.levels) {
    if (level.framesPerPeak <= desired) best = level;
    else break;
  }
  return best;
}

export interface AudioQaReport {
  peakDbfs: number;
  rmsDbfs: number;
  clippedFrames: number;
  silentLeadFrames: number;
  silentTailFrames: number;
  dcOffset: number;
  pass: boolean;
}

/** Kaydedilen sesin yapısal denetimi. */
export function measureAudio(input: PcmInput, clipThreshold = 0.999): AudioQaReport {
  const frameCount = input.channels[0]?.length ?? 0;
  let peak = 0;
  let squareSum = 0;
  let sum = 0;
  let clipped = 0;
  for (const samples of input.channels) {
    for (let index = 0; index < samples.length; index += 1) {
      const value = samples[index];
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
      if (magnitude >= clipThreshold) clipped += 1;
      squareSum += value * value;
      sum += value;
    }
  }
  const total = frameCount * input.channelCount || 1;
  const rms = Math.sqrt(squareSum / total);
  const silenceLimit = 1 / 32_768;
  let lead = 0;
  while (lead < frameCount && input.channels.every((s) => Math.abs(s[lead]) <= silenceLimit)) {
    lead += 1;
  }
  let tail = 0;
  while (
    tail < frameCount - lead &&
    input.channels.every((s) => Math.abs(s[frameCount - 1 - tail]) <= silenceLimit)
  ) {
    tail += 1;
  }
  const report: AudioQaReport = {
    peakDbfs: toDbfs(peak),
    rmsDbfs: toDbfs(rms),
    clippedFrames: clipped,
    silentLeadFrames: lead,
    silentTailFrames: tail,
    dcOffset: sum / total,
    pass: false,
  };
  // Tamamen sessiz çıktı ve kırpılmış tepe, kaydın sessizce bozulduğunu
  // gösteren iki temel işarettir.
  report.pass = clipped === 0 && peak > silenceLimit && Math.abs(report.dcOffset) < 0.02;
  return report;
}

function toDbfs(value: number): number {
  return value <= 0 ? -Infinity : 20 * Math.log10(value);
}
