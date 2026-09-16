import type { ExperimentScenario, VoidProfile } from '@/config/candidate';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';
import type { MorphologySample } from './metrics';

/**
 * İki senaryonun AYRILMASI (E10).
 *
 * `intrinsic` sorusu şudur: yapı kıyıdan bağımsız olarak kendini koruyor mu?
 * Bu yüzden morfoloji yalnız GÜVENLİ ALANDAKİ maddeyle değerlendirilir ve
 * dışarıda kalan madde ayrı sayılır. Güvenli alanın sınırı uydurulmaz:
 * DESIGN §2'nin fiziği, kıyı mesafesi fringe genişliğinden büyükse kuvveti
 * KESİNLİKLE sıfır tutar (`VoidSink.applyFringeStress`). Kapsam sınırı odur.
 *
 * `void-stress` sorusu tam tersidir — yapının kıyıyla etkileşimi ölçülür — bu
 * yüzden kapsam daraltılmaz.
 */
export interface MorphologyScope {
  /** Kıyı mesafesi bunun altındaki madde morfolojiden dışlanır. */
  readonly minEdgeDistanceUnits: number;
}

export function resolveMorphologyScope(
  scenario: ExperimentScenario,
  voidProfile: VoidProfile,
): MorphologyScope {
  if (scenario.kind === 'intrinsic') {
    return { minEdgeDistanceUnits: voidProfile.widthUnits };
  }
  return { minEdgeDistanceUnits: Number.NEGATIVE_INFINITY };
}

/**
 * §8.4 `FRINGE_DEPENDENT`: "Yapılı maddenin > %50'si zamanın çoğunda fringe
 * bandında, ya da `tidalStrength = 0` kontrolünde yapı kayboluyor."
 *
 * "Yapı kayboluyor" için ayrı bir sayı UYDURULMADI: §8.4'ün GAS satırı zaten
 * kümedeki madde payı < %20'yi yapısızlık sayar. Kontrol koşusu o eşiğin
 * altına düşerken tidal koşu üstünde kalıyorsa yapı tidal desteğe bağımlıdır.
 */
export interface VoidStressConfig {
  readonly fringeStructuredFractionLimit: number;
  readonly majorityOfTime: number;
  readonly structurelessClusteredFraction: number;
}

export const defaultVoidStressConfig: VoidStressConfig = {
  fringeStructuredFractionLimit: 0.5,
  majorityOfTime: 0.5,
  structurelessClusteredFraction: 0.2,
};

export interface VoidStressComparison {
  /** Yapılı maddenin yarıdan fazlasının fringe'de olduğu örneklerin payı. */
  readonly fringeResidencyFraction: number;
  /** Tidal koşunun son yapılı madde payı. */
  readonly tidalClusteredFraction: number;
  /** `tidalStrength = 0` kontrolünün son yapılı madde payı. */
  readonly controlClusteredFraction: number;
  /** Kontrolde yapı yapısızlık eşiğinin altına düşerken tidal koşu üstünde mi. */
  readonly structureLostInControl: boolean;
  /** Tidal deformasyon: en büyük kümenin solidity ortalaması, kontrol − tidal. */
  readonly deformationDelta: number;
  /** Kıyıyı geçen madde farkı, tidal − kontrol. */
  readonly crossingDelta: number;
  /** Yapı sürekliliği farkı: yapılı madde payı ortalaması, tidal − kontrol. */
  readonly continuityDelta: number;
  readonly fringeDependent: boolean;
  readonly reasons: readonly string[];
}

function meanTopSolidity(series: readonly MorphologySample[]): number {
  const values = series
    .map((sample) => sample.clusters[0]?.solidity)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanClustered(series: readonly MorphologySample[]): number {
  return series.reduce((sum, sample) => sum + sample.clusteredFraction, 0) / series.length;
}

export function measureVoidStress(
  tidal: readonly MorphologySample[],
  control: readonly MorphologySample[],
  config: VoidStressConfig = defaultVoidStressConfig,
): VoidStressComparison {
  if (tidal.length === 0 || control.length === 0) {
    throw new RangeError('Void-stress karşılaştırması iki koşunun da serisini ister.');
  }
  const residentSamples = tidal.filter(
    (sample) => sample.fringeStructuredFraction > config.fringeStructuredFractionLimit,
  ).length;
  const fringeResidencyFraction = residentSamples / tidal.length;
  const tidalClustered = tidal[tidal.length - 1].clusteredFraction;
  const controlClustered = control[control.length - 1].clusteredFraction;
  const structureLostInControl =
    controlClustered < config.structurelessClusteredFraction &&
    tidalClustered >= config.structurelessClusteredFraction;

  const reasons: string[] = [];
  if (fringeResidencyFraction > config.majorityOfTime) {
    reasons.push(
      `yapılı maddenin > %${config.fringeStructuredFractionLimit * 100}'si örneklerin %${(
        fringeResidencyFraction * 100
      ).toFixed(0)}'inde fringe bandında`,
    );
  }
  if (structureLostInControl) {
    reasons.push(
      `tidal kontrolünde yapı kayboluyor: ${controlClustered.toFixed(2)} < ${
        config.structurelessClusteredFraction
      }, tidal koşuda ${tidalClustered.toFixed(2)}`,
    );
  }

  return {
    fringeResidencyFraction,
    tidalClusteredFraction: tidalClustered,
    controlClusteredFraction: controlClustered,
    structureLostInControl,
    deformationDelta: meanTopSolidity(control) - meanTopSolidity(tidal),
    crossingDelta:
      tidal[tidal.length - 1].voidLossCount - control[control.length - 1].voidLossCount,
    continuityDelta: meanClustered(tidal) - meanClustered(control),
    fringeDependent: reasons.length > 0,
    reasons,
  };
}

/**
 * Yapıyı KATI olarak kıyıya doğru taşır (E10). Her üye kendi normali boyunca
 * taşınsaydı yapıyı ölçümden ÖNCE biz deforme ederdik ve sonra "tidal deforme
 * etti" diye okurduk; bu yüzden taşıma vektörü merkezin normalinden çıkar ve
 * bütün üyelere AYNI uygulanır.
 */
export function translateTowardShore(
  particles: ParticleStore,
  slots: readonly number[],
  domain: WorldDomain,
  distanceUnits: number,
): void {
  if (slots.length === 0) return;
  let centroidX = 0;
  let centroidY = 0;
  for (const slot of slots) {
    centroidX += particles.x[slot];
    centroidY += particles.y[slot];
  }
  centroidX /= slots.length;
  centroidY /= slots.length;
  const sample = domain.sampleDistanceAndNormal(centroidX, centroidY);
  // Normal içeriden dışarı bakar; kıyıya yaklaşmak onun yönünde ilerlemektir.
  for (const slot of slots) {
    particles.x[slot] += sample.normalX * distanceUnits;
    particles.y[slot] += sample.normalY * distanceUnits;
  }
}
