import { countOnsets, estimatePitch } from './descriptors';
import type { AudioAnalysisReportV1 } from './report';

/**
 * Tek bir sesin mekanik betimleyici özeti — arama raporu, aile kalite raporu
 * ve bank kayıtları AYNI özeti taşır. Kanonik rapordan okunan alanlar +
 * istek üzerine hesaplanan perde/başlangıç ölçüleri; estetik yargı içermez.
 */
export interface DescriptorSummaryV1 {
  readonly durationSeconds: number;
  readonly activeSeconds: number;
  readonly attackSeconds: number | null;
  readonly decay40Seconds: number | null;
  readonly maxMomentaryLufs: number | null;
  readonly integratedLufs: number | null;
  readonly truePeakDbtp: number | null;
  readonly crestFactorDb: number | null;
  readonly centroidHz: number | null;
  readonly rolloff85Hz: number | null;
  readonly flatness: number | null;
  /** En büyük spektral tepe — perde DEĞİLDİR. */
  readonly spectralPeakHz: number | null;
  /** YIN perdesi; güvenilir değilse `null`. */
  readonly pitchHz: number | null;
  readonly pitchConfidence: number;
  readonly onsetsPerSecond: number;
  readonly clicks: number;
  readonly clippedSamples: number;
}

export function summarizeAudio(
  channels: readonly Float32Array[],
  sampleRate: number,
  report: AudioAnalysisReportV1,
): DescriptorSummaryV1 {
  const pitch = estimatePitch(channels, sampleRate);
  return {
    durationSeconds: report.format.durationSeconds,
    activeSeconds: report.temporal.activeSeconds,
    attackSeconds: report.temporal.attackSeconds,
    decay40Seconds: report.temporal.decay40Seconds,
    maxMomentaryLufs: report.level.maxMomentaryLufs,
    integratedLufs: report.level.integratedLufs,
    truePeakDbtp: report.level.truePeakDbtp,
    crestFactorDb: report.level.crestFactorDb,
    centroidHz: report.spectral.centroidHz,
    rolloff85Hz: report.spectral.rolloff85Hz,
    flatness: report.spectral.flatness,
    spectralPeakHz: report.spectral.peakHz,
    pitchHz: pitch.hz,
    pitchConfidence: pitch.confidence,
    onsetsPerSecond: countOnsets(channels, sampleRate).perSecond,
    clicks: report.defects.clicks.count,
    clippedSamples: report.defects.clips.channelSamples,
  };
}
