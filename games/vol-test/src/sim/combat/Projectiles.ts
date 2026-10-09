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
  height: number;
  previousHeight: number;
  verticalSpeed: number;
  travelled: number;
  /** Ateşleyen araç; kendi aracına isabet etmez. */
  owner: EntityId;
}

export interface ProjectileFlight {
  readonly muzzleHeight: number;
  readonly launchSpeed: number;
  readonly gravity: number;
  readonly drag: number;
  readonly maxRange: number;
}

export interface ProjectileAir {
  readonly windX: number;
  readonly windY: number;
  readonly airDrag: number;
}

export interface AimPreview {
  x: number;
  y: number;
  targetId: EntityId | null;
  surface: 'ground' | 'wall' | 'vehicle';
}

function createProjectile(): Projectile {
  return {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    ageMs: 0,
    height: 0,
    previousHeight: 0,
    verticalSpeed: 0,
    travelled: 0,
    owner: 0,
  };
}

/**
 * Mermi isabet adayı: aracın kimliği ve süpürülen parçanın ayak izine İLK
 * temas parametresi. `entryT` `0..1` arasında bir oran ya da temas yoksa
 * `null` döner; parça ayak izinin içinde başlıyorsa `0`.
 */
export interface ProjectileTarget {
  readonly id: EntityId;
  entryT(startX: number, startY: number, endX: number, endY: number): number | null;
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
  private readonly previewShell = createProjectile();
  private readonly aim: AimPreview = { x: 0, y: 0, targetId: null, surface: 'ground' };
  private readonly air = { windX: 0, windY: 0, airDrag: 1 };

  constructor(
    readonly capacity: number,
    private readonly lifeMs: number,
    private readonly flight?: ProjectileFlight,
  ) {
    if (!(Number.isInteger(capacity) && capacity > 0)) {
      throw new RangeError(`Mermi kapasitesi pozitif tamsayı olmalı: ${capacity}`);
    }
    this.items = Array.from({ length: capacity }, createProjectile);
  }

  get count(): number {
    return this.live;
  }

  setAir(air: ProjectileAir): void {
    if (![air.windX, air.windY, air.airDrag].every(Number.isFinite) || air.airDrag < 0)
      throw new RangeError('Mermi atmosferi sonlu olmalı; sürükleme negatif olamaz.');
    Object.assign(this.air, { windX: air.windX, windY: air.windY, airDrag: air.airDrag });
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
    this.reset(slot, owner, x, y, vx, vy);
    return slot;
  }

  preview(
    owner: EntityId,
    x: number,
    y: number,
    vx: number,
    vy: number,
    world: World,
    targets: readonly ProjectileTarget[] = [],
    sampleStepMs = 1000 / 60,
  ): AimPreview {
    if (!(Number.isFinite(sampleStepMs) && sampleStepMs > 0))
      throw new RangeError('Önizleme adımı pozitif ve sonlu olmalı');
    const shell = this.previewShell;
    this.reset(shell, owner, x, y, vx, vy);
    const result = this.aim;
    result.targetId = null;
    result.surface = 'ground';
    for (let step = 0; step <= Math.ceil(this.lifeMs / sampleStepMs); step++) {
      shell.px = shell.x;
      shell.py = shell.y;
      const landed = this.advance(shell, sampleStepMs);
      const outsideStart = !world.contains(shell.px, shell.py);
      const wall = this.clipToWorld(shell, world);
      const target = outsideStart ? null : this.struck(shell, targets);
      if (target) {
        result.targetId = target.id;
        result.surface = 'vehicle';
        break;
      }
      if (wall) {
        result.surface = 'wall';
        break;
      }
      if (landed || shell.ageMs >= this.lifeMs) break;
    }
    result.x = shell.x;
    result.y = shell.y;
    return result;
  }

  private reset(
    slot: Projectile,
    owner: EntityId,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): void {
    slot.x = slot.px = x;
    slot.y = slot.py = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.ageMs = 0;
    slot.height = slot.previousHeight = this.flight?.muzzleHeight ?? 0;
    slot.verticalSpeed = this.flight?.launchSpeed ?? 0;
    slot.travelled = 0;
    slot.owner = owner;
  }

  clear(): void {
    this.live = 0;
  }

