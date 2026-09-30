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
}

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
    }));
  }

  get count(): number {
    return this.live;
  }

  spawn(x: number, y: number, vx: number, vy: number): Projectile {
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
    return slot;
  }

  clear(): void {
    this.live = 0;
  }

  /**
   * Mermileri ilerletir. Dünya duvarını aşan mermi duvarda ölür ve isabet
   * olayı üretir; ömrü dolan mermi sessizce söner.
   */
  step(dtMs: number, world: World, events: SimEvent[]): void {
    const dt = dtMs / 1000;
    let index = 0;
    while (index < this.live) {
      const projectile = this.items[index];
      projectile.px = projectile.x;
      projectile.py = projectile.y;
      projectile.ageMs += dtMs;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      let alive = projectile.ageMs < this.lifeMs;
      if (alive && !world.contains(projectile.x, projectile.y)) {
        projectile.x = Math.min(world.width, Math.max(0, projectile.x));
        projectile.y = Math.min(world.height, Math.max(0, projectile.y));
        const angle = Math.atan2(projectile.vy, projectile.vx);
        events.push({ kind: 'impact', x: projectile.x, y: projectile.y, angle });
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
}
