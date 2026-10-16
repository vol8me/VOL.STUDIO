import { clampSimulationStep } from '@volstudio/core';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { EventQueue } from '@volstudio/core/time';
import { NETWORK } from '@/config/network';
import { STRIKER, vehicleAt } from '@/config/vehicles';
import type { TankCommand } from '@/sim/command';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { Simulation } from '@/sim/Simulation';
import type { Launch } from '@/sim/vehicleStep';
import type { World } from '@/sim/world/World';
import type { SimEvent } from '@/sim/events';
import type { NetEvent, EventBatch } from './events';
import type { OnlineSession } from './OnlineSession';
import { PredictedPilot, type PilotPose } from './PredictedPilot';
import { applyVitals, RemoteTanks } from './RemoteTanks';
import { NO_TEAM, type PlayerSnapshot } from './schema';

/**
 * Sunucunun bildirdiği isabeti/patlamayı, aynı sahibin yerel mermisiyle eşleştirme yarıçapı: görüntü
 * geriye dönük süre kadar geride olduğu için mermi o sürede aldığı yol kadar farklı yerde olabilir.
 */
function retireRadius(vehicle: Vehicle | undefined): number {
  const speed = (vehicle?.weapon ?? STRIKER.armament.weapon).projectileSpeed;
  return (speed * NETWORK.interpolationDelayMs) / 1000;
}

/**
 * Olay oyuncuyu doğrudan ilgilendiriyor mu (kaynak, hedef ya da taraf)? Oyuncunun kendi atışı,
 * aldığı isabet ve ölümü gecikmeden gösterilir; diğerleri arasındaki olaylar uzak araçlarla aynı
 * geriye dönük zamanda oynar. Oda yaşamı olayları (katılma, maç) zaman ekseninde yer tutmaz.
 */
export function involvesPlayer(event: NetEvent, id: number): boolean {
  switch (event.kind) {
    case 'fired':
    case 'wallHit':
      return event.source === id;
    case 'impact':
      return event.owner === id;
    case 'hit':
      return event.owner === id || event.target === id;
    case 'collision':
      return event.a === id || event.b === id;
    case 'damaged':
    case 'healed':
    case 'died':
      return event.target === id || event.source === id;
    case 'broke':
    case 'respawned':
      return event.target === id;
    default:
      return true;
  }
}

/**
 * Çevrimiçi sahnenin Phaser'sız görünüm modeli. Sunucu yetkilidir; burada olan her şey sunuma
 * yöneliktir: kendi aracımız öngörüyle (`PredictedPilot`), diğerleri ara değerle (`RemoteTanks`)
 * ve mermiler yerel olarak uçurulur. Olaylar sunucudan gelir ve oyuncuyu ilgilendirmiyorsa uzak
 * araçlarla aynı geriye dönük zamanda bırakılır.
 *
 * Gösterim sözleşmesi: bütün araçlar için çizilecek poz `tank.previous`tadır (kendi aracımız için
 * ara değerli öngörü pozu, uzaklar için ara değerli durum); çağıran `tankFrame(tank, 0)` okur.
 */
export class OnlineWorld {
  readonly sim: Simulation;
  readonly pilot: PredictedPilot;
  readonly remotes: RemoteTanks;
  private readonly queue = new EventQueue<NetEvent>();
  private readonly due: NetEvent[] = [];
  private readonly outbox: NetEvent[] = [];
  /** Yerel mermi adımının ürettiği olaylar: etkileri sunucu olaylarından geldiği için atılır. */
  private readonly discarded: SimEvent[] = [];
  private readonly scope = new DisposableScope();
  private readonly selfRecord: PlayerSnapshot;

  constructor(
    private readonly session: OnlineSession,
    private readonly space: World,
  ) {
    const self = session.self;
    if (!self) throw new Error('Oturumda kendi oyuncu kaydı yok.');
    this.selfRecord = self;
    const spec = vehicleAt(self.model) ?? STRIKER;
    this.sim = new Simulation({ world: space, vehicle: spec, spawnPlayer: false });
    const vehicle = this.sim.spawn(
      self.x,
      self.y,
      self.hull,
      self.team === NO_TEAM ? null : self.team,
      self.vehicleId,
      spec,
    );
    this.pilot = new PredictedPilot({
      room: session.room,
      predict: session.predict,
      self,
      space,
      vehicle,
      divergenceTolerance: NETWORK.divergenceTolerance,
      onFired: (launch, mount) => this.fireLocally(launch, mount),
    });
    this.remotes = new RemoteTanks(session.room, session.predict, this.sim);
    this.scope.addSubscription(session.onEvents((batch) => this.receive(batch)));
  }

