import { clampSimulationStep, SimulationClock } from '@volstudio/core';
import { createStatefulRandom, type StatefulRandom } from '@volstudio/core/random';
import { BACKDROP } from '@/config/backdrop';
import { GAME } from '@/config/game';
import { VEHICLES, VEHICLE_IDS, type VehicleId } from '@/config/vehicles';
import { idleCommand, type TankCommand } from '../command';
import type { Vehicle } from '../entities/Vehicle';
import type { SimEvent } from '../events';
import { Simulation } from '../Simulation';
import type { WeatherSystem } from '../weather/WeatherSystem';
import type { World } from '../world/World';

export interface BackdropParadeOptions {
  readonly world: World;
  /** Alayla birlikte akan hava; görünüm aynı modeli okur. */
  readonly weather: WeatherSystem;
  readonly seed: number;
  /** Aynı anda yürüyen araç sayısı. */
  readonly units: number;
}

/** Bir şeridin aracı, yolu ve gösteri zamanlayıcıları. */
interface Walker {
  vehicle: Vehicle | undefined;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Aracın yeniden başlamasına kalan süre (ms); araç varken 0. */
  waitMs: number;
  /** Sonraki atılıma kalan süre ve süren atılımın kalanı (ms). */
  boostInMs: number;
  boostLeftMs: number;
  /** Sıkışma izi: son konum ve orada geçen süre. */
  lastX: number;
  lastY: number;
  stillMs: number;
}

/**
 * Menü arka planının alayı: gerçek savaş yoktur, araçlar ekranın dışından girip sahnenin içinden
 * geçerek karşı yöne yürür, çıkınca sıradaki model olarak yeniden başlar. Aynı `Simulation` sürülür
 * (hareket, çarpışma ve görünüm oyundakiyle aynıdır); komutlar bot değil bu sınıfın düz yol takibidir
 * ve araçlar birbirine yol verir. Atış yoktur, araçlar hasar almaz. Modeller dönüşümlü gelir, böylece
 * menü hepsini sergiler. Zaman sabit adımla ilerler.
 */
export class BackdropParade {
  readonly sim: Simulation;
  private readonly clock: SimulationClock;
  private readonly random: StatefulRandom;
  private readonly walkers: Walker[];
  private readonly commands = new Map<number, TankCommand>();
  private readonly order: VehicleId[];
  private readonly centerX: number;
  private readonly centerY: number;
  private next = 0;

