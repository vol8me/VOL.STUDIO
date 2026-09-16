import type { MorphologySample } from './metrics';

export type Phase =
  | 'dead'
  | 'stasis'
  | 'gas'
  | 'crystal'
  | 'single-blob'
  | 'void-loss'
  | 'orbit'
  | 'speed-chaos'
  | 'dynamic-structured';

export interface PhaseClassification {
  readonly phase: Phase;
  readonly confidence: number;
  readonly reasons: readonly string[];
}

export interface PhaseClassifierConfig {
  readonly deadActiveThreshold: number;
  readonly stasisSpeedThreshold: number;
  readonly stasisDurationTicks: number;
  readonly crystalCompactnessThreshold: number;
  readonly crystalSpeedThreshold: number;
  readonly blobCompactnessThreshold: number;
  readonly blobMinFraction: number;
  readonly voidLossDominantFraction: number;
  /**
   * Birim tutarlı VACF eşiği (E6). Eski `orbitAutocorrelationThreshold: 0.8`
   * birimsizdi: karşılaştırdığı değer otokorelasyon değil, normalize edilmemiş
   * ortalama kare yer değiştirmeydi — birim bile tutmuyordu.
   */
  readonly orbitVelocityAutocorrelationMin: number;
  /** Yörüngenin kapalılığı: lag sonunda başlangıç komşuluğuna dönen pay. */
  readonly orbitRecurrenceMin: number;
  readonly orbitMinSpeed: number;
  readonly speedChaosMinSpeed: number;
  readonly speedChaosCompactnessThreshold: number;
  readonly structuredCompactnessMin: number;
  readonly structuredSpeedMin: number;
}

export const defaultPhaseConfig: PhaseClassifierConfig = {
  deadActiveThreshold: 0.05,
  stasisSpeedThreshold: 0.02,
  stasisDurationTicks: 60,
  crystalCompactnessThreshold: 0.85,
  crystalSpeedThreshold: 0.01,
  blobCompactnessThreshold: 0.9,
  blobMinFraction: 0.7,
  voidLossDominantFraction: 0.5,
  orbitVelocityAutocorrelationMin: 0.6,
  orbitRecurrenceMin: 0.5,
  orbitMinSpeed: 0.3,
  speedChaosMinSpeed: 1.5,
  speedChaosCompactnessThreshold: 0.2,
  structuredCompactnessMin: 0.3,
  structuredSpeedMin: 0.05,
};

export class PhaseClassifier {
  private readonly config: PhaseClassifierConfig;

  constructor(config: PhaseClassifierConfig = defaultPhaseConfig) {
    this.config = config;
  }

