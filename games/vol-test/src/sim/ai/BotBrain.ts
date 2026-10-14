import { angleDelta, wrapAngle } from '@volstudio/core/math';
import { clamp, lerp } from '@volstudio/core/math/interpolation';
import { createStatefulRandom, type StatefulRandom } from '@volstudio/core/random';
import { BOT } from '@/config/bot';
import type { TankCommand } from '../command';
import type { EntityId, Vehicle } from '../entities/Vehicle';
import type { Simulation } from '../Simulation';
import type { World } from '../world/World';

/** Bota verilen görev noktası: varılacak yer ve varış yarıçapı. */
export interface BotObjective {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Görev noktasından bu kadar uzaktaki düşmana (menzil dışıysa) gidilmez; yoksa sınırsız. */
  readonly leash?: number;
}

export type BotMode = 'hold' | 'advance' | 'engage' | 'retreat' | 'unstick';

/** Bir botun kişiliği: beceri aralıklarından türer, testler tek tek geçersiz kılabilir. */
export interface BotProfile {
  readonly reactionMs: number;
  readonly aimErrorRad: number;
  readonly leadAccuracy: number;
  readonly retreatHealth: number;
  /** Savaşta hedefe tutulan mesafenin silah menziline oranı. */
  readonly standoff: number;
}

export interface BotOptions {
  /** Aynı tohum ve beceri aynı kararları üretir. */
  readonly seed: number;
  /** 0 acemi, 1 usta; varsayılan 0.5. */
  readonly skill?: number;
  readonly profile?: Partial<BotProfile>;
}

/** Beceri ve tohumdan kişilik; tohum yalnız küçük bir sapma ekler, bota karakter verir. */
export function createProfile(skill: number, random: StatefulRandom): BotProfile {
  const level = clamp(skill, 0, 1);
  const span = (values: readonly [number, number]) => lerp(values[0], values[1], level);
  const { standoff } = BOT;
  return {
    reactionMs: span(BOT.profile.reactionMs),
    aimErrorRad: span(BOT.profile.aimErrorRad),
    leadAccuracy: span(BOT.profile.leadAccuracy),
    retreatHealth: span(BOT.profile.retreatHealth),
    standoff: lerp(standoff.novice, standoff.expert, level) + random.bipolar() * standoff.spread,
  };
}

/** İki araç birbirine düşman mı: takımsız araç herkese, takımlı araç başka takıma düşmandır. */
export function isHostile(a: Vehicle, b: Vehicle): boolean {
  if (a === b) return false;
  return a.team === null || b.team === null || a.team !== b.team;
}

/**
 * Bir aracın komutunu üreten yapay zekâ. Saf benzetim kodudur: Phaser, ağ ve gerçek saat bilmez;
 * yalnız `Simulation` durumunu okur, kendi tohumlu rastgeleliğini kullanır ve araca verilecek
 * `TankCommand`ı yazar. Oyuncu ile aynı sözleşmeyle sürer: ne ışınlanır ne hile yapar.
 *
 * Kararlar iki katmandır. Algı (hedef seçimi, kaçınma vektörü) `thinkIntervalMs` aralığıyla
 * tazelenir; her adımda ise yalnız bu kararların hareket, nişan ve tetik komutuna çevrilmesi
 * yapılır. Görev noktasını (`objective`) ve geri çekilme noktasını dışarıdaki yönetici verir.
 */
export class BotBrain {
  mode: BotMode = 'hold';
  objective: BotObjective | null = null;
  /** Canı azalan botun döneceği nokta (kendi üssü). */
  retreatPoint: { readonly x: number; readonly y: number } | null = null;
  readonly profile: BotProfile;

  private readonly random: StatefulRandom;
  private target: Vehicle | null = null;
  private acquiredAtMs = 0;
  private clockMs = 0;
  private nextThinkMs = 0;
  private aimNoise = 0;
  private avoidX = 0;
  private avoidY = 0;
  private orbit = 1;
  private orbitFlipAtMs = 0;
  private sweep = 0;
  private sweepDirection = 1;
  private patrolX = 0;
  private patrolY = 0;
  private patrolUntilMs = 0;
  private stuckClockMs = 0;
  private stuckX = 0;
  private stuckY = 0;
  private stuckCount = 0;
  private unstickUntilMs = 0;
  private unstickAngle = 0;
  private lastMove = 0;
  private boosting = false;