  /** Kontrol edilen araç. */
  get player(): Vehicle {
    return this.pilot.vehicle;
  }

  /** Sunucudaki kayıt adı; bilinmeyen araç için `undefined`. */
  nameOf(vehicleId: number): string | undefined {
    for (const record of this.session.room.state.players.values())
      if (record.vehicleId === vehicleId) return record.name;
    return undefined;
  }

  /** Araç bir bot mu: kayıtta `bot` bayrağı sunucuca konur; bilinmeyen araç için false. */
  isBot(vehicleId: number): boolean {
    for (const record of this.session.room.state.players.values())
      if (record.vehicleId === vehicleId) return record.bot;
    return false;
  }

  /** Bir sabit adımın niyetini sunucuya yollar ve yerelde öngörür. */
  step(command: TankCommand): void {
    this.pilot.send(command);
  }

  /**
   * Her karede, sabit adımlardan sonra çağrılır: bekleyen olayları zamanı gelince bırakır,
   * araçları ve sayaçları tazeler, yerel mermileri uçurur.
   */
  advance(deltaMs: number): void {
    this.queue.release(this.session.displayTimeMs, this.due);
    for (const event of this.due) this.apply(event);
    this.due.length = 0;

    const age = this.session.snapshotAgeMs;
    this.remotes.update(age);
    applyVitals(this.player, this.selfRecord, age);
    this.placePose(this.player, this.pilot.pose());

    this.discarded.length = 0;
    this.sim.projectiles.step(clampSimulationStep(deltaMs), this.space, this.discarded);
  }

  /** Bırakılmış olayları `out`a aktarır ve kutuyu boşaltır. */
  drainEvents(out: NetEvent[]): NetEvent[] {
    for (const event of this.outbox) out.push(event);
    this.outbox.length = 0;
    return out;
  }

  dispose(): void {
    this.scope.dispose();
    this.remotes.dispose();
    this.pilot.dispose();
    this.queue.clear();
    this.sim.projectiles.clear();
  }

  /** Öngörülen atış: mermi ve ağız parlaması sunucu yanıtı beklenmeden başlar. */
  private fireLocally(launch: Launch, mount: number): void {
    const id = this.player.id;
    const profile = this.sim.profileFor(this.player.weapon);
    this.sim.projectiles.spawn(
      id,
      launch.x,
      launch.y,
      launch.vx,
      launch.vy,
      profile,
      this.sim.elevationOf(this.player),
    );
    this.outbox.push({
      kind: 'fired',
      source: id,
      mount,
      x: launch.x,
      y: launch.y,
      angle: launch.angle,
      vx: launch.vx,
      vy: launch.vy,
    });
  }

  /** Sunucunun bir adımlık olay paketini işler (oturum bunu kendiliğinden çağırır). */
  receive(batch: EventBatch): void {
    const id = this.player.id;
    const at = this.session.timeline.toServer(batch.t);
    for (const event of batch.events) {
      if (at === undefined || involvesPlayer(event, id)) this.apply(event);
      else this.queue.push(at, event);
    }
  }

  private apply(event: NetEvent): void {
    switch (event.kind) {
      case 'fired':
        // Kendi atışımız öngörüyle zaten oynadı.
        if (event.source === this.player.id) return;
        {
          const shooter = this.sim.vehicle(event.source);
          const profile = this.sim.profileFor((shooter ?? this.player).weapon);
          this.sim.projectiles.spawn(
            event.source,
            event.x,
            event.y,
            event.vx,
            event.vy,
            profile,
            shooter ? this.sim.elevationOf(shooter) : 0,
          );
        }
        break;
      case 'impact':
      case 'hit':
        this.sim.projectiles.retire(
          event.owner,
          event.x,
          event.y,
          retireRadius(this.sim.vehicle(event.owner)),
        );
        break;
    }
    this.outbox.push(event);
  }

  /** Çizim pozunu `previous`a yazar: `tankFrame(tank, 0)` ara değerli öngörüyü okur. */
  private placePose(vehicle: Vehicle, pose: PilotPose): void {
    const previous = vehicle.chassis.previous;
    previous.x = pose.x;
    previous.y = pose.y;
    previous.hull = pose.hull;
    previous.turret = pose.turret;
    previous.pitch = pose.pitch;
    previous.roll = pose.roll;
  }
}
