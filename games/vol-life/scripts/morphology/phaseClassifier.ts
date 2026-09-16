import type { MorphologySample } from './metrics';

/**
 * Sabit gerekçe kodları (E11). Liste DONDURULMUŞTUR: yeni bir kod eklemek
 * §8.4'e satır eklemek demektir, koda sabit gömmek değil.
 */
export const REASON_CODES = [
  'DEAD',
  'STARTUP_MASSACRE',
  'VOID_LOSS_DOMINATED',
  'SPEED_CAP_CHAOS',
  'STASIS',
  'CRYSTAL_FROZEN',
  'SINGLE_COLLAPSE',
  'GAS',
  'MICRO_ORBIT_PERSISTENT',
  'FRINGE_DEPENDENT',
  'DYNAMIC_STRUCTURED',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Birincil gerekçe sırası: muhasebe çöküşü > fizik patlaması > dejenere
 * kararlı hâl > yapı kalitesi. Ölü ya da doğumda katledilmiş bir dünyanın
 * yapısı tartışılmaz, bu yüzden onlar önce gelir. `DYNAMIC_STRUCTURED` yalnız
 * başka hiçbir gerekçe ateşlemediğinde kalır.
 */
const SEVERITY: readonly ReasonCode[] = REASON_CODES;

export interface PhaseClassification {
  /** Seed'in birincil gerekçesi; sıralama `SEVERITY`dir. */
  readonly primary: ReasonCode;
  /** Ateşleyen bütün gerekçeler; bir seed birden fazla taşıyabilir. */
  readonly reasons: readonly ReasonCode[];
  readonly confidence: number;
  /** İnsan için ölçülen sayılar; kod değil metin. */
  readonly details: readonly string[];
}

export interface PhaseClassifierConfig {
  /** Süreler SANİYE cinsindendir; örnek sayısına tempoyla çevrilir. */
  readonly fixedStepMs: number;
  readonly sampleIntervalTicks: number;
  readonly maxSpeedUnitsPerReferenceTick: number;

  /* §8.4'ten BİREBİR alınan satırlar. */
  readonly deadActiveFraction: number;
  readonly stasisSpeedFractionOfCap: number;
  readonly stasisSeconds: number;
  readonly gasClusteredFraction: number;
  readonly gasSeconds: number;
  readonly singleCollapseFraction: number;
  readonly singleCollapseSeconds: number;
  readonly speedCapFraction: number;
  readonly speedCapSeconds: number;
  readonly microOrbitFraction: number;
  readonly microOrbitSeconds: number;

  /*
   * §8.4'te SATIRI OLMAYAN kodlar. Eşikler kodun kendi tarihinden gelir ve
   * ön-kayıtlı değildir; bir aday değerlendirmesinden sonra değişirlerse o ana
   * kadarki sonuçlar geçersizdir.
   */
  readonly crystalCompactnessThreshold: number;
  readonly crystalSpeedThreshold: number;
  readonly voidLossDominantFraction: number;
  readonly structuredCompactnessMin: number;
  readonly structuredSpeedMin: number;
}

export const defaultPhaseConfig: PhaseClassifierConfig = {
  fixedStepMs: 1000 / 60,
  sampleIntervalTicks: 10,
  maxSpeedUnitsPerReferenceTick: 2.4,
  deadActiveFraction: 0.05,
  stasisSpeedFractionOfCap: 0.02,
  stasisSeconds: 60,
  gasClusteredFraction: 0.2,
  gasSeconds: 300,
  singleCollapseFraction: 0.8,
  singleCollapseSeconds: 300,
  speedCapFraction: 0.3,
  speedCapSeconds: 60,
  microOrbitFraction: 0.05,
  microOrbitSeconds: 300,
  crystalCompactnessThreshold: 0.85,
  crystalSpeedThreshold: 0.01,
  voidLossDominantFraction: 0.5,
  structuredCompactnessMin: 0.3,
  structuredSpeedMin: 0.05,
};

/**
 * Serinin kendisinden çıkmayan bulgular buradan girer: başlangıç sağkalımı
 * E9'un, fringe bağımlılığı E10'un, micro-orbit payı E7'nin ölçümüdür.
 */
export interface ClassificationContext {
  readonly startupMassacre?: boolean;
  readonly fringeDependent?: boolean;
  /** Örnek başına kalıcı micro-orbit madde payı; seriyle AYNI uzunlukta olmalı. */
  readonly microOrbitFractionSeries?: readonly number[];
}

export class PhaseClassifier {
  private readonly config: PhaseClassifierConfig;

  constructor(config: PhaseClassifierConfig = defaultPhaseConfig) {
    this.config = config;
  }

  classify(
    series: readonly MorphologySample[],
    initialActive: number,
    context: ClassificationContext = {},
  ): PhaseClassification {
    if (series.length === 0) {
      return { primary: 'DEAD', reasons: ['DEAD'], confidence: 1, details: ['zaman serisi boş'] };
    }
    if (
      context.microOrbitFractionSeries !== undefined &&
      context.microOrbitFractionSeries.length !== series.length
    ) {
      throw new RangeError(
        `Micro-orbit serisi örnek serisiyle aynı uzunlukta olmalı: ${context.microOrbitFractionSeries.length} ≠ ${series.length}`,
      );
    }

    const reasons: ReasonCode[] = [];
    const details: string[] = [];
    const last = series[series.length - 1];
    const activeFraction = initialActive > 0 ? last.activeCount / initialActive : 0;

    if (initialActive > 0 && activeFraction < this.config.deadActiveFraction) {
      reasons.push('DEAD');
      details.push(`aktif madde ${last.activeCount}/${initialActive}`);
    }
    if (context.startupMassacre === true) {
      reasons.push('STARTUP_MASSACRE');
      details.push('başlangıç sağkalımı kapısı düştü (E9)');
    }
    if (this.voidLossRate(series) > this.config.voidLossDominantFraction && activeFraction < 0.5) {
      reasons.push('VOID_LOSS_DOMINATED');
      details.push(`Void kaybı oranı ${this.voidLossRate(series).toFixed(2)}`);
    }

    const cap = this.config.maxSpeedUnitsPerReferenceTick;
    if (
      this.heldFor(
        series,
        this.config.speedCapSeconds,
        (s) => s.cappedFraction >= this.config.speedCapFraction,
      )
    ) {
      reasons.push('SPEED_CAP_CHAOS');
      details.push(
        `tavandaki pay ${this.config.speedCapSeconds} sn boyunca ≥ ${this.config.speedCapFraction}`,
      );
    }
    if (
      this.heldFor(
        series,
        this.config.stasisSeconds,
        (s) => s.meanSpeed < cap * this.config.stasisSpeedFractionOfCap,
      )
    ) {
      reasons.push('STASIS');
      details.push(
        `hız ${this.config.stasisSeconds} sn boyunca tavanın %${
          this.config.stasisSpeedFractionOfCap * 100
        }'inin altında`,
      );
    }
    if (
      last.clusterCompactness > this.config.crystalCompactnessThreshold &&
      last.meanSpeed < this.config.crystalSpeedThreshold
    ) {
      reasons.push('CRYSTAL_FROZEN');
      details.push(
        `kompaktlık ${last.clusterCompactness.toFixed(2)}, hız ${last.meanSpeed.toFixed(3)}`,
      );
    }
    if (
      this.heldFor(series, this.config.singleCollapseSeconds, (s) =>
        s.activeCount > 0
          ? s.clusterSizeMax / s.activeCount >= this.config.singleCollapseFraction
          : false,
      )
    ) {
      reasons.push('SINGLE_COLLAPSE');
      details.push(
        `en büyük küme ${this.config.singleCollapseSeconds} sn boyunca maddenin ≥ %${
          this.config.singleCollapseFraction * 100
        }'i`,
      );
    }
    if (
      this.heldFor(
        series,
        this.config.gasSeconds,
        (s) => s.clusteredFraction < this.config.gasClusteredFraction,
      )
    ) {
      reasons.push('GAS');
      details.push(
        `kümedeki madde ${this.config.gasSeconds} sn boyunca < %${
          this.config.gasClusteredFraction * 100
        }`,
      );
    }
    const orbitSeries = context.microOrbitFractionSeries;
    if (
      orbitSeries !== undefined &&
      this.heldForIndexed(
        series.length,
        this.config.microOrbitSeconds,
        (index) => orbitSeries[index] > this.config.microOrbitFraction,
      )
    ) {
      reasons.push('MICRO_ORBIT_PERSISTENT');
      details.push(
        `micro-orbit payı ${this.config.microOrbitSeconds} sn boyunca > %${
          this.config.microOrbitFraction * 100
        }`,
      );
    }
    if (context.fringeDependent === true) {
      reasons.push('FRINGE_DEPENDENT');
      details.push('fringe bağımlılığı ölçüldü (E10)');
    }

    if (reasons.length === 0) {
      const structured =
        last.clusterCompactness > this.config.structuredCompactnessMin &&
        last.meanSpeed > this.config.structuredSpeedMin;
      if (structured) {
        return {
          primary: 'DYNAMIC_STRUCTURED',
          reasons: ['DYNAMIC_STRUCTURED'],
          confidence: 0.65,
          details: [
            `kompaktlık ${last.clusterCompactness.toFixed(2)}, hız ${last.meanSpeed.toFixed(2)}`,
          ],
        };
      }
      /*
       * Hiçbir kural ateşlemedi ve yapı ölçütü de tutmadı. Bu GAS DEĞİLDİR:
       * eski kod böyle bir koşuyu %40 güvenle "gas" sayıyordu ve ölçmediği bir
       * şeyi iddia ediyordu. Artık yapısızlık ayrı bir gerekçe olmadan
       * DYNAMIC_STRUCTURED verilmez, gerekçe listesi de boş kalır.
       */
      return {
        primary: 'GAS',
        reasons: [],
        confidence: 0.3,
        details: [
          `sınıflandırılamadı: kompaktlık ${last.clusterCompactness.toFixed(
            2,
          )}, hız ${last.meanSpeed.toFixed(2)}`,
        ],
      };
    }

    const primary = SEVERITY.find((code) => reasons.includes(code)) ?? reasons[0];
    return { primary, reasons, confidence: 0.9, details };
  }

  /**
   * "N saniye boyunca" kuralı. Süre SANİYEdir ve örnek sayısına tempoyla
   * çevrilir; eski kod tick sayısını örnek sayısıyla karşılaştırıyordu ve
   * örnek aralığı kadar yanılıyordu.
   *
   * Seri pencereden kısaysa kural ATEŞLEMEZ: gözlemlenmemiş bir süre iddia
   * edilmez.
   */
  private heldFor(
    series: readonly MorphologySample[],
    seconds: number,
    predicate: (sample: MorphologySample) => boolean,
  ): boolean {
    const window = this.samplesForSeconds(seconds);
    if (series.length < window) return false;
    return series.slice(-window).every(predicate);
  }

  /** Aynı kural, seriyle hizalı yan diziler için (micro-orbit payı). */
  private heldForIndexed(
    length: number,
    seconds: number,
    predicate: (index: number) => boolean,
  ): boolean {
    const window = this.samplesForSeconds(seconds);
    if (length < window) return false;
    for (let index = length - window; index < length; index++) {
      if (!predicate(index)) return false;
    }
    return true;
  }

  private samplesForSeconds(seconds: number): number {
    const ticks = (seconds * 1000) / this.config.fixedStepMs;
    return Math.max(1, Math.ceil(ticks / this.config.sampleIntervalTicks));
  }

  private voidLossRate(series: readonly MorphologySample[]): number {
    if (series.length < 2) return 0;
    const first = series[0];
    const last = series[series.length - 1];
    const lost = first.activeCount - last.activeCount;
    return first.activeCount > 0 ? Math.max(0, lost / first.activeCount) : 0;
  }
}

export interface CandidateAggregation {
  /** Seed'lerin ≥ %50'sinde görülen gerekçe; yoksa null. ÇOĞUNLUK, plurality değil. */
  readonly majorityReason: ReasonCode | null;
  readonly reasonCounts: Readonly<Partial<Record<ReasonCode, number>>>;
  readonly seedCount: number;
  readonly failed: boolean;
  readonly structured: boolean;
}

export interface AggregationConfig {
  readonly hardFailSeedFraction: number;
  readonly structuredSeedFraction: number;
}

/** §8.4 "Aday toplama" satırı; iki oran da ön-kayıtlıdır. */
export const defaultAggregationConfig: AggregationConfig = {
  hardFailSeedFraction: 0.5,
  structuredSeedFraction: 0.75,
};

/**
 * Aday kararı ÇOĞUNLUKLA verilir. Eski `dominantPhase` en çok görülen fazı
 * seçiyordu (plurality): seed'lerin %40'ında GAS, %30'unda STASIS, %30'unda
 * yapı varsa aday "GAS" ilan ediliyordu — oysa hiçbir gerekçe çoğunlukta değil.
 */
export function aggregateSeedVerdicts(
  verdicts: readonly PhaseClassification[],
  config: AggregationConfig = defaultAggregationConfig,
): CandidateAggregation {
  if (verdicts.length === 0) throw new RangeError('Toplama en az bir seed ister.');
  const counts: Partial<Record<ReasonCode, number>> = {};
  for (const verdict of verdicts) {
    for (const code of verdict.reasons) counts[code] = (counts[code] ?? 0) + 1;
  }
  const seedCount = verdicts.length;
  const majorityReason =
    SEVERITY.find((code) => (counts[code] ?? 0) / seedCount >= config.hardFailSeedFraction) ?? null;
  const structuredCount = counts.DYNAMIC_STRUCTURED ?? 0;
  const structured = structuredCount / seedCount >= config.structuredSeedFraction;
  const failed = majorityReason !== null && majorityReason !== 'DYNAMIC_STRUCTURED';
  return { majorityReason, reasonCounts: counts, seedCount, failed, structured };
}

export function isStructured(aggregation: CandidateAggregation): boolean {
  return aggregation.structured && !aggregation.failed;
}
