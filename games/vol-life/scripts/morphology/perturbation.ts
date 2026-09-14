import type { LifeWorld } from '@/runtime/sim/LifeWorld';
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
  readonly tick: number;
}

export interface PerturbationResult {
  readonly spec: PerturbationSpec;
  readonly preState: PerturbationSnapshot;
  readonly postState: PerturbationSnapshot;
  readonly recoveryTicks: number;
  readonly recovered: boolean;
}

interface PerturbationSnapshot {
  readonly activeCount: number;
  readonly meanSpeed: number;
  readonly clusterCompactness: number;
  readonly centroidX: number;
  readonly centroidY: number;
}

export interface PerturbationConfig {
  readonly recoveryThreshold: number;
  readonly maxRecoveryTicks: number;
}

export const defaultPerturbationConfig: PerturbationConfig = {
  recoveryThreshold: 0.15,
  maxRecoveryTicks: 300,
};

export class PerturbationSystem {
  private readonly config: PerturbationConfig;

  constructor(config: PerturbationConfig = defaultPerturbationConfig) {
    this.config = config;
  }

  apply(world: LifeWorld, particles: ParticleStore, spec: PerturbationSpec): void {
    const active = this.collectActive(particles);
    if (active.length === 0) return;
    const targetCount = Math.max(1, Math.floor(active.length * spec.targetFraction));
    const targets = this.selectTargets(active, targetCount, spec.tick);
    switch (spec.kind) {
      case 'velocity-kick':
        this.applyVelocityKick(particles, targets, spec.magnitude);
        break;
      case 'position-shift':
        this.applyPositionShift(particles, targets, spec.magnitude);
        break;
      case 'matter-removal':
        this.applyMatterRemoval(particles, targets);
        break;
      case 'force-pulse':
        this.applyForcePulse(particles, targets, spec.magnitude);
        break;
    }
  }

  measure(
    world: LifeWorld,
    particles: ParticleStore,
    spec: PerturbationSpec,
    preState: PerturbationSnapshot,
  ): PerturbationResult {
    let postState = this.snapshot(particles);
    let recoveryTicks = 0;
    let recovered = false;
    for (let tick = 0; tick < this.config.maxRecoveryTicks; tick++) {
      world.step();
      recoveryTicks++;
      postState = this.snapshot(particles);
      if (this.isRecovered(preState, postState)) {
        recovered = true;
        break;
      }
    }
    return { spec, preState, postState, recoveryTicks, recovered };
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
    const n = active.length;
    const meanDist = sumDist / n;
    const stdDist = Math.sqrt(Math.max(0, sumSqDist / n - meanDist * meanDist));
    const compactness = meanDist > 0 ? 1 - stdDist / meanDist : 0;
    return {
      activeCount: active.length,
      meanSpeed: speedSum / active.length,
      clusterCompactness: compactness,
      centroidX: cx,
      centroidY: cy,
    };
  }

  private isRecovered(pre: PerturbationSnapshot, post: PerturbationSnapshot): boolean {
    const speedDiff = Math.abs(pre.meanSpeed - post.meanSpeed);
    const compactnessDiff = Math.abs(pre.clusterCompactness - post.clusterCompactness);
    const countDiff = Math.abs(pre.activeCount - post.activeCount) / Math.max(1, pre.activeCount);
    return (
      speedDiff < this.config.recoveryThreshold &&
      compactnessDiff < this.config.recoveryThreshold &&
      countDiff < this.config.recoveryThreshold
    );
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
    let state = seed >>> 0;
    for (let i = shuffled.length - 1; i > 0; i--) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const j = state % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  private applyVelocityKick(particles: ParticleStore, targets: number[], magnitude: number): void {
    let state = 0xdeadbeef;
    for (const slot of targets) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const angle = (state / 4294967296) * Math.PI * 2;
      particles.vx[slot] += Math.cos(angle) * magnitude;
      particles.vy[slot] += Math.sin(angle) * magnitude;
    }
  }

  private applyPositionShift(particles: ParticleStore, targets: number[], magnitude: number): void {
    let state = 0xcafebabe;
    for (const slot of targets) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const angle = (state / 4294967296) * Math.PI * 2;
      particles.x[slot] += Math.cos(angle) * magnitude;
      particles.y[slot] += Math.sin(angle) * magnitude;
    }
  }

  private applyMatterRemoval(particles: ParticleStore, targets: number[]): void {
    for (const slot of targets) {
      particles.deactivate(slot);
    }
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
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        particles.vx[slot] += (dx / dist) * magnitude;
        particles.vy[slot] += (dy / dist) * magnitude;
      }
    }
  }
}
