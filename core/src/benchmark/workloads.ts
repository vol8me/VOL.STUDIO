import { ObjectPool } from '../pool/ObjectPool';
import { PathFinder } from '../grid/findPath';
import { FlowField } from '../grid/FlowField';
import { Scheduler } from '../time/Scheduler';
import { SpatialIndex, type SpatialEntity } from '../spatial/SpatialIndex';
import { StatBlock } from '../stats/StatBlock';
import { ResourcePool } from '../economy/ResourcePool';
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
    createFlowFieldWorkload(gridSize),
    createSchedulerWorkload(),
    createObjectPoolWorkload(entityCount),
    createStatBlockWorkload(),
    createResourcePoolWorkload(),
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

function createFlowFieldWorkload(gridSize: number): BenchmarkWorkload {
  // `FlowField.compute()` bilinçli olarak kısmi/dirty yeniden hesap
  // yapmaz (bkz. FlowField.ts JSDoc'u) — her çağrı tüm ızgarayı baştan
  // tarar. `gridSize` PathFinder ile PAYLAŞILIR: ikisi aynı ızgara
  // boyutunda karşılaştırılabilir olsun diye (tek hedef × N birim vs. N
  // hedef × 1 birim maliyet eğrisi).
  return {
    name: 'core/flowfield-compute',
    create: () => {
      const field = new FlowField(gridSize, gridSize);
      const isWalkable = (point: { col: number; row: number }): boolean =>
        (point.col * 13 + point.row * 7) % 19 !== 0;
      let frame = 0;
      let checksum = 0;
      return {
        step(): void {
          frame++;
          // Hedef her karede kayar: sabit hedefte önbellek/optimizasyon
          // motorunun sonucu atlamasına izin vermeyen gerçekçi bir desen.
          const goalCol = frame % gridSize;
          const goalRow = (frame * 7) % gridSize;
          field.compute([{ col: goalCol, row: goalRow }], { isWalkable });
          // Sabit bir köşe hücresi okunur (O(1)) — tüm ızgarayı taramak
          // `compute()`'un kendi maliyetini bozardı. Hedef karede kaydıkça
          // köşenin maliyeti değişir; ulaşılamazsa (Infinity) sıfır sayılır.
          const cornerCost = field.getCost(gridSize - 1, gridSize - 1);
          checksum += Number.isFinite(cornerCost) ? cornerCost : 0;
        },
        dispose(): void {
          if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
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

// CORE hiçbir oyunun stat sözlüğünü bilmez (bkz. AGENTS.md kural 3 ve
// core/tests/governance/publicApi.test.ts) — isimler BİLEREK jenerik
// tutulur, herhangi bir tüketicinin gerçek stat adlarıyla eşleşmemeli.
type BenchStat = 'output' | 'durability' | 'velocity' | 'cadence';

function createStatBlockWorkload(): BenchmarkWorkload {
  // Gerçek tüketici deseni (vol-hell `Player`/`Enemy`in kendi stat kümesiyle
  // parametrelenmiş kullanımı — bkz. `games/vol-hell/src/config/stats.ts`):
  // birkaç stat, birkaç kalıcı `add`/`multiply` modifier VE en az bir
  // KOŞULLU modifier (`condition` her okumada yeniden değerlendirilir —
  // statik değerden daha pahalı yol). `getValue` her frame birden çok kez
  // çağrılır; workload bunu yansıtır.
  return {
    name: 'core/stat-block-read',
    create: () => {
      const stats = new StatBlock<BenchStat>({
        output: 10,
        durability: 100,
        velocity: 220,
        cadence: 400,
      });
      stats.addModifier({ id: 'augment', stat: 'output', type: 'add', value: 4 });
      stats.addModifier({ id: 'scaling', stat: 'durability', type: 'multiply', value: 1.4 });
      stats.addModifier({ id: 'scaling', stat: 'velocity', type: 'multiply', value: 1.1 });
      let surged = false;
      stats.addModifier({
        id: 'surge',
        stat: 'output',
        type: 'multiply',
        value: 1.5,
        condition: () => surged,
      });
      let checksum = 0;
      let frame = 0;
      return {
        step(): void {
          frame++;
          // Koşullu modifier periyodik değişir — statik önbelleklemenin
          // sonucu yanlışça sabitleyip sonucu bozamayacağını da doğrular.
          surged = frame % 7 === 0;
          checksum +=
            stats.getValue('output') +
            stats.getValue('durability') +
            stats.getValue('velocity') +
            stats.getValue('cadence');
        },
        dispose(): void {
          if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
        },
      } satisfies BenchmarkScenario;
    },
  };
}

type BenchResource = 'spark' | 'flux';

function createResourcePoolWorkload(): BenchmarkWorkload {
  // Gerçek tüketici deseni (vol-hell `RunEconomy`): her karede kazanç
  // eklenir, periyodik olarak bir satın alma denenir (canAfford + spend).
  return {
    name: 'core/resource-pool-cycle',
    create: () => {
      const pool = new ResourcePool<BenchResource>({ spark: 0, flux: 0 }, { flux: 999 });
      let frame = 0;
      let checksum = 0;
      return {
        step(): void {
          frame++;
          pool.add('spark', 3);
          pool.add('flux', 1);
          if (frame % 5 === 0 && pool.canAfford({ spark: 50 })) {
            pool.spend({ spark: 50 });
            checksum += 1;
          }
        },
        dispose(): void {
          if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
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
