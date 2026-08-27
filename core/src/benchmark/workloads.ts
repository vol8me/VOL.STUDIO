import { ObjectPool } from '../pool/ObjectPool';
import { PathFinder } from '../grid/findPath';
import { Scheduler } from '../time/Scheduler';
import { SpatialIndex, type SpatialEntity } from '../spatial/SpatialIndex';
import type { BenchmarkScenario, BenchmarkWorkload } from './harness';

export interface CoreBenchmarkWorkloadOptions {
  /** Uzamsal workload'larda hareket eden entity sayısı. Varsayılan 256. */
  readonly entityCount?: number;
  /** PathFinder workload'unun kare ızgara boyutu. Varsayılan 48. */
  readonly gridSize?: number;
}

interface MovingEntity extends SpatialEntity {
  readonly phase: number;
}

interface PooledValue {
  value: number;
}

/** CORE mekanizmalarını gerçek sıcak döngülerle ölçen standart workload seti. */
export function createCoreSimulationWorkloads(
  options: CoreBenchmarkWorkloadOptions = {},
): readonly BenchmarkWorkload[] {
  const entityCount = positiveInteger(options.entityCount ?? 256, 'entityCount');
  const gridSize = positiveInteger(options.gridSize ?? 48, 'gridSize');

  return [
    createSpatialRebuildWorkload(entityCount),
    createSpatialIncrementalWorkload(entityCount),
    createPathFinderWorkload(gridSize),
    createSchedulerWorkload(),
    createObjectPoolWorkload(entityCount),
  ];
}

function createSpatialRebuildWorkload(entityCount: number): BenchmarkWorkload {
  return {
    name: 'core/spatial-rebuild',
    create: () => {
      const entities = createEntities(entityCount);
      const index = new SpatialIndex<MovingEntity>(32);
      let frame = 0;
      let checksum = 0;
      return {
        step(): void {
          frame++;
          moveEntities(entities, frame);
          index.rebuild(entities);
          checksum += index.queryRadius(450, 350, 140).length;
        },
        dispose(): void {
          index.clear();
          // Sonuç kullanılmadan atılmaması için workload'un yaşamı boyunca
          // sıcak döngüde biriktirilir; optimizasyon motoru bunu silemez.
          if (checksum < 0) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

function createSpatialIncrementalWorkload(entityCount: number): BenchmarkWorkload {
  return {
    name: 'core/spatial-incremental',
    create: () => {
      const entities = createEntities(entityCount);
      const index = new SpatialIndex<MovingEntity>(32);
      index.rebuild(entities);
      let frame = 0;
      let checksum = 0;
      return {
        step(): void {
          frame++;
          moveEntities(entities, frame);
          for (const entity of entities) index.update(entity);
          checksum += index.queryRadius(450, 350, 140).length;
        },
        dispose(): void {
          index.clear();
          if (checksum < 0) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

function createPathFinderWorkload(gridSize: number): BenchmarkWorkload {
  return {
    name: 'core/pathfinder-reuse',
    create: () => {
      const finder = new PathFinder(gridSize, gridSize);
      const isWalkable = (point: { col: number; row: number }): boolean =>
        (point.col * 13 + point.row * 7) % 19 !== 0;
      let frame = 0;
      let checksum = 0;
      return {
        step(): void {
          frame++;
          const start = { col: frame % 4, row: (frame * 3) % 4 };
          const goal = {
            col: gridSize - 1 - (frame % 4),
            row: gridSize - 1 - ((frame * 3) % 4),
          };
          checksum += finder.find(start, goal, { isWalkable })?.length ?? 0;
        },
        dispose(): void {
          if (checksum < 0) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

function createSchedulerWorkload(): BenchmarkWorkload {
  return {
    name: 'core/scheduler-drain',
    create: () => {
      const scheduler = new Scheduler({ maxCatchUp: 8 });
      let ticks = 0;
      scheduler.every(16, () => ticks++);
      scheduler.every(64, () => ticks++);
      return {
        step(): void {
          scheduler.update(16);
        },
        dispose(): void {
          scheduler.clear();
          if (ticks < 0) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

function createObjectPoolWorkload(entityCount: number): BenchmarkWorkload {
  const cycleSize = Math.min(entityCount, 64);
  return {
    name: 'core/object-pool-cycle',
    create: () => {
      const pool = new ObjectPool<PooledValue>({
        create: () => ({ value: 0 }),
        reset: (item) => {
          item.value = 0;
        },
        prewarm: cycleSize,
        maxIdle: cycleSize,
      });
      let checksum = 0;
      return {
        step(): void {
          const active: PooledValue[] = [];
          for (let index = 0; index < cycleSize; index++) {
            const item = pool.acquire();
            item.value = index;
            checksum += item.value;
            active.push(item);
          }
          for (const item of active) pool.release(item);
        },
        dispose(): void {
          pool.clear();
          if (checksum < 0) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

function createEntities(count: number): MovingEntity[] {
  return Array.from({ length: count }, (_, index) => ({
    x: 24 + (index % 30) * 29,
    y: 24 + Math.floor(index / 30) * 29,
    phase: index * 0.37,
  }));
}

function moveEntities(entities: MovingEntity[], frame: number): void {
  for (const entity of entities) {
    entity.x = 450 + Math.cos(frame * 0.017 + entity.phase) * 390;
    entity.y = 350 + Math.sin(frame * 0.013 + entity.phase) * 290;
  }
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Benchmark ${name} pozitif güvenli bir tam sayı olmalı`);
  }
  return value;
}