  constructor(
    readonly vehicle: Vehicle,
    options: BotOptions,
  ) {
    this.random = createStatefulRandom(options.seed);
    this.profile = { ...createProfile(options.skill ?? 0.5, this.random), ...options.profile };
    // Algı ilk adımda koşar; ilk çağrıdan önce de tutarlı bir yön olsun.
    this.sweep = this.random.next() * Math.PI * 2;
    this.sweepDirection = this.random.next() < 0.5 ? -1 : 1;
    this.orbit = this.random.next() < 0.5 ? -1 : 1;
    // Botlar aynı karede algılamasın: yük adımlara yayılır.
    this.nextThinkMs = this.random.next() * BOT.thinkIntervalMs;
  }

  /** Güncel hedef (yoksa `null`); gözlem ve test içindir. */
  get targetId(): EntityId | null {
    return this.target?.id ?? null;
  }

  /** Bir sabit adım için komutu `out`a yazar ve döndürür. */
  think(sim: Simulation, stepMs: number, out: TankCommand): TankCommand {
    out.moveX = 0;
    out.moveY = 0;
    out.aimX = 0;
    out.aimY = 0;
    out.fire = false;
    out.boost = false;
    out.brake = false;

    const self = this.vehicle;
    if (!self.vitality.alive) {
      this.target = null;
      this.mode = 'hold';
      this.lastMove = 0;
      this.stuckCount = 0;
      this.stuckClockMs = 0;
      this.boosting = false;
      return out;
    }
    this.clockMs += stepMs;
    if (this.clockMs >= this.nextThinkMs) {
      this.nextThinkMs = this.clockMs + BOT.thinkIntervalMs;
      this.perceive(sim);
    }
    if (this.target && !this.target.vitality.alive) this.target = null;
    this.watchStuck(stepMs);

    const chassis = self.chassis;
    const target = this.target;
    const range = self.weapon.flight.maxRange;
    const targetDistance = target
      ? Math.hypot(target.chassis.x - chassis.x, target.chassis.y - chassis.y)
      : Infinity;

    this.mode = this.chooseMode(targetDistance, range);

    let dx = 0;
    let dy = 0;
    let wantsBoost = false;
    switch (this.mode) {
      case 'unstick':
        dx = Math.cos(this.unstickAngle);
        dy = Math.sin(this.unstickAngle);
        break;
      case 'retreat': {
        const point = this.retreatPoint ?? this.objective;
        if (point) [dx, dy] = this.toward(point.x, point.y);
        wantsBoost = true;
        break;
      }
      case 'engage': {
        [dx, dy] = this.engageVector(target!, targetDistance, range);
        break;
      }
      case 'advance': {
        const goal = this.objective!;
        [dx, dy] = this.toward(goal.x, goal.y);
        wantsBoost = Math.hypot(goal.x - chassis.x, goal.y - chassis.y) > BOT.boostDistance;
        break;
      }
      case 'hold':
        [dx, dy] = this.patrolVector();
        break;
    }

    if (this.mode !== 'unstick') {
      dx += this.avoidX;
      dy += this.avoidY;
      [dx, dy] = this.wallPush(sim.world, dx, dy);
    }
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    out.moveX = dx;
    out.moveY = dy;
    this.lastMove = Math.min(1, length);
    out.boost = this.decideBoost(wantsBoost && this.lastMove > 0.5);

    if (target) this.aimAt(target, targetDistance, range, out);
    else this.aimAlong(dx, dy, stepMs, out);
    return out;
  }

  /** Algı: hedef seçimi ve diğer araçlardan ayrışma vektörü. */
  private perceive(sim: Simulation): void {
    const self = this.vehicle;
    const { x, y } = self.chassis;
    const sightSq = BOT.sightRange * BOT.sightRange;
    let best: Vehicle | null = null;
    let bestSq = Infinity;
    let avoidX = 0;
    let avoidY = 0;
    for (const other of sim.vehicles) {
      if (other === self || !other.vitality.alive) continue;
      const ox = other.chassis.x - x;
      const oy = other.chassis.y - y;
      const distanceSq = ox * ox + oy * oy;
      if (isHostile(self, other) && distanceSq < sightSq && distanceSq < bestSq) {
        best = other;
        bestSq = distanceSq;
      }
      const separation = BOT.separationRadius;
      if (distanceSq < separation * separation && distanceSq > 1e-6) {
        const distance = Math.sqrt(distanceSq);
        const push = ((separation - distance) / separation) * BOT.separationWeight;
        avoidX -= (ox / distance) * push;
        avoidY -= (oy / distance) * push;
      }
    }
    this.avoidX = avoidX;
    this.avoidY = avoidY;
    this.selectTarget(best, bestSq);
    this.aimNoise = this.random.bipolar() * this.profile.aimErrorRad;
    if (this.clockMs >= this.orbitFlipAtMs) {
      this.orbit = -this.orbit;
      this.orbitFlipAtMs = this.clockMs + this.between(BOT.strafeFlipMs);
    }
  }

