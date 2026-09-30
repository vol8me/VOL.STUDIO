import type { EntityId } from '../entities/Vehicle';
import type { SimEvent } from '../events';
import type { World } from '../world/World';

export interface Projectile {
  x: number;
  y: number;
  /** Önceki adımdaki konum; render ara değeri ve iz çizgisi için. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  ageMs: number;
  /** Ateşleyen araç; kendi aracına isabet etmez. */
  owner: EntityId;
}

/** Mermi isabet adayı: aracın kimliği ve noktanın ayak izinde olup olmadığı. */
export interface ProjectileTarget {
  readonly id: EntityId;
  contains(x: number, y: number): boolean;
}

/** İsabet anında çağrılır; hedefe itki uygulamak simülasyonun işidir. */
export type ProjectileHit = (projectile: Projectile, target: ProjectileTarget) => void;

/**
 * Sabit kapasiteli mermi kümesi. Canlı mermiler dizinin başında yoğun durur;
 * ölen mermi sondakiyle yer değiştirir. Adımda ayırma yapılmaz.
 *
 * Kapasite dolunca en yaşlı mermi yeni atışa verilir: ateş hiçbir zaman
 * sessizce yutulmaz.
 */
export class Projectiles {
  readonly items: Projectile[];
  private live = 0;

  constructor(
    readonly capacity: number,
    private readonly lifeMs: number,
  ) {
    if (!(Number.isInteger(capacity) && capacity > 0)) {
      throw new RangeError(`Mermi kapasitesi pozitif tamsayı olmalı: ${capacity}`);
    }
    this.items = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      ageMs: 0,
      owner: 0,
    }));
  }

  get count(): number {
    return this.live;
  }

  spawn(owner: EntityId, x: number, y: number, vx: number, vy: number): Projectile {
    let slot: Projectile;
    if (this.live < this.capacity) {
      slot = this.items[this.live++]!;
    } else {
      let oldest = 0;
      for (let index = 1; index < this.live; index++) {
        if (this.items[index].ageMs > this.items[oldest].ageMs) oldest = index;
      }
      slot = this.items[oldest]!;
    }
    slot.x = slot.px = x;
    slot.y = slot.py = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.ageMs = 0;
    slot.owner = owner;
    return slot;
  }

  clear(): void {
    this.live = 0;
  }

  /**
   * Mermileri ilerletir. Yol üzerinde (yarım adım örneklemesiyle) bir araca
   * değen mermi isabet eder; dünya duvarını aşan mermi duvarda, ömrü dolan
   * mermi menzil sonunda yerde patlar.
   */
  step(
    dtMs: number,
    world: World,
    events: SimEvent[],
    targets: readonly ProjectileTarget[] = [],
    onHit?: ProjectileHit,
  ): void {
    const dt = dtMs / 1000;
    let index = 0;
    while (index < this.live) {
      const projectile = this.items[index];
      projectile.px = projectile.x;
      projectile.py = projectile.y;
      projectile.ageMs += dtMs;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      const angle = Math.atan2(projectile.vy, projectile.vx);
      let alive = true;

      const target = this.struck(projectile, targets);
      if (target) {
        events.push({
          kind: 'hit',
          owner: projectile.owner,
          target: target.id,
          x: projectile.x,
          y: projectile.y,
          angle,
        });
        onHit?.(projectile, target);
        alive = false;
      } else if (!world.contains(projectile.x, projectile.y)) {
        projectile.x = Math.min(world.width, Math.max(0, projectile.x));
        projectile.y = Math.min(world.height, Math.max(0, projectile.y));
        events.push(this.impact(projectile, 'wall', angle));
        alive = false;
      } else if (projectile.ageMs >= this.lifeMs) {
        events.push(this.impact(projectile, 'ground', angle));
        alive = false;
      }

      if (alive) {
        index++;
      } else {
        this.live--;
        const last = this.items[this.live];
        this.items[this.live] = projectile;
        this.items[index] = last;
      }
    }
  }

  private impact(projectile: Projectile, surface: 'wall' | 'ground', angle: number): SimEvent {
    return {
      kind: 'impact',
      owner: projectile.owner,
      surface,
      x: projectile.x,
      y: projectile.y,
      angle,
    };
  }

  /** Yol ortası ve uç noktası örneklenir: hızlı mermi ince aracı atlamaz. */
  private struck(
    projectile: Projectile,
    targets: readonly ProjectileTarget[],
  ): ProjectileTarget | null {
    const midX = (projectile.px + projectile.x) / 2;
    const midY = (projectile.py + projectile.y) / 2;
    for (const target of targets) {
      if (target.id === projectile.owner) continue;
      if (target.contains(midX, midY) || target.contains(projectile.x, projectile.y)) return target;
    }
    return null;
  }
}
