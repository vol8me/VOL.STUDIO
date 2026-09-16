import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';

/** Metrik döngüleri sıcak yoldur; örnekleme tamponu tahsis etmez. */
const domainSample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };

export interface MorphologySample {
  readonly tick: number;
  readonly activeCount: number;
  readonly voidLossCount: number;
  readonly meanSpeed: number;
  readonly stalledFraction: number;
  readonly meanNeighborCount: number;
  readonly meanLocalDensity: number;
  readonly clusterCompactness: number;
  readonly clusterAnisotropy: number;
  readonly typeComposition: number[];
  readonly radialStructure: number;
  readonly trajectoryAutocorrelation: number;
  readonly voidDwellFraction: number;
  readonly fringeFraction: number;
}

export interface MorphologyMetricsConfig {
  readonly stalledSpeedThreshold: number;
  readonly neighborRadiusUnits: number;
  readonly fringeDistanceThreshold: number;
  readonly voidDistanceThreshold: number;
  readonly autocorrelationLag: number;
}

export const defaultMetricsConfig: MorphologyMetricsConfig = {
  stalledSpeedThreshold: 0.05,
  neighborRadiusUnits: 48,
  fringeDistanceThreshold: 32,
  voidDistanceThreshold: 0,
  autocorrelationLag: 60,
};

export class MorphologyMetrics {
  private readonly history: MorphologySample[] = [];
  private readonly positionHistory: Float32Array[] = [];
  private readonly config: MorphologyMetricsConfig;

  constructor(config: MorphologyMetricsConfig = defaultMetricsConfig) {
    this.config = config;
  }

  sample(
    particles: ParticleStore,
    domain: WorldDomain,
    tick: number,
    voidLossCount: number,
  ): MorphologySample {
    const active = this.collectActive(particles);
    const count = active.length;
    const meanSpeed = count > 0 ? this.meanSpeed(particles, active) : 0;
    const stalledFraction = count > 0 ? this.stalledFraction(particles, active) : 0;
    const neighbor = this.neighborStats(particles, active);
    const cluster = this.clusterStats(particles, active);
    const typeComp = this.typeComposition(particles, active);
    const radial = this.radialStructure(particles, active, domain);
    const voidDwell = this.voidDwellFraction(particles, active, domain);
    const fringe = this.fringeFraction(particles, active, domain);
    const autocorrelation = this.trajectoryAutocorrelation(particles, active, tick);
    const sample: MorphologySample = {
      tick,
      activeCount: count,
      voidLossCount,
      meanSpeed,
      stalledFraction,
      meanNeighborCount: neighbor.meanCount,
      meanLocalDensity: neighbor.meanDensity,
      clusterCompactness: cluster.compactness,
      clusterAnisotropy: cluster.anisotropy,
      typeComposition: typeComp,
      radialStructure: radial,
      trajectoryAutocorrelation: autocorrelation,
      voidDwellFraction: voidDwell,
      fringeFraction: fringe,
    };
    this.history.push(sample);
    this.recordPositions(particles, active, tick);
    return sample;
  }

  get timeSeries(): readonly MorphologySample[] {
    return this.history;
  }

  reset(): void {
    this.history.length = 0;
    this.positionHistory.length = 0;
  }

