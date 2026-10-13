import { Room } from '@colyseus/core';
import { schema, t } from '@colyseus/schema';
import { InputMailbox, PROTOCOL_VERSION } from '@volstudio/network/protocol';
import { runRoomLoop } from '@volstudio/network/server';
import { GAME } from '../src/config/game';
import { NETWORK } from '../src/config/network';
import { SUSPENSION, TANK, WEAPON } from '../src/config/tank';
import { WORLD } from '../src/config/world';
import { idleCommand } from '../src/sim/command';
import type { Vehicle } from '../src/sim/entities/Vehicle';
import { Simulation } from '../src/sim/Simulation';
import { World } from '../src/sim/world/World';
import { SeatPool, seatPoint } from './Seats';

const PlayerState = schema(
  {
    vehicleId: t.uint32(),
    x: t.float32(),
    y: t.float32(),
    hull: t.float32(),
    turret: t.float32(),
    health: t.float32(),
    maxHealth: t.float32(),
    alive: t.boolean(),
    respawnRemainingMs: t.float32(),
  },
  'VolPlayer',
);

const WorldState = schema({ tick: t.uint32(), players: t.map(PlayerState) }, 'VolWorld');

type PlayerRecord = {
  readonly vehicle: Vehicle;
  readonly mailbox: InputMailbox;
  readonly seat: number;
};

/** Oyuna ait tek dünya otoritesi. İstemci hareket, ateş sonucu veya isabet pozunu yazamaz. */
export class WorldRoom extends Room {
  override maxClients = NETWORK.maxPlayers;
  override maxMessagesPerSecond = NETWORK.maxMessagesPerSecond;
  override autoDispose = false;
  override state = new WorldState();

  private readonly sim = new Simulation({
    world: new World(WORLD.width, WORLD.height, WORLD.gridStep),
    tank: TANK,
    suspension: SUSPENSION,
    weapon: WEAPON,
    spawnPlayer: false,
  });
  private readonly players = new Map<string, PlayerRecord>();
  private readonly seats = new SeatPool(NETWORK.maxPlayers);
  private tick = 0;

  override onAuth(_client: unknown, options: { protocol?: unknown }): boolean {
    return options?.protocol === PROTOCOL_VERSION;
  }

  override onCreate(): void {
    this.setPatchRate(NETWORK.patchRateMs);
    runRoomLoop(this, 1000 / GAME.simulationStepMs, () => {
      const commands = new Map<number, ReturnType<typeof idleCommand>>();
      for (const { vehicle, mailbox } of this.players.values()) {
        commands.set(vehicle.id, mailbox.consume());
      }
      this.sim.step((vehicle) => commands.get(vehicle.id) ?? idleCommand(), GAME.simulationStepMs);
      this.tick++;
      this.state.tick = this.tick;
      for (const [sessionId, { vehicle }] of this.players) {
        const state = this.state.players.get(sessionId);
        if (!state) continue;
        state.x = vehicle.tank.x;
        state.y = vehicle.tank.y;
        state.hull = vehicle.tank.hull;
        state.turret = vehicle.tank.turret;
        state.health = vehicle.vitality.health;
        state.maxHealth = vehicle.vitality.maxHealth;
        state.alive = vehicle.vitality.alive;
        state.respawnRemainingMs = vehicle.vitality.respawnRemainingMs;
      }
      this.sim.drainEvents([]);
    });
    this.onMessage('input', (client, payload: unknown) => {
      this.players.get(client.sessionId)?.mailbox.offer(payload);
    });
  }

  override onJoin(client: { sessionId: string }): void {
    // `maxClients` yuva sayısına eşittir: Colyseus dolu odaya katılımı zaten reddeder.
    const seat = this.seats.acquire()!;
    const point = seatPoint(seat, NETWORK.maxPlayers, this.sim.world.center);
    const vehicle = this.sim.spawn(point.x, point.y, point.hull);
    this.players.set(client.sessionId, {
      vehicle,
      mailbox: new InputMailbox(NETWORK.inputHoldSteps),
      seat,
    });
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        vehicleId: vehicle.id,
        x: vehicle.tank.x,
        y: vehicle.tank.y,
        hull: vehicle.tank.hull,
        turret: vehicle.tank.turret,
        health: vehicle.vitality.health,
        maxHealth: vehicle.vitality.maxHealth,
        alive: vehicle.vitality.alive,
        respawnRemainingMs: vehicle.vitality.respawnRemainingMs,
      }),
    );
  }

  override onLeave(client: { sessionId: string }): void {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    player.mailbox.reset();
    this.players.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.seats.release(player.seat);
    this.sim.despawn(player.vehicle.id);
  }

  /** Şimdilik yalnız bir çalışma sürecinde RAM'deki dünya; kalıcı dünya kabulü ayrı yapılır. */
  get activeVehicles(): number {
    return this.players.size;
  }

  /** Simülasyondaki araç sayısı; bağlı oyuncu sayısından büyükse sahipsiz gövde kalmıştır. */
  get simulatedVehicles(): number {
    return this.sim.vehicles.length;
  }

  vehiclePositions(): readonly { readonly x: number; readonly y: number }[] {
    return this.sim.vehicles.map((vehicle) => ({ x: vehicle.tank.x, y: vehicle.tank.y }));
  }

  /** Araç merkezleri arasındaki en küçük uzaklık; tek araçta sonsuz. */
  minimumVehicleGap(): number {
    const points = this.vehiclePositions();
    let gap = Number.POSITIVE_INFINITY;
    for (let a = 0; a < points.length; a++)
      for (let b = a + 1; b < points.length; b++)
        gap = Math.min(gap, Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
    return gap;
  }
}