  private selectTarget(best: Vehicle | null, bestSq: number): void {
    const current = this.target;
    if (current && current.vitality.alive && isHostile(this.vehicle, current)) {
      const { x, y } = this.vehicle.chassis;
      const currentDistance = Math.hypot(current.chassis.x - x, current.chassis.y - y);
      const keep = BOT.sightRange * BOT.loseSightFactor;
      const closer = best !== null && Math.sqrt(bestSq) < currentDistance * BOT.switchCloserFactor;
      if (currentDistance <= keep && !closer) return;
    }
    if (best !== this.target) this.acquiredAtMs = this.clockMs;
    this.target = best;
  }

  private chooseMode(targetDistance: number, range: number): BotMode {
    if (this.clockMs < this.unstickUntilMs) return 'unstick';
    const vitality = this.vehicle.vitality;
    const health = vitality.health / vitality.maxHealth;
    const fallback = this.retreatPoint !== null || this.objective !== null;
    if (this.mode === 'retreat' && health < BOT.retreatExitHealth && fallback) return 'retreat';
    if (health < this.profile.retreatHealth && this.target && fallback) return 'retreat';
    const goal = this.objective;
    if (this.target) {
      const near = targetDistance <= range * BOT.engageRangeFactor;
      if (near || !goal) return 'engage';
      const leash = goal.leash ?? Infinity;
      const { x, y } = this.target.chassis;
      if (Math.hypot(x - goal.x, y - goal.y) <= leash) return 'engage';
    }
    if (goal) {
      const { x, y } = this.vehicle.chassis;
      if (Math.hypot(goal.x - x, goal.y - y) > goal.radius * BOT.arriveFraction) return 'advance';
    }
    return 'hold';
  }

  /** Hedefe tutulan mesafeyi koruyan yarıçap bileşeni ile yörünge bileşeninin toplamı. */
  private engageVector(target: Vehicle, distance: number, range: number): [number, number] {
    const { x, y } = this.vehicle.chassis;
    const ux = (target.chassis.x - x) / (distance || 1);
    const uy = (target.chassis.y - y) / (distance || 1);
    const preferred = range * this.profile.standoff;
    const radial = clamp((distance - preferred) / (preferred * BOT.rangeBand), -1, 1);
    const orbit = distance <= range * 1.1 ? BOT.orbitNear : BOT.orbitFar;
    // Yarıçap bileşeni yaklaşırken ya da uzaklaşırken yörüngeyi ezmesin: yan bileşen sabit kalır.
    return [ux * radial - uy * this.orbit * orbit, uy * radial + ux * this.orbit * orbit];
  }

  private toward(px: number, py: number): [number, number] {
    const { x, y } = this.vehicle.chassis;
    const dx = px - x;
    const dy = py - y;
    const distance = Math.hypot(dx, dy);
    return distance < 1e-6 ? [0, 0] : [dx / distance, dy / distance];
  }

  /** Beklerken görev bölgesinin içinde rastgele noktalar arasında dolaşır; görev yoksa yerinde kalır. */
  private patrolVector(): [number, number] {
    const goal = this.objective;
    if (!goal) return [0, 0];
    if (this.clockMs >= this.patrolUntilMs) {
      const angle = this.random.next() * Math.PI * 2;
      const radius = Math.sqrt(this.random.next()) * goal.radius * BOT.patrolRadiusFraction;
      this.patrolX = goal.x + Math.cos(angle) * radius;
      this.patrolY = goal.y + Math.sin(angle) * radius;
      this.patrolUntilMs = this.clockMs + this.between(BOT.patrolMs);
    }
    const { x, y } = this.vehicle.chassis;
    const distance = Math.hypot(this.patrolX - x, this.patrolY - y);
    if (distance < 24) return [0, 0];
    // Yavaş yürür: dolaşan bot hız tavanına çıkıp bölgeden savrulmasın.
    const [ux, uy] = this.toward(this.patrolX, this.patrolY);
    const pace = clamp(distance / 160, 0.25, 0.6);
    return [ux * pace, uy * pace];
  }

  /** Dünya sınırına yaklaşan aracı içe iter; itme, hareket vektörüne eklenir. */
  private wallPush(world: World, dx: number, dy: number): [number, number] {
    const { x, y } = this.vehicle.chassis;
    const margin = BOT.wallMargin;
    const weight = BOT.wallWeight;
    let px = dx;
    let py = dy;
    if (x < margin) px += ((margin - x) / margin) * weight;
    if (x > world.width - margin) px -= ((x - (world.width - margin)) / margin) * weight;
    if (y < margin) py += ((margin - y) / margin) * weight;
    if (y > world.height - margin) py -= ((y - (world.height - margin)) / margin) * weight;
    return [px, py];
  }