  constructor(options: BackdropParadeOptions) {
    this.sim = new Simulation({
      world: options.world,
      spawnPlayer: false,
      weather: options.weather,
    });
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });
    this.random = createStatefulRandom(options.seed);
    this.centerX = options.world.width / 2;
    this.centerY = options.world.height / 2;
    this.order = this.shuffled();
    this.walkers = Array.from({ length: options.units }, () => ({
      vehicle: undefined,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      waitMs: 0,
      boostInMs: 0,
      boostLeftMs: 0,
      lastX: 0,
      lastY: 0,
      stillMs: 0,
    }));
    // İlk kare dolu olsun: her araç yolunun rastgele bir yerinden başlar.
    for (const [lane, walker] of this.walkers.entries()) this.launch(walker, lane, true);
  }

  get vehicles(): readonly Vehicle[] {
    return this.sim.vehicles;
  }

  /** Görünümün adımlar arası ara değeri [0, 1]. */
  get alpha(): number {
    return this.clock.getInterpolationAlpha();
  }

  /** Alayı gerçek kare süresi kadar ilerletir; üretilen olaylar `drainEvents`le alınır. */
  advance(deltaMs: number): void {
    this.clock.advance(deltaMs, (stepMs) => this.step(stepMs), {
      acceptedDeltaMs: clampSimulationStep(deltaMs),
      paused: false,
    });
  }

  /** Biriken fizik olaylarını `out`a taşır ve kuyruğu boşaltır. */
  drainEvents(out: SimEvent[]): SimEvent[] {
    return this.sim.drainEvents(out);
  }

  private step(stepMs: number): void {
    for (const [lane, walker] of this.walkers.entries()) this.tend(walker, lane, stepMs);
    this.sim.step((vehicle) => this.commands.get(vehicle.id) ?? idleCommand(), stepMs);
  }

  /** Bir şeridin bir adımı: yeniden başlama, varış ve sıkışma denetimi, ardından komut. */
  private tend(walker: Walker, lane: number, stepMs: number): void {
    const { vehicle } = walker;
    const { parade } = BACKDROP;
    if (!vehicle) {
      walker.waitMs -= stepMs;
      if (walker.waitMs <= 0) this.launch(walker, lane, false);
      return;
    }
    const chassis = vehicle.chassis;
    const toX = walker.toX - chassis.x;
    const toY = walker.toY - chassis.y;
    const left = Math.hypot(toX, toY);
    const moved = Math.hypot(chassis.x - walker.lastX, chassis.y - walker.lastY);
    walker.stillMs = moved < 1 ? walker.stillMs + stepMs : 0;
    walker.lastX = chassis.x;
    walker.lastY = chassis.y;
    if (left < parade.arrive || walker.stillMs > parade.stuckMs) {
      this.retire(walker, vehicle);
      return;
    }

    // Hedefe düz yürür; yakındaki araçlardan yana kayar: yan yana geçerler, çarpışmazlar.
    let dirX = toX / left;
    let dirY = toY / left;
    for (const other of this.sim.vehicles) {
      if (other === vehicle) continue;
      const dx = chassis.x - other.chassis.x;
      const dy = chassis.y - other.chassis.y;
      const gap = Math.hypot(dx, dy);
      if (gap >= parade.avoidRange || gap < 1e-3) continue;
      const push = ((parade.avoidRange - gap) / parade.avoidRange) * parade.avoidWeight;
      dirX += (dx / gap) * push;
      dirY += (dy / gap) * push;
    }
    const length = Math.hypot(dirX, dirY) || 1;
    const command = this.commands.get(vehicle.id);
    if (!command) return;
    command.moveX = dirX / length;
    command.moveY = dirY / length;
    command.aimX = command.moveX;
    command.aimY = command.moveY;
    command.boost = this.boosting(walker, stepMs);
  }

  /** Atılım gösterisi: aralıklı kısa darbeler (sıçrayıcı sıçrar, örümcek atılır, süzülen hızlanır). */
  private boosting(walker: Walker, stepMs: number): boolean {
    const { parade } = BACKDROP;
    if (walker.boostLeftMs > 0) {
      walker.boostLeftMs -= stepMs;
      return true;
    }
    walker.boostInMs -= stepMs;
    if (walker.boostInMs > 0) return false;
    walker.boostInMs = this.between(parade.boostGapMs);
    walker.boostLeftMs = this.between(parade.boostMs);
    return false;
  }

  private retire(walker: Walker, vehicle: Vehicle): void {
    this.sim.despawn(vehicle.id);
    this.commands.delete(vehicle.id);
    walker.vehicle = undefined;
    walker.waitMs = this.between(BACKDROP.parade.respawnMs);
  }

  /**
   * Yeni yol kurar ve sıradaki modeli yürütür. `scattered`: açılış karesi için yolun rastgele bir
   * noktasından başlar (diğer araçlardan `spawnGap` uzakta); aksi hâlde girişten başlar.
   */
  private launch(walker: Walker, lane: number, scattered: boolean): void {
    const { parade } = BACKDROP;
    // Giriş yönleri şeritlere dağıtılır: her şerit çevrenin ayrı bir diliminden girer.
    const slice = (Math.PI * 2) / this.walkers.length;
    const entry = lane * slice + this.random.next() * slice;
    const exit = entry + Math.PI + (this.random.next() * 2 - 1) * parade.skew;
    walker.fromX = this.centerX + Math.cos(entry) * parade.radius;
    walker.fromY = this.centerY + Math.sin(entry) * parade.radius;
    walker.toX = this.centerX + Math.cos(exit) * parade.radius;
    walker.toY = this.centerY + Math.sin(exit) * parade.radius;
    let progress = scattered ? 0.1 + this.random.next() * 0.8 : 0;
    let x = walker.fromX;
    let y = walker.fromY;
    for (let attempt = 0; attempt < 8; attempt++) {
      x = walker.fromX + (walker.toX - walker.fromX) * progress;
      y = walker.fromY + (walker.toY - walker.fromY) * progress;
      const clear = this.sim.vehicles.every(
        (other) => Math.hypot(other.chassis.x - x, other.chassis.y - y) > parade.spawnGap,
      );
      if (clear || !scattered) break;
      progress = 0.1 + this.random.next() * 0.8;
    }
    const hull = Math.atan2(walker.toY - walker.fromY, walker.toX - walker.fromX);
    const id = this.order[this.next++ % this.order.length];
    const vehicle = this.sim.spawn(x, y, hull, null, undefined, VEHICLES[id]);
    // Alay savaş değildir: çarpışma dahil hiçbir şey araca zarar vermez.
    vehicle.vitality.protectionRemainingMs = Number.POSITIVE_INFINITY;
    walker.vehicle = vehicle;
    walker.waitMs = 0;
    walker.boostInMs = this.between(parade.boostGapMs);
    walker.boostLeftMs = 0;
    walker.lastX = x;
    walker.lastY = y;
    walker.stillMs = 0;
    this.commands.set(vehicle.id, idleCommand());
  }

  /** Model sırası: her model bir kez gelir, sıra tohumdan karıştırılır. */
  private shuffled(): VehicleId[] {
    const ids: VehicleId[] = [...VEHICLE_IDS];
    for (let index = ids.length - 1; index > 0; index--) {
      const swap = Math.floor(this.random.next() * (index + 1));
      [ids[index], ids[swap]] = [ids[swap], ids[index]];
    }
    return ids;
  }

  private between(range: readonly [number, number]): number {
    return range[0] + this.random.next() * (range[1] - range[0]);
  }
}