  classify(series: readonly MorphologySample[], initialActive: number): PhaseClassification {
    if (series.length === 0) return { phase: 'dead', confidence: 1, reasons: ['zaman serisi boş'] };
    const last = series[series.length - 1];
    const reasons: string[] = [];
    if (initialActive > 0 && last.activeCount / initialActive < this.config.deadActiveThreshold) {
      reasons.push(
        `aktif madde ${last.activeCount}/${initialActive} (${(
          (last.activeCount / initialActive) *
          100
        ).toFixed(0)}%)`,
      );
      return { phase: 'dead', confidence: 0.95, reasons };
    }
    const recent = series.slice(-this.config.stasisDurationTicks);
    const meanRecentSpeed = avg(recent.map((s) => s.meanSpeed));
    if (
      series.length >= this.config.stasisDurationTicks &&
      meanRecentSpeed < this.config.stasisSpeedThreshold
    ) {
      reasons.push(
        `ortalama hız ${meanRecentSpeed.toFixed(3)} < ${this.config.stasisSpeedThreshold}`,
      );
      return { phase: 'stasis', confidence: 0.9, reasons };
    }
    if (
      last.clusterCompactness > this.config.crystalCompactnessThreshold &&
      last.meanSpeed < this.config.crystalSpeedThreshold
    ) {
      reasons.push(
        `kompaktlık ${last.clusterCompactness.toFixed(2)} > ${
          this.config.crystalCompactnessThreshold
        }, hız ${last.meanSpeed.toFixed(3)}`,
      );
      return { phase: 'crystal', confidence: 0.85, reasons };
    }
    if (
      last.clusterCompactness > this.config.blobCompactnessThreshold &&
      last.activeCount / initialActive > this.config.blobMinFraction
    ) {
      reasons.push(
        `tek blob: kompaktlık ${last.clusterCompactness.toFixed(2)}, aktif ${(
          (last.activeCount / initialActive) *
          100
        ).toFixed(0)}%`,
      );
      return { phase: 'single-blob', confidence: 0.8, reasons };
    }
    const voidLossRate = this.voidLossRate(series);
    if (
      voidLossRate > this.config.voidLossDominantFraction &&
      last.activeCount < initialActive * 0.5
    ) {
      reasons.push(
        `Void kaybı baskın: oran ${voidLossRate.toFixed(2)}, aktif ${(
          (last.activeCount / initialActive) *
          100
        ).toFixed(0)}%`,
      );
      return { phase: 'void-loss', confidence: 0.8, reasons };
    }
    /*
     * Orbit iki koşul ister: hız yönü lag sonunda korunmuş (VACF yüksek) VE
     * parçacık başlangıç komşuluğuna dönmüş (recurrence yüksek). Tek başına
     * VACF doğrusal hareketi de yakalar — doğrusalda VACF 1'dir ama yineleme
     * sıfırdır (ölçüldü).
     */
    if (
      last.velocityAutocorrelation > this.config.orbitVelocityAutocorrelationMin &&
      last.recurrenceFraction > this.config.orbitRecurrenceMin &&
      last.meanSpeed > this.config.orbitMinSpeed
    ) {
      reasons.push(
        `orbit: VACF ${last.velocityAutocorrelation.toFixed(
          2,
        )}, yineleme ${last.recurrenceFraction.toFixed(2)}, hız ${last.meanSpeed.toFixed(2)}`,
      );
      return { phase: 'orbit', confidence: 0.75, reasons };
    }
    if (
      last.meanSpeed > this.config.speedChaosMinSpeed &&
      last.clusterCompactness < this.config.speedChaosCompactnessThreshold
    ) {
      reasons.push(
        `hız kaosu: hız ${last.meanSpeed.toFixed(2)} > ${
          this.config.speedChaosMinSpeed
        }, kompaktlık ${last.clusterCompactness.toFixed(2)}`,
      );
      return { phase: 'speed-chaos', confidence: 0.75, reasons };
    }
    if (last.clusterCompactness < 0.15 && last.meanSpeed > 0.1) {
      reasons.push(
        `gaz: hız ${last.meanSpeed.toFixed(2)}, kompaktlık ${last.clusterCompactness.toFixed(2)}`,
      );
      return { phase: 'gas', confidence: 0.7, reasons };
    }
    if (
      last.clusterCompactness > this.config.structuredCompactnessMin &&
      last.meanSpeed > this.config.structuredSpeedMin
    ) {
      reasons.push(
        `dinamik-yapılı: kompaktlık ${last.clusterCompactness.toFixed(
          2,
        )}, hız ${last.meanSpeed.toFixed(2)}`,
      );
      return { phase: 'dynamic-structured', confidence: 0.65, reasons };
    }
    reasons.push(
      `sınıflandırılamadı: hız ${last.meanSpeed.toFixed(
        2,
      )}, kompaktlık ${last.clusterCompactness.toFixed(2)}`,
    );
    return { phase: 'gas', confidence: 0.4, reasons };
  }

  private voidLossRate(series: readonly MorphologySample[]): number {
    if (series.length < 2) return 0;
    const first = series[0];
    const last = series[series.length - 1];
    const lost = first.activeCount - last.activeCount;
    return first.activeCount > 0 ? Math.max(0, lost / first.activeCount) : 0;
  }
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function isStructured(phase: Phase): boolean {
  return phase === 'dynamic-structured';
}