  private watchStuck(stepMs: number): void {
    const { x, y } = this.vehicle.chassis;
    this.stuckClockMs += stepMs;
    if (this.stuckClockMs < BOT.stuckCheckMs) return;
    this.stuckClockMs = 0;
    const moved = Math.hypot(x - this.stuckX, y - this.stuckY);
    this.stuckX = x;
    this.stuckY = y;
    if (this.lastMove > BOT.stuckMinMove && moved < BOT.stuckDistance) this.stuckCount++;
    else this.stuckCount = 0;
    if (this.stuckCount < BOT.stuckChecks) return;
    this.stuckCount = 0;
    const side = this.random.next() < 0.5 ? -1 : 1;
    this.unstickAngle = wrapAngle(
      this.vehicle.chassis.hull + Math.PI + side * (0.5 + this.random.next() * 0.9),
    );
    this.unstickUntilMs = this.clockMs + BOT.unstickMs;
  }

  /** Atılım depoya göre açılıp kapanır; eşikler arası aralık titremeyi önler. */
  private decideBoost(wanted: boolean): boolean {
    const chassis = this.vehicle.chassis;
    const fraction = chassis.boost / chassis.boostCapacity;
    this.boosting =
      wanted && fraction > (this.boosting ? BOT.boostStopFraction : BOT.boostStartFraction);
    return this.boosting;
  }

  /** Hedefi önden giderek nişanlar ve menzil, tepki süresi ve namlu açısı elverişliyse ateş eder. */
  private aimAt(target: Vehicle, distance: number, range: number, out: TankCommand): void {
    const self = this.vehicle;
    const speed = self.weapon.projectileSpeed;
    const { x, y } = self.chassis;
    const rx = target.chassis.x - x;
    const ry = target.chassis.y - y;
    const lead = this.profile.leadAccuracy;
    const time = Math.min(
      self.weapon.projectileLifeMs / 1000,
      interceptTime(rx, ry, target.chassis.vx * lead, target.chassis.vy * lead, speed),
    );
    const px = rx + target.chassis.vx * lead * time;
    const py = ry + target.chassis.vy * lead * time;
    const angle = Math.atan2(py, px) + this.aimNoise;
    out.aimX = Math.cos(angle);
    out.aimY = Math.sin(angle);

    const reacted = this.clockMs - this.acquiredAtMs >= this.profile.reactionMs;
    const inRange = distance <= range * BOT.fireRangeFraction;
    const aligned =
      Math.abs(angleDelta(self.chassis.turret, angle)) <=
      self.weapon.aimTolerance * BOT.fireToleranceFactor;
    out.fire = reacted && inRange && aligned && target.vitality.protectionRemainingMs === 0;
  }

  /** Hedef yokken namlu gidilen yöne bakar; duran bot çevreyi tarar. */
  private aimAlong(dx: number, dy: number, stepMs: number, out: TankCommand): void {
    if (Math.hypot(dx, dy) > 0.3) {
      const length = Math.hypot(dx, dy);
      out.aimX = dx / length;
      out.aimY = dy / length;
      this.sweep = Math.atan2(dy, dx);
      return;
    }
    this.sweep = wrapAngle(this.sweep + this.sweepDirection * BOT.sweepRadPerSec * (stepMs / 1000));
    out.aimX = Math.cos(this.sweep);
    out.aimY = Math.sin(this.sweep);
  }

  private between(span: readonly [number, number]): number {
    return span[0] + this.random.next() * (span[1] - span[0]);
  }
}

/**
 * Sabit hızlı merminin, sabit hızla giden hedefi yakalama süresi (sn). Çözüm yoksa hedefe düz
 * uçuş süresine düşer; böylece nişan hiçbir koşulda NaN üretmez.
 */
export function interceptTime(
  rx: number,
  ry: number,
  vx: number,
  vy: number,
  projectileSpeed: number,
): number {
  const direct = Math.hypot(rx, ry) / projectileSpeed;
  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-9) {
    const time = Math.abs(b) < 1e-9 ? direct : -c / b;
    return time > 0 ? time : direct;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return direct;
  const root = Math.sqrt(discriminant);
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  const smallest = Math.min(first, second);
  const largest = Math.max(first, second);
  if (smallest > 0) return smallest;
  return largest > 0 ? largest : direct;
}
