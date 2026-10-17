import { createRandom } from '@volstudio/core/random';
import { SpatialIndex } from '@volstudio/core/spatial';
import { SCENARIO, SCENARIOS, isScenario, validSeed, type ScenarioId } from '@/config/scenarios';
import { VEHICLE_IDS, VEHICLES, chassisConfigOf } from '@/config/vehicles';
import type { Vehicle } from '../entities/Vehicle';
import { idleCommand, type TankCommand } from '../command';
import type { Simulation } from '../Simulation';

interface Neighbor {
  readonly vehicle: Vehicle;
  readonly x: number;
  readonly y: number;
}

export class ScenarioRunner {
  private readonly index = new SpatialIndex<Neighbor>(
    SCENARIO.neighborCell,
    (neighbor) => neighbor.vehicle.vitality.alive,
  );
  private readonly spawned: Vehicle[] = [];
  private neighbors: Neighbor[] = [];
  private mode: ScenarioId = 'empty';
  private seed = SCENARIO.defaultSeed as number;
  private epoch = 0;
  private indexedAt = -1;
  private rosterRevision = -1;
  private phases: number[] = [];

  constructor(private readonly sim: Simulation) {}

  get scenario(): ScenarioId {
    return this.mode;
  }
  get currentSeed(): number {
    return this.seed;
  }

  select(mode: ScenarioId, seed: number): void {
    if (!isScenario(mode) || !validSeed(seed))
      throw new RangeError('Senaryo ve tohum geçerli olmalı');
    if (this.mode === mode && this.seed === seed) return;
    this.clear();
    this.mode = mode;
    this.seed = seed;
    this.epoch = this.sim.timeMs;
    const random = createRandom(seed);
    const count = SCENARIOS[mode].count;
    const player = this.sim.player.chassis;
    for (let slot = 0; slot < count; slot++) {
      const angle = (slot * Math.PI * 2) / count;
      const radius = SCENARIO.dynamic.radius + random.bipolar() * SCENARIO.dynamic.jitter;
      let x = player.x + Math.cos(angle) * radius;
      let y = player.y + Math.sin(angle) * radius;
      if (mode === 'slalom') {
        x =
          player.x +
          (slot % 2 ? -1 : 1) * SCENARIO.slalom.width +
          random.bipolar() * SCENARIO.slalom.jitter;
        y = player.y - SCENARIO.slalom.start - slot * SCENARIO.slalom.step;
      } else if (mode === 'targets') {
        x = player.x + (slot - (count - 1) / 2) * SCENARIO.targets.spacing;
        y = player.y - SCENARIO.targets.distance;
      }
      // Kadro yuvaya göre bütün araçları döndürür: senaryo her aracı (görünüm, atış, ses) sınar ve tohumla aynı kalır.
      const spec = VEHICLES[VEHICLE_IDS[slot % VEHICLE_IDS.length]];
      const chassis = chassisConfigOf(spec);
      const bodyRadius = Math.hypot(chassis.halfLength, chassis.halfWidth);
      x = Math.max(bodyRadius, Math.min(this.sim.world.width - bodyRadius, x));
      y = Math.max(bodyRadius, Math.min(this.sim.world.height - bodyRadius, y));
      this.spawned.push(this.sim.spawn(x, y, angle, null, undefined, spec));
      this.phases.push(random.next() * Math.PI * 2);
    }
    this.refreshNeighbors();
  }

  commandFor(vehicle: Vehicle, player: TankCommand): TankCommand {
    if (vehicle.id === this.sim.player.id) return player;
    const slot = this.spawned.indexOf(vehicle);
    if (slot < 0 || this.mode === 'slalom' || this.mode === 'targets') return idleCommand();
    if (this.rosterRevision !== this.sim.vehicleRevision) this.refreshNeighbors();
    else if (this.indexedAt !== this.sim.timeMs) {
      this.index.refresh(this.neighbors);
      this.indexedAt = this.sim.timeMs;
    }
    const own = this.neighbors.find((entry) => entry.vehicle === vehicle);
    const target = this.index.findNearest(
      vehicle.chassis.x,
      vehicle.chassis.y,
      SCENARIO.aimRadius,
      own,
    );
    const elapsed = this.sim.timeMs - this.epoch;
    const phase = this.phases[slot];
    const heading = (elapsed / 1000) * SCENARIO.dynamic.turnRate + phase;
    const firing =
      (elapsed + (phase / (Math.PI * 2)) * SCENARIO.dynamic.fireCycleMs) %
      SCENARIO.dynamic.fireCycleMs;
    return {
      ...idleCommand(),
      moveX: Math.cos(heading),
      moveY: Math.sin(heading),
      aimX: target ? target.x - vehicle.chassis.x : 0,
      aimY: target ? target.y - vehicle.chassis.y : 0,
      fire: target !== null && firing < SCENARIO.dynamic.fireWindowMs,
    };
  }

  destroy(): void {
    this.clear();
  }

  private refreshNeighbors(): void {
    this.neighbors = this.sim.vehicles.map((vehicle) => ({
      vehicle,
      get x() {
        return vehicle.chassis.x;
      },
      get y() {
        return vehicle.chassis.y;
      },
    }));
    this.index.rebuild(this.neighbors);
    this.rosterRevision = this.sim.vehicleRevision;
    this.indexedAt = this.sim.timeMs;
  }

  private clear(): void {
    for (const vehicle of this.spawned) this.sim.despawn(vehicle.id);
    this.spawned.length = 0;
    this.phases.length = 0;
    this.neighbors.length = 0;
    this.index.clear();
    this.sim.projectiles.clear();
    this.indexedAt = -1;
    this.rosterRevision = -1;
  }
}