  /**
   * Mermileri ilerletir. Adımın süpürdüğü yol üzerinde bir aracın ayak izine
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
    let index = 0;
    while (index < this.live) {
      const projectile = this.items[index];
      projectile.px = projectile.x;
      projectile.py = projectile.y;
      const landed = this.advance(projectile, dtMs);

      const angle = Math.atan2(projectile.vy, projectile.vx);
      let alive = true;

      const outsideStart = !world.contains(projectile.px, projectile.py);
      const wall = this.clipToWorld(projectile, world);
      const target = outsideStart ? null : this.struck(projectile, targets);
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
      } else if (wall) {
        events.push(this.impact(projectile, 'wall', angle));
        alive = false;
      } else if (landed || projectile.ageMs >= this.lifeMs) {
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

  private advance(projectile: Projectile, dtMs: number): boolean {
    const flight = this.flight;
    const drag = (flight?.drag ?? 0) * this.air.airDrag;
    let dt = Math.min(dtMs, Math.max(0, this.lifeMs - projectile.ageMs)) / 1000;
    projectile.previousHeight = projectile.height;
    let landed = false;
    if (flight) {
      const vz = projectile.verticalSpeed;
      const groundTime =
        (vz + Math.sqrt(vz * vz + 2 * flight.gravity * projectile.height)) / flight.gravity;
      const speed = Math.hypot(projectile.vx, projectile.vy);
      const distance = Math.max(0, flight.maxRange - projectile.travelled);
      let rangeTime = Infinity;
      if (this.air.windX === 0 && this.air.windY === 0) {
        rangeTime =
          drag > 0
            ? speed > drag * distance
              ? -Math.log1p((-drag * distance) / speed) / drag
              : Infinity
            : speed > 0
              ? distance / speed
              : Infinity;
      } else if (this.horizontalDistance(projectile, Math.min(dt, groundTime), drag) >= distance) {
        let low = 0;
        let high = Math.min(dt, groundTime);
        for (let iteration = 0; iteration < 48; iteration++) {
          const middle = (low + high) / 2;
          if (this.horizontalDistance(projectile, middle, drag) > distance) high = middle;
          else low = middle;
        }
        rangeTime = low;
      }
      const end = Math.min(groundTime, rangeTime);
      if (dt >= end) {
        dt = end;
        landed = true;
      }
      projectile.height = landed
        ? 0
        : Math.max(0, projectile.height + vz * dt - (flight.gravity * dt * dt) / 2);
      projectile.verticalSpeed -= flight.gravity * dt;
    }
    const scale = drag > 0 ? -Math.expm1(-drag * dt) / drag : dt;
    const dx = this.air.windX * dt + (projectile.vx - this.air.windX) * scale;
    const dy = this.air.windY * dt + (projectile.vy - this.air.windY) * scale;
    projectile.x += dx;
    projectile.y += dy;
    projectile.travelled += Math.hypot(dx, dy);
    projectile.vx = this.air.windX + (projectile.vx - this.air.windX) * Math.exp(-drag * dt);
    projectile.vy = this.air.windY + (projectile.vy - this.air.windY) * Math.exp(-drag * dt);
    projectile.ageMs += dt * 1000;
    return landed;
  }

  private horizontalDistance(projectile: Projectile, seconds: number, drag: number): number {
    const scale = drag > 0 ? -Math.expm1(-drag * seconds) / drag : seconds;
    return Math.hypot(
      this.air.windX * seconds + (projectile.vx - this.air.windX) * scale,
      this.air.windY * seconds + (projectile.vy - this.air.windY) * scale,
    );
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

  /** Hedef taramasına yalnız dünya içindeki yol girer; ilk duvarın gerisi vurulamaz. */
  private clipToWorld(projectile: Projectile, world: World): boolean {
    const { px, py, x, y } = projectile;
    if (!world.contains(px, py)) {
      // Namlu gövdenin önündedir: sınır dışında doğarsa ilk nokta hemen duvardır.
      projectile.x = Math.min(world.width, Math.max(0, px));
      projectile.y = Math.min(world.height, Math.max(0, py));
      return true;
    }
    if (world.contains(x, y)) return false;
    let exitT = 1;
    if (x < 0) exitT = Math.min(exitT, -px / (x - px));
    else if (x > world.width) exitT = Math.min(exitT, (world.width - px) / (x - px));
    if (y < 0) exitT = Math.min(exitT, -py / (y - py));
    else if (y > world.height) exitT = Math.min(exitT, (world.height - py) / (y - py));
    projectile.x = Math.min(world.width, Math.max(0, px + (x - px) * exitT));
    projectile.y = Math.min(world.height, Math.max(0, py + (y - py) * exitT));
    return true;
  }

  /**
   * Adımın süpürdüğü parça (`px,py → x,y`) ile araç ayak izlerinin kesişimi.
   * Aynı adımda birden çok araç kesişirse en küçük `t` kazanır; eşitlikte
   * aday sırası belirler. İsabet olursa mermi temas noktasına çekilir: olay,
   * itki ve önizleme adımın bittiği yeri değil gerçek ilk teması görür.
   */
  private struck(
    projectile: Projectile,
    targets: readonly ProjectileTarget[],
  ): ProjectileTarget | null {
    const { px, py, x, y } = projectile;
    let nearest: ProjectileTarget | null = null;
    let nearestT = Infinity;
    for (const target of targets) {
      if (target.id === projectile.owner) continue;
      const t = target.entryT(px, py, x, y);
      if (t !== null && t < nearestT) {
        nearest = target;
        nearestT = t;
      }
    }
    if (nearest) {
      projectile.x = px + (x - px) * nearestT;
      projectile.y = py + (y - py) * nearestT;
    }
    return nearest;
  }
}
