import type { LifeWorld, LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export type PerturbationKind =
  | 'velocity-kick'
  | 'position-shift'
  | 'matter-removal'
  | 'force-pulse';

export interface PerturbationSpec {
  readonly kind: PerturbationKind;
  readonly magnitude: number;
  readonly targetFraction: number;
  /** ÖN-KAYITLI uygulama anı; koşu sırasına göre kaymaz. */
  readonly tick: number;
}

export interface PerturbationSnapshot {
  readonly activeCount: number;
  readonly meanSpeed: number;
  readonly clusterCompactness: number;
  readonly centroidX: number;
  readonly centroidY: number;
}

/** Bir ölçünün taban penceresindeki ortalaması ve değişkenliği. */
export interface BaselineBand {
  readonly mean: number;
  readonly sigma: number;
}

export interface PerturbationBaseline {
  readonly activeCount: BaselineBand;
  readonly meanSpeed: BaselineBand;
  readonly clusterCompactness: BaselineBand;
  readonly sampleCount: number;
}

export interface PerturbationResult {
  readonly spec: PerturbationSpec;
  readonly baseline: PerturbationBaseline;
  readonly postState: PerturbationSnapshot;
  readonly recoveryTicks: number;
  readonly recovered: boolean;
  /** Toparlanmadıysa hangi ölçünün banda dönmediği. */
  readonly outOfBand: readonly string[];
}

export interface PerturbationConfig {
  /** §8.4: normalize metrikler taban bandına (±2σ) döner. */
  readonly baselineSigmaMultiple: number;
  /** §8.4: toparlanma 60 saniye içinde. */
  readonly recoverySeconds: number;
  /** Taban penceresi; σ buradan ölçülür. */
  readonly baselineSeconds: number;
  readonly fixedStepMs: number;
  /** Taban ve toparlanma örnekleme aralığı. */
  readonly sampleIntervalTicks: number;
  /**
   * σ tabanı. §8.4 bunu karşılamıyor ama kusursuz sabit bir taban penceresinde
   * σ sıfıra çöker ve ±2σ bandı sıfır genişlikte olur; kayan noktalı fizikte
   * hiçbir koşu o bandın içine dönemezdi. Taban, ortalamanın bu oranıdır.
   */
  readonly sigmaFloorFraction: number;
}

export const defaultPerturbationConfig: PerturbationConfig = {
  baselineSigmaMultiple: 2,
  recoverySeconds: 60,
  baselineSeconds: 10,
  fixedStepMs: 1000 / 60,
  sampleIntervalTicks: 10,
  sigmaFloorFraction: 0.01,
};

export class PerturbationSystem {
  private readonly config: PerturbationConfig;

  constructor(config: PerturbationConfig = defaultPerturbationConfig) {
    this.config = config;
  }

  /**
   * Protokolün TAMAMI buradadır ve sıra bağımsızlığı YAPISALDIR: her spec,
   * aynı snapshot'a geri yüklenmiş dünyada koşar. Eski hâlinde `apply` canlı
   * dünyayı bozuyor, sonraki spec bozulmuş dünyada koşuyordu; spec sırası
   * sonucu değiştiriyordu.
   */
  runAll(world: LifeWorld, specs: readonly PerturbationSpec[]): PerturbationResult[] {
    const converged = world.snapshot();
    const baseline = this.measureBaseline(world, converged);
    const results: PerturbationResult[] = [];
    for (const spec of specs) {
      world.restore(converged);
      results.push(this.runOne(world, baseline, spec));
    }
    world.restore(converged);
    return results;
  }

  /** Perturbation ÖNCESİ değişkenlik; recovery bandı buradan çıkar (§8.4). */
  measureBaseline(world: LifeWorld, converged: LifeWorldSnapshot): PerturbationBaseline {
    world.restore(converged);
    const samples: PerturbationSnapshot[] = [];
    const ticks = this.ticksForSeconds(this.config.baselineSeconds);
    for (let tick = 0; tick < ticks; tick++) {
      world.step();
      if (tick % this.config.sampleIntervalTicks === 0)
        samples.push(this.snapshot(world.particles));
    }
    if (samples.length < 2) {
      throw new RangeError(`Taban penceresi en az iki örnek ister: ${samples.length}`);
    }
    return {
      activeCount: band(samples.map((s) => s.activeCount)),
      meanSpeed: band(samples.map((s) => s.meanSpeed)),
      clusterCompactness: band(samples.map((s) => s.clusterCompactness)),
      sampleCount: samples.length,
    };
  }

  private runOne(
    world: LifeWorld,
    baseline: PerturbationBaseline,
    spec: PerturbationSpec,
  ): PerturbationResult {
    this.apply(world, spec);
    const limit = this.ticksForSeconds(this.config.recoverySeconds);
    let postState = this.snapshot(world.particles);
    let recoveryTicks = 0;
    for (let tick = 0; tick < limit; tick++) {
      world.step();
      recoveryTicks++;
      if (tick % this.config.sampleIntervalTicks !== 0) continue;
      postState = this.snapshot(world.particles);
      if (this.outOfBand(baseline, postState).length === 0) {
        return { spec, baseline, postState, recoveryTicks, recovered: true, outOfBand: [] };
      }
    }
    return {
      spec,
      baseline,
      postState,
      recoveryTicks,
      recovered: false,
      outOfBand: this.outOfBand(baseline, postState),
    };
  }

  /**
   * Hedef seçimi `(seed, spec, zaman)` ile tohumlanır. Eski hâlinde yalnız
   * `spec.tick` kullanılıyordu ve itme yönleri sabit sayılardan geliyordu:
   * farklı seed'ler AYNI yönleri üretiyordu.
   */
  apply(world: LifeWorld, spec: PerturbationSpec): void {
    const particles = world.particles;
    const active = this.collectActive(particles);
    if (active.length === 0) return;
    const targetCount = Math.max(1, Math.floor(active.length * spec.targetFraction));
    const seed = perturbationSeed(world.metadata.seed, spec);
    const targets = this.selectTargets(active, targetCount, seed);
    const random = lcg(seed ^ 0x9e3779b9);
    switch (spec.kind) {
      case 'velocity-kick':
        for (const slot of targets) {
          const angle = random() * Math.PI * 2;
          particles.vx[slot] += Math.cos(angle) * spec.magnitude;
          particles.vy[slot] += Math.sin(angle) * spec.magnitude;
        }
        break;
      case 'position-shift':
        for (const slot of targets) {
          const angle = random() * Math.PI * 2;
          particles.x[slot] += Math.cos(angle) * spec.magnitude;
          particles.y[slot] += Math.sin(angle) * spec.magnitude;
        }
        break;
      case 'matter-removal':
        // Muhasebeli yol: aktif + dış rezervuar = başlangıç değişmezi korunur.
        for (const slot of targets) {
          particles.deactivateSlot(slot);
          world.reservoir.recordVoidLoss(1);
        }
        break;
      case 'force-pulse':
        this.applyForcePulse(particles, targets, spec.magnitude);
        break;
    }
  }

  snapshot(particles: ParticleStore): PerturbationSnapshot {
    const active = this.collectActive(particles);
    if (active.length === 0) {
      return { activeCount: 0, meanSpeed: 0, clusterCompactness: 0, centroidX: 0, centroidY: 0 };
    }
    let speedSum = 0;
    let cx = 0;
    let cy = 0;
    for (const slot of active) {
      speedSum += Math.hypot(particles.vx[slot], particles.vy[slot]);
      cx += particles.x[slot];
      cy += particles.y[slot];
    }
    cx /= active.length;
    cy /= active.length;
    let sumDist = 0;
    let sumSqDist = 0;
    for (const slot of active) {
      const dist = Math.hypot(particles.x[slot] - cx, particles.y[slot] - cy);
      sumDist += dist;
      sumSqDist += dist * dist;
    }
    const count = active.length;
    const meanDist = sumDist / count;
    const stdDist = Math.sqrt(Math.max(0, sumSqDist / count - meanDist * meanDist));
    return {
      activeCount: count,
      meanSpeed: speedSum / count,
      clusterCompactness: meanDist > 0 ? 1 - stdDist / meanDist : 0,
      centroidX: cx,
      centroidY: cy,
    };
  }

  /**
   * Toparlanma, sabit bir eşikle değil TABAN PENCERESİNİN değişkenliğiyle
   * ölçülür. Eski sabit eşik (0,15) maddenin %10'unu kaybetmiş bir dünyayı
   * ilk kontrolde "toparlandı" sayıyordu.
   */
  private outOfBand(baseline: PerturbationBaseline, state: PerturbationSnapshot): string[] {
    const failures: string[] = [];
    const checks: [string, BaselineBand, number][] = [
      ['aktif madde', baseline.activeCount, state.activeCount],
      ['ortalama hız', baseline.meanSpeed, state.meanSpeed],
      ['kompaktlık', baseline.clusterCompactness, state.clusterCompactness],
    ];
    for (const [label, bandValue, value] of checks) {
      const sigma = Math.max(
        bandValue.sigma,
        Math.abs(bandValue.mean) * this.config.sigmaFloorFraction,
      );
      if (Math.abs(value - bandValue.mean) > this.config.baselineSigmaMultiple * sigma) {
        failures.push(
          `${label}: ${value.toFixed(3)} ∉ ${bandValue.mean.toFixed(3)} ± ${(
            this.config.baselineSigmaMultiple * sigma
          ).toFixed(3)}`,
        );
      }
    }
    return failures;
  }

  private ticksForSeconds(seconds: number): number {
    return Math.max(1, Math.round((seconds * 1000) / this.config.fixedStepMs));
  }

  private collectActive(particles: ParticleStore): number[] {
    const active: number[] = [];
    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot]) active.push(slot);
    }
    return active;
  }

  private selectTargets(active: number[], count: number, seed: number): number[] {
    const shuffled = [...active];
    const random = lcg(seed);
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    return shuffled.slice(0, count);
  }

  private applyForcePulse(particles: ParticleStore, targets: number[], magnitude: number): void {
    let cx = 0;
    let cy = 0;
    for (const slot of targets) {
      cx += particles.x[slot];
      cy += particles.y[slot];
    }
    cx /= targets.length;
    cy /= targets.length;
    for (const slot of targets) {
      const dx = particles.x[slot] - cx;
      const dy = particles.y[slot] - cy;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001) {
        particles.vx[slot] += (dx / distance) * magnitude;
        particles.vy[slot] += (dy / distance) * magnitude;
      }
    }
  }
}

/** Aynı `(seed, spec, tick)` aynı hedefleri ve aynı yönleri verir. */
export function perturbationSeed(worldSeed: number, spec: PerturbationSpec): number {
  let hash = 2166136261 >>> 0;
  const mix = (value: number): void => {
    hash = Math.imul(hash ^ (value >>> 0), 16777619) >>> 0;
  };
  mix(worldSeed);
  mix(spec.tick);
  mix(Math.round(spec.magnitude * 1e6));
  mix(Math.round(spec.targetFraction * 1e6));
  for (let index = 0; index < spec.kind.length; index++) mix(spec.kind.charCodeAt(index));
  return hash >>> 0;
}

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function band(values: readonly number[]): BaselineBand {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { mean, sigma: Math.sqrt(variance) };
}