  private collectActive(particles: ParticleStore): number[] {
    const active: number[] = [];
    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot]) active.push(slot);
    }
    return active;
  }

  private meanSpeed(particles: ParticleStore, active: number[]): number {
    let sum = 0;
    for (const slot of active) {
      sum += Math.hypot(particles.vx[slot], particles.vy[slot]);
    }
    return active.length > 0 ? sum / active.length : 0;
  }

  private stalledFraction(particles: ParticleStore, active: number[]): number {
    let stalled = 0;
    for (const slot of active) {
      if (Math.hypot(particles.vx[slot], particles.vy[slot]) < this.config.stalledSpeedThreshold) {
        stalled++;
      }
    }
    return active.length > 0 ? stalled / active.length : 0;
  }

  private neighborStats(
    particles: ParticleStore,
    active: number[],
  ): {
    meanCount: number;
    meanDensity: number;
  } {
    const radius = this.config.neighborRadiusUnits;
    const radiusSq = radius * radius;
    let totalNeighbors = 0;
    for (let i = 0; i < active.length; i++) {
      const a = active[i];
      let count = 0;
      for (let j = 0; j < active.length; j++) {
        if (i === j) continue;
        const b = active[j];
        const dx = particles.x[a] - particles.x[b];
        const dy = particles.y[a] - particles.y[b];
        if (dx * dx + dy * dy < radiusSq) count++;
      }
      totalNeighbors += count;
    }
    const meanCount = active.length > 0 ? totalNeighbors / active.length : 0;
    const area = Math.PI * radiusSq;
    const meanDensity = area > 0 ? meanCount / area : 0;
    return { meanCount, meanDensity };
  }

  private clusterStats(
    particles: ParticleStore,
    active: number[],
  ): {
    compactness: number;
    anisotropy: number;
  } {
    if (active.length < 2) return { compactness: 0, anisotropy: 0 };
    let cx = 0;
    let cy = 0;
    for (const slot of active) {
      cx += particles.x[slot];
      cy += particles.y[slot];
    }
    cx /= active.length;
    cy /= active.length;
    let sumDist = 0;
    let sumSqDist = 0;
    let varX = 0;
    let varY = 0;
    let covXY = 0;
    for (const slot of active) {
      const dx = particles.x[slot] - cx;
      const dy = particles.y[slot] - cy;
      const dist = Math.hypot(dx, dy);
      sumDist += dist;
      sumSqDist += dist * dist;
      varX += dx * dx;
      varY += dy * dy;
      covXY += dx * dy;
    }
    const n = active.length;
    const meanDist = sumDist / n;
    const stdDist = Math.sqrt(Math.max(0, sumSqDist / n - meanDist * meanDist));
    const compactness = meanDist > 0 ? 1 - stdDist / meanDist : 0;
    varX /= n;
    varY /= n;
    covXY /= n;
    const trace = varX + varY;
    const det = varX * varY - covXY * covXY;
    const discriminant = Math.max(0, trace * trace - 4 * det);
    const lambda1 = (trace + Math.sqrt(discriminant)) / 2;
    const lambda2 = (trace - Math.sqrt(discriminant)) / 2;
    const anisotropy = lambda1 > 0 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;
    return { compactness, anisotropy };
  }

  private typeComposition(particles: ParticleStore, active: number[]): number[] {
    const counts = new Array(6).fill(0);
    for (const slot of active) {
      counts[particles.type[slot]]++;
    }
    const total = active.length;
    return total > 0 ? counts.map((c) => c / total) : counts;
  }

  private radialStructure(particles: ParticleStore, active: number[], domain: WorldDomain): number {
    if (active.length < 2) return 0;
    let cx = 0;
    let cy = 0;
    for (const slot of active) {
      cx += particles.x[slot];
      cy += particles.y[slot];
    }
    cx /= active.length;
    cy /= active.length;
    const distances: number[] = [];
    for (const slot of active) {
      distances.push(Math.hypot(particles.x[slot] - cx, particles.y[slot] - cy));
    }
    distances.sort((a, b) => a - b);
    const n = distances.length;
    const median = distances[Math.floor(n / 2)];
    const p90 = distances[Math.floor(n * 0.9)];
    return median > 0 ? p90 / median : 0;
  }

  private voidDwellFraction(
    particles: ParticleStore,
    active: number[],
    domain: WorldDomain,
  ): number {
    let count = 0;
    for (const slot of active) {
      if (
        domain.sampleDistanceAndNormal(particles.x[slot], particles.y[slot], domainSample)
          .distance < this.config.voidDistanceThreshold
      ) {
        count++;
      }
    }
    return active.length > 0 ? count / active.length : 0;
  }

  private fringeFraction(particles: ParticleStore, active: number[], domain: WorldDomain): number {
    let count = 0;
    for (const slot of active) {
      if (
        domain.sampleDistanceAndNormal(particles.x[slot], particles.y[slot], domainSample)
          .distance < this.config.fringeDistanceThreshold
      ) {
        count++;
      }
    }
    return active.length > 0 ? count / active.length : 0;
  }

  private trajectoryAutocorrelation(
    particles: ParticleStore,
    active: number[],
    tick: number,
  ): number {
    const lag = this.config.autocorrelationLag;
    if (tick < lag || this.positionHistory.length < lag + 1) return 0;
    const current = this.positionHistory[this.positionHistory.length - 1];
    const past = this.positionHistory[this.positionHistory.length - 1 - lag];
    if (!current || !past) return 0;
    let sum = 0;
    let count = 0;
    for (const slot of active) {
      const curX = current[slot * 2];
      const curY = current[slot * 2 + 1];
      const pastX = past[slot * 2];
      const pastY = past[slot * 2 + 1];
      if (!Number.isFinite(curX) || !Number.isFinite(pastX)) continue;
      const dx = curX - pastX;
      const dy = curY - pastY;
      sum += dx * dx + dy * dy;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }

  private recordPositions(particles: ParticleStore, active: number[], tick: number): void {
    const positions = new Float32Array(particles.capacity * 2);
    for (const slot of active) {
      positions[slot * 2] = particles.x[slot];
      positions[slot * 2 + 1] = particles.y[slot];
    }
    this.positionHistory.push(positions);
    if (this.positionHistory.length > this.config.autocorrelationLag * 2 + 1) {
      this.positionHistory.shift();
    }
  }
}
