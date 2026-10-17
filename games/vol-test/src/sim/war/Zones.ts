import { clamp } from '@volstudio/core/math/interpolation';
import { WAR, type ZoneSpec } from '@/config/war';
import type { Vehicle } from '../entities/Vehicle';
import type { WarEvent } from './events';

/** Sahibi olmayan bölgenin `owner` değeri. */
export const NO_OWNER = -1;

/** Bir bölgenin çalışma zamanı durumu. Konum ve yarıçap dünya ölçüsüne göre çözülmüştür. */
export interface Zone {
  readonly index: number;
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /**
   * Ele geçirme ilerlemesi [-1, 1]: +1 tam 0. cephenin, -1 tam 1. cephenin. İki cephe vardır;
   * işaret hangi yana doğru ilerlediğini söyler.
   */
  progress: number;
  /** Bölgenin sahibi; ilerleme sahibin ucuna ulaşınca değişir, sıfırı geçince tarafsızlaşır. */
  owner: number;
  /** İki cepheden de araç çemberin içindeyse `true`; ilerleme yalnız sayı eşitliğinde durur. */
  contested: boolean;
  /** Çemberdeki canlı araç sayısı, cephe indeksine göre. */
  readonly presence: [number, number];
}

/** Dünya ölçüsüne göre çözülmüş bölge listesi ve ele geçirme kuralı. */
export class ZoneField {
  readonly zones: Zone[];

  constructor(
    world: { readonly width: number; readonly height: number },
    specs: readonly ZoneSpec[] = WAR.zones,
  ) {
    this.zones = specs.map((spec, index) => ({
      index,
      id: spec.id,
      x: spec.x * world.width,
      y: spec.y * world.height,
      radius: spec.radius,
      progress: 0,
      owner: NO_OWNER,
      contested: false,
      presence: [0, 0],
    }));
  }

  /** Cephe başına elde tutulan bölge sayısı. */
  holdings(out: number[] = [0, 0]): number[] {
    out[0] = 0;
    out[1] = 0;
    for (const zone of this.zones) if (zone.owner !== NO_OWNER) out[zone.owner]++;
    return out;
  }

  /** Tüm bölgeleri tarafsıza döndürür (savaş sıfırlaması). */
  reset(): void {
    for (const zone of this.zones) {
      zone.progress = 0;
      zone.owner = NO_OWNER;
      zone.contested = false;
      zone.presence[0] = 0;
      zone.presence[1] = 0;
    }
  }

  /**
   * Bir adım: çemberdeki canlı araçları sayar, sayı farkına göre ilerletir. Rakipsiz ve boş bölge
   * sahibinin ucuna (sahibi yoksa sıfıra) yavaşça döner. Sahip değişimi `events`e yazılır.
   */
  step(stepMs: number, vehicles: readonly Vehicle[], events: WarEvent[]): void {
    if (!Number.isFinite(stepMs) || stepMs < 0)
      throw new RangeError('Bölge adımı sonlu ve negatif olmayan süre olmalı');
    if (stepMs === 0) return;
    const dt = stepMs / 1000;
    const { soloSeconds, maxAdvantage, decayPerSecond } = WAR.capture;
    for (const zone of this.zones) {
      zone.presence[0] = 0;
      zone.presence[1] = 0;
      const limit = zone.radius * zone.radius;
      for (const vehicle of vehicles) {
        const team = vehicle.team;
        if ((team !== 0 && team !== 1) || !vehicle.vitality.alive) continue;
        const dx = vehicle.chassis.x - zone.x;
        const dy = vehicle.chassis.y - zone.y;
        if (dx * dx + dy * dy <= limit) zone.presence[team]++;
      }
      const [first, second] = zone.presence;
      zone.contested = first > 0 && second > 0;
      const advantage = clamp(first - second, -maxAdvantage, maxAdvantage);
      if (advantage !== 0) {
        zone.progress = clamp(zone.progress + (advantage / soloSeconds) * dt, -1, 1);
      } else if (first === 0 && second === 0) {
        const anchor = zone.owner === NO_OWNER ? 0 : zone.owner === 0 ? 1 : -1;
        const gap = anchor - zone.progress;
        const move = decayPerSecond * dt;
        zone.progress = Math.abs(gap) <= move ? anchor : zone.progress + Math.sign(gap) * move;
      }
      this.settle(zone, events);
    }
  }

  private settle(zone: Zone, events: WarEvent[]): void {
    let owner = zone.owner;
    if (owner === 0 && zone.progress <= 0) owner = NO_OWNER;
    else if (owner === 1 && zone.progress >= 0) owner = NO_OWNER;
    if (owner === NO_OWNER) {
      if (zone.progress >= 1) owner = 0;
      else if (zone.progress <= -1) owner = 1;
    }
    if (owner === zone.owner) return;
    zone.owner = owner;
    events.push({ kind: 'zone', zone: zone.index, owner });
  }
}
