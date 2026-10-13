import { DisposableScope } from '@volstudio/core/lifecycle';
import { Callbacks, type Predict, type Room } from '@volstudio/network/client';
import { NETWORK } from '@/config/network';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { Simulation } from '@/sim/Simulation';
import {
  createTankState,
  TANK_STATE_FLAGS,
  TANK_STATE_NUMBERS,
  type TankState,
} from '@/sim/tank/TankState';
import { NO_TEAM, type MatchSnapshot, type PlayerSnapshot } from './schema';

type AttachConfig = Parameters<Predict['attach']>[1];

/** Dönüş açısı olan alanlar: ±π dikişinde kısa yoldan ara değer alınır. */
const ANGLE_FIELDS: ReadonlySet<string> = new Set(['hull', 'turret']);

/**
 * Uzak araçların bütün tank alanları geriye dönük süreyle ara değer alır. Konumdaki büyük sıçrama
 * (yeniden doğma, maç sıfırlaması) süzülmez, ışınlanır.
 */
function interpolation(): AttachConfig {
  const config: Record<string, unknown> = {};
  for (const key of TANK_STATE_NUMBERS) {
    config[key] = {
      mode: 'lerp',
      delay: NETWORK.interpolationDelayMs,
      angle: ANGLE_FIELDS.has(key),
      snap: key === 'x' || key === 'y' ? NETWORK.seatRadius / 2 : 0,
    };
  }
  return config;
}

interface Remote {
  readonly record: PlayerSnapshot;
  readonly vehicle: Vehicle;
  readonly state: TankState;
  readonly detach: () => void;
}

/**
 * Diğer oyuncuların araçları: sunucudaki oyuncu kaydı geldikçe görünüm benzetimine bir araç
 * eklenir, çıkınca kalkar. Araç fiziği çalıştırılmaz; her karede SDK'nın ara değerli alanları
 * tanka yazılır, böylece görünüm, ses, harita ve efektler kendi aracımızla aynı `Vehicle`
 * nesnesini okur.
 */
export class RemoteTanks {
  private readonly remotes = new Map<string, Remote>();
  private readonly scope = new DisposableScope();
  private readonly attachConfig = interpolation();

  constructor(
    private readonly room: Room<MatchSnapshot>,
    private readonly predict: Predict,
    private readonly sim: Simulation,
  ) {
    const callbacks = Callbacks.get(room);
    this.scope.addSubscription(callbacks.onAdd('players', (record, key) => this.add(key, record)));
    this.scope.addSubscription(callbacks.onRemove('players', (_record, key) => this.remove(key)));
  }

  get count(): number {
    return this.remotes.size;
  }

  /** Uzak aracın benzetimdeki nesnesi; kimlik kendi aracımıza aitse `undefined`. */
  vehicle(vehicleId: number): Vehicle | undefined {
    for (const remote of this.remotes.values())
      if (remote.vehicle.id === vehicleId) return remote.vehicle;
    return undefined;
  }

  /**
   * Her uzak aracı ara değerli duruma getirir. `ageMs`, son yamanın yaşıdır: sayaçlar (yeniden doğma,
   * koruma) yamalar arasında bu kadar ilerlemiş sayılır.
   */
  update(ageMs: number): void {
    for (const remote of this.remotes.values()) {
      const { record, vehicle, state } = remote;
      for (const key of TANK_STATE_NUMBERS) state[key] = this.predict.value(record, key);
      for (const key of TANK_STATE_FLAGS) state[key] = record[key];
      vehicle.tank.restoreState(state);
      applyVitals(vehicle, record, ageMs);
    }
  }

  dispose(): void {
    this.scope.dispose();
    for (const key of [...this.remotes.keys()]) this.remove(key);
  }

  private add(key: string, record: PlayerSnapshot): void {
    if (key === this.room.sessionId || this.remotes.has(key)) return;
    const team = record.team === NO_TEAM ? null : record.team;
    const vehicle = this.sim.spawn(record.x, record.y, record.hull, team, record.vehicleId);
    this.remotes.set(key, {
      record,
      vehicle,
      state: createTankState(),
      detach: this.predict.attach(record, this.attachConfig),
    });
  }

  private remove(key: string): void {
    const remote = this.remotes.get(key);
    if (!remote) return;
    this.remotes.delete(key);
    remote.detach();
    this.sim.despawn(remote.vehicle.id);
  }
}

/**
 * Sunucunun can ve zaman sayaçlarını araca yazar. Sayaçlar yamalar arasında sunucu kayıtlarında
 * donuk kalır; `ageMs` kadar ilerletilerek HUD'un geri sayımı akıcı olur.
 */
export function applyVitals(vehicle: Vehicle, record: PlayerSnapshot, ageMs: number): void {
  const vitality = vehicle.vitality;
  vitality.health = record.health;
  vitality.respawnRemainingMs = Math.max(0, record.respawnMs - ageMs);
  vitality.protectionRemainingMs = Math.max(0, record.protectionMs - ageMs);
}
