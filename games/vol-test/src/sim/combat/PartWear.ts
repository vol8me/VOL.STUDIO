import { PARTS } from '@/config/parts';
import type { VehicleSpec } from '@/config/vehicles';
import type { Chassis } from '../chassis/Chassis';
import { LEGS_PER_SIDE, TRACK_BITS, legBit } from '../chassis/parts';

/** Doğrusal basamak: `from`un altı 0, `to`nun üstü 1. */
function ramp(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)));
}

/**
 * Bir aracın parça aşınması. Mermi temas noktası gövde çerçevesine çevrilir ve hasar o bölgenin
 * parçasına (yan palet ya da en yakın bacaklar) yazılır; parça dayanımına ulaşınca kırılır. Konum
 * kritikse (gövde kenarı) aşınma büyür. Rastgelelik yoktur: aynı atış dizisi aynı parçayı kırar,
 * bu yüzden sunucu, öngörü ve sınama aynı sonucu görür. Darbeden sonra bir süre dinlenen parçanın
 * aşınması söner; uzun süre hasar alınmazsa kırık parçalar birer birer yerine oturur.
 *
 * Aşınma ağa gitmez: yalnız sonuç (`Chassis.parts` bit maskesi) ağ durumundadır.
 */
export class PartWear {
  private readonly wear: number[];
  private readonly limit: number;
  private sinceHitMs = 0;
  private sinceDamageMs = 0;
  private mendMs = 0;

  constructor(private readonly spec: VehicleSpec) {
    this.wear = new Array<number>(spec.kind === 'tank' ? TRACK_BITS : LEGS_PER_SIDE * 2).fill(0);
    const share = spec.kind === 'tank' ? PARTS.tank.healthShare : PARTS.walker.healthShare;
    this.limit = spec.health * share;
  }

  /** Bir parçanın dayanımı (can karşılığı). */
  get partLimit(): number {
    return this.limit;
  }

  /** Parçanın birikmiş aşınması (sınama ve ölçüm). */
  wearOf(slot: number): number {
    return this.wear[slot] ?? 0;
  }

  /** Aracın canı azaldı (mermi, çarpma, ne olursa): onarım sessizliği ve aşınma sönümü yeniden başlar. */
  touch(): void {
    this.sinceDamageMs = 0;
    this.sinceHitMs = 0;
    this.mendMs = 0;
  }

  /**
   * Mermi `(x, y)` noktasında `damage` can götürdü: bölgenin parçasını aşındırır ve BU çağrıda kırılan
   * parçaların bit maskesini döner (`Chassis.parts`a yazmak çağıranındır).
   */
  strike(chassis: Chassis, x: number, y: number, damage: number): number {
    if (!(damage > 0)) return 0;
    const dx = x - chassis.x;
    const dy = y - chassis.y;
    const cos = Math.cos(chassis.hull);
    const sin = Math.sin(chassis.hull);
    const forward = dx * cos + dy * sin;
    const right = -dx * sin + dy * cos;
    const halfWidth = chassis.shape.halfWidth;
    const edge = Math.min(1, Math.abs(right) / halfWidth);
    return this.spec.kind === 'tank'
      ? this.strikeTrack(chassis, right, edge, damage)
      : this.strikeLegs(chassis, forward, right, edge, damage);
  }

  /** Aşınmayı söndürür, sessizlik sürerse kırık parçaları birer birer yerine oturtur; onarılan maskeyi döner. */
  step(chassis: Chassis, stepMs: number): number {
    this.sinceHitMs += stepMs;
    this.sinceDamageMs += stepMs;
    if (this.sinceHitMs > PARTS.wear.decayDelayMs) {
      const fade = (PARTS.wear.decayPerSecond * stepMs) / 1000;
      for (let slot = 0; slot < this.wear.length; slot++) {
        if (this.wear[slot] < this.limit) this.wear[slot] = Math.max(0, this.wear[slot] - fade);
      }
    }
    if (chassis.parts === 0 || this.sinceDamageMs < PARTS.repair.quietMs) return 0;
    this.mendMs += stepMs;
    if (this.mendMs < PARTS.repair.intervalMs) return 0;
    this.mendMs = 0;
    for (let slot = 0; slot < this.wear.length; slot++) {
      const bit = this.bitOf(slot);
      if ((chassis.parts & bit) === 0) continue;
      chassis.parts &= ~bit;
      this.wear[slot] = 0;
      return bit;
    }
    return 0;
  }

  /** Doğuş ya da sıfırlama: bütün parçalar sağlam, aşınma boş. */
  reset(): void {
    this.wear.fill(0);
    this.sinceHitMs = 0;
    this.sinceDamageMs = 0;
    this.mendMs = 0;
  }

  /** Aşınma yuvasının bit maskesi (tankta yuva 0 sol, 1 sağ palet; yürüyücüde `taraf*4 + istasyon`). */
  bitOf(slot: number): number {
    return this.spec.kind === 'tank'
      ? 1 << slot
      : legBit(Math.floor(slot / LEGS_PER_SIDE), slot % LEGS_PER_SIDE);
  }

  private strikeTrack(chassis: Chassis, right: number, edge: number, damage: number): number {
    const config = PARTS.tank;
    const reach = ramp(edge, config.sideStart, 1);
    if (reach === 0) return 0;
    const critical = edge >= config.criticalStart ? config.criticalGain : 1;
    // Sol palet gövdenin -y yanındadır (sağ eksen +y).
    return this.add(chassis, right < 0 ? 0 : 1, damage * reach * critical);
  }

  private strikeLegs(
    chassis: Chassis,
    forward: number,
    right: number,
    edge: number,
    damage: number,
  ): number {
    const config = PARTS.walker;
    const stations: readonly number[] = config.stations[this.spec.id as 'arachnid' | 'widow'];
    const side = right < 0 ? 0 : 1;
    const critical = edge >= config.criticalStart ? config.criticalGain : 1;
    const reach = config.centreWeight + (1 - config.centreWeight) * ramp(edge, config.sideStart, 1);
    const spacing = (stations[0] - stations[stations.length - 1]) / (stations.length - 1);
    const sigma = Math.max(1, spacing * config.spread);
    let broken = 0;
    stations.forEach((station, index) => {
      const offset = (forward - station) / sigma;
      const share = Math.exp(-offset * offset);
      if (share < 0.05) return;
      broken |= this.add(chassis, side * LEGS_PER_SIDE + index, damage * reach * critical * share);
    });
    return broken;
  }

  private add(chassis: Chassis, slot: number, amount: number): number {
    const bit = this.bitOf(slot);
    if ((chassis.parts & bit) !== 0) return 0;
    this.wear[slot] = Math.min(this.limit, this.wear[slot] + amount);
    return this.wear[slot] >= this.limit ? bit : 0;
  }
}
