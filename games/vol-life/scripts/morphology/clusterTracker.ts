import type { ParticleStore } from '@/runtime/sim/ParticleStore';

export interface ClusterState {
  readonly id: number;
  readonly memberSlots: readonly number[];
  readonly centroidX: number;
  readonly centroidY: number;
  readonly firstSeenTick: number;
  readonly lastSeenTick: number;
}

export interface ClusterEvent {
  readonly tick: number;
  readonly kind: 'birth' | 'death' | 'split' | 'merge' | 'fragmentation';
  readonly clusterId: number;
  readonly relatedId?: number;
}

export interface ClusterTrackerConfig {
  readonly neighborRadiusUnits: number;
  readonly minClusterSize: number;
  readonly minContinuityTicks: number;
  readonly overlapThreshold: number;
}

export const defaultClusterConfig: ClusterTrackerConfig = {
  neighborRadiusUnits: 32,
  minClusterSize: 4,
  minContinuityTicks: 30,
  overlapThreshold: 0.5,
};

export class ClusterTracker {
  private clusters = new Map<number, ClusterState>();
  private nextId = 1;
  private readonly events: ClusterEvent[] = [];
  private readonly config: ClusterTrackerConfig;

  constructor(config: ClusterTrackerConfig = defaultClusterConfig) {
    this.config = config;
  }

  update(particles: ParticleStore, tick: number): void {
    const active = this.collectActive(particles);
    const components = this.findComponents(particles, active);
    const currentClusters = components.filter((c) => c.length >= this.config.minClusterSize);
    this.matchClusters(currentClusters, particles, tick);
  }

  get activeClusters(): readonly ClusterState[] {
    return [...this.clusters.values()];
  }

  get eventLog(): readonly ClusterEvent[] {
    return this.events;
  }

  reset(): void {
    this.clusters.clear();
    this.events.length = 0;
    this.nextId = 1;
  }

  private collectActive(particles: ParticleStore): number[] {
    const active: number[] = [];
    for (let slot = 0; slot < particles.capacity; slot++) {
      if (particles.active[slot]) active.push(slot);
    }
    return active;
  }

  private findComponents(particles: ParticleStore, active: number[]): number[][] {
    const radiusSq = this.config.neighborRadiusUnits * this.config.neighborRadiusUnits;
    const visited = new Set<number>();
    const components: number[][] = [];
    for (const start of active) {
      if (visited.has(start)) continue;
      const component: number[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);
        for (const other of active) {
          if (visited.has(other)) continue;
          const dx = particles.x[current] - particles.x[other];
          const dy = particles.y[current] - particles.y[other];
          if (dx * dx + dy * dy < radiusSq) stack.push(other);
        }
      }
      components.push(component);
    }
    return components;
  }

  private matchClusters(current: number[][], particles: ParticleStore, tick: number): void {
    const matched = new Set<number>();
    const currentCentroids = current.map((members) => {
      let cx = 0;
      let cy = 0;
      for (const slot of members) {
        cx += particles.x[slot];
        cy += particles.y[slot];
      }
      return { x: cx / members.length, y: cy / members.length };
    });
    for (let ci = 0; ci < current.length; ci++) {
      const members = current[ci];
      const centroid = currentCentroids[ci];
      let bestId = -1;
      let bestOverlap = 0;
      for (const [id, existing] of this.clusters) {
        if (matched.has(id)) continue;
        const overlap = this.overlap(members, existing.memberSlots);
        if (overlap >= this.config.overlapThreshold && overlap > bestOverlap) {
          bestOverlap = overlap;
          bestId = id;
        }
      }
      if (bestId >= 0) {
        const existing = this.clusters.get(bestId)!;
        this.clusters.set(bestId, {
          ...existing,
          memberSlots: members,
          centroidX: centroid.x,
          centroidY: centroid.y,
          lastSeenTick: tick,
        });
        matched.add(bestId);
      } else {
        const id = this.nextId++;
        this.clusters.set(id, {
          id,
          memberSlots: members,
          centroidX: centroid.x,
          centroidY: centroid.y,
          firstSeenTick: tick,
          lastSeenTick: tick,
        });
        matched.add(id);
        this.events.push({ tick, kind: 'birth', clusterId: id });
      }
    }
    for (const [id, existing] of this.clusters) {
      if (!matched.has(id)) {
        const age = tick - existing.firstSeenTick;
        if (age >= this.config.minContinuityTicks) {
          this.events.push({ tick, kind: 'death', clusterId: id });
        }
        this.clusters.delete(id);
      }
    }
  }

  private overlap(a: readonly number[], b: readonly number[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    let common = 0;
    for (const slot of b) {
      if (setA.has(slot)) common++;
    }
    return common / Math.min(a.length, b.length);
  }
}
