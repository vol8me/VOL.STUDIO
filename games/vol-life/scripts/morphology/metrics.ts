import type { ParticleStore } from '@/runtime/sim/ParticleStore';
import type { DomainSample, WorldDomain } from '@/runtime/sim/WorldDomain';
import type { ClusterState } from './clusterTracker';
import { measureClusterShape, memberChurn, type Point } from './clusterShape';

/** Metrik döngüleri sıcak yoldur; örnekleme tamponu tahsis etmez. */
const domainSample: DomainSample = { distance: 0, normalX: 1, normalY: 0 };

/**
 * Bir kümenin kendi kaydı (E5). Biçim ölçüleri `clusterShape`ten gelir ve
 * tanımları ön-kayıtlıdır: kompaktlık SOLIDITY'dir, halka ayrıca delik
 * oranıyla ölçülür ve ikisi karıştırılmaz.
 */
export interface ClusterRecord {
  readonly id: number;
  readonly size: number;
  readonly centroidX: number;
  readonly centroidY: number;
  readonly normalizedGyration: number;
  readonly solidity: number;
  readonly holeRatio: number;
  readonly anisotropy: number;
  readonly radialProfile: number;
  readonly typeComposition: number[];
  /** Önceki örneğe göre değişen üye payı; tracker ÜYELİĞİNDEN hesaplanır. */
  readonly churn: number;
  /** Kümenin tick cinsinden yaşı (ilk görüldüğünden bu yana). */
  readonly ageTicks: number;
}

/**
 * v2 İKİ KATMANLIDIR (E5): global özet + boyuta göre ilk K kümenin kaydı.
 *
 * `clusterCompactness` global katmanda ESKİ tanımıyla kalır (dağılım
 * düzgünlüğü), çünkü faz sınıflandırıcı onu altı, `isQualified` bir eşikte
 * kullanıyor; tanımı burada değiştirmek yedi eşiğin anlamını sessizce
 * kaydırırdı. Ön-kayıtlı solidity PER-CLUSTER katmandadır.
 */
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
  /** Kümelere ait maddenin toplam aktif maddeye oranı. */
  readonly clusteredFraction: number;
  readonly clusterCount: number;
  readonly clusterSizeP50: number;
  readonly clusterSizeP90: number;
  readonly clusterSizeMax: number;
  readonly clusters: readonly ClusterRecord[];
}

export interface MorphologyMetricsConfig {
  readonly stalledSpeedThreshold: number;
  readonly neighborRadiusUnits: number;
  readonly fringeDistanceThreshold: number;
  readonly voidDistanceThreshold: number;
  readonly autocorrelationLag: number;
  /** Boyuta göre kaç küme ayrı ayrı kaydedilir. */
  readonly topClusterCount: number;
}

export const defaultMetricsConfig: MorphologyMetricsConfig = {
  stalledSpeedThreshold: 0.05,
  neighborRadiusUnits: 48,
  fringeDistanceThreshold: 32,
  voidDistanceThreshold: 0,
  autocorrelationLag: 60,
  topClusterCount: 5,
};

export class MorphologyMetrics {
  private readonly history: MorphologySample[] = [];
  private readonly positionHistory: Float32Array[] = [];
  /** Küme başına bir önceki kadro; churn bundan hesaplanır. */
  private readonly previousMembers = new Map<number, number[]>();
  private readonly config: MorphologyMetricsConfig;

  constructor(config: MorphologyMetricsConfig = defaultMetricsConfig) {
    this.config = config;
  }

  sample(
    particles: ParticleStore,
    domain: WorldDomain,
    tick: number,
    voidLossCount: number,
    clusters: readonly ClusterState[] = [],
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
    const clusterLayer = this.clusterLayer(particles, clusters, tick);
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
      ...clusterLayer,
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
    this.previousMembers.clear();
  }

  /**
   * Küme katmanı tracker ÜYELİĞİNDEN kurulur; metrikler kendi başına yeniden
   * kümelemez. Churn, aynı kümenin bir önceki örnekteki kadrosuyla
   * karşılaştırılarak çıkar (E5).
   */
  private clusterLayer(
    particles: ParticleStore,
    clusters: readonly ClusterState[],
    tick: number,
  ): {
    clusteredFraction: number;
    clusterCount: number;
    clusterSizeP50: number;
    clusterSizeP90: number;
    clusterSizeMax: number;
    clusters: ClusterRecord[];
  } {
    const slotById = new Map<number, number>();
    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot] === 1) slotById.set(particles.stableId[slot], slot);
    }
    const ordered = [...clusters].sort(
      (a, b) => b.memberIds.length - a.memberIds.length || a.id - b.id,
    );
    const sizes = ordered.map((cluster) => cluster.memberIds.length).sort((a, b) => a - b);
    const clustered = sizes.reduce((sum, size) => sum + size, 0);
    const records: ClusterRecord[] = [];
    const seen = new Set<number>();
    for (const cluster of ordered.slice(0, this.config.topClusterCount)) {
      const points: Point[] = [];
      const typeCounts = new Array<number>(6).fill(0);
      for (const id of cluster.memberIds) {
        const slot = slotById.get(id);
        if (slot === undefined) continue;
        points.push({ x: particles.x[slot], y: particles.y[slot] });
        typeCounts[particles.type[slot]]++;
      }
      const shape = measureClusterShape(points);
      const previous = this.previousMembers.get(cluster.id) ?? cluster.memberIds;
      records.push({
        id: cluster.id,
        size: cluster.memberIds.length,
        centroidX: shape.centroidX,
        centroidY: shape.centroidY,
        normalizedGyration: shape.normalizedGyration,
        solidity: shape.solidity,
        holeRatio: shape.holeRatio,
        anisotropy: shape.anisotropy,
        radialProfile: this.radialProfile(points),
        typeComposition: points.length > 0 ? typeCounts.map((c) => c / points.length) : typeCounts,
        churn: memberChurn(previous, cluster.memberIds),
        ageTicks: Math.max(0, tick - cluster.firstSeenTick),
      });
      seen.add(cluster.id);
    }
    this.previousMembers.clear();
    for (const cluster of clusters) this.previousMembers.set(cluster.id, [...cluster.memberIds]);
    const active = particles.activeCount;
    return {
      clusteredFraction: active > 0 ? clustered / active : 0,
      clusterCount: clusters.length,
      clusterSizeP50: percentile(sizes, 0.5),
      clusterSizeP90: percentile(sizes, 0.9),
      clusterSizeMax: sizes.length > 0 ? sizes[sizes.length - 1] : 0,
      clusters: records,
    };
  }

  /** Merkeze uzaklıkların p90/medyan oranı; halkada 1'e yaklaşır, diskte üstündedir. */
  private radialProfile(points: readonly Point[]): number {
    if (points.length < 2) return 0;
    let cx = 0;
    let cy = 0;
    for (const point of points) {
      cx += point.x;
      cy += point.y;
    }
    cx /= points.length;
    cy /= points.length;
    const distances = points
      .map((point) => Math.hypot(point.x - cx, point.y - cy))
      .sort((a, b) => a - b);
    const median = distances[Math.floor(distances.length / 2)];
    const p90 = distances[Math.floor(distances.length * 0.9)];
    return median > 0 ? p90 / median : 0;
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

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}
