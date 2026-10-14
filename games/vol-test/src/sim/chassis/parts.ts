import { PARTS } from '@/config/parts';
import type { VehicleSpec } from '@/config/vehicles';
import type { ChassisKind } from './Chassis';

/**
 * Şasi parçalarının bit maskesi (`Chassis.parts`): bir bit, kırık bir parçadır. Tankta iki bit yan
 * paletlerdir, süzülen araçta yan iticilerdir (aynı iki bit); yürüyücüde `taraf * 4 + istasyon` bacağı: sol bacaklar 0-3, sağ bacaklar 4-7, önden arkaya
 * (görünümdeki bacak sırasıyla aynı). Maske ağ durumunda tamsayı olarak taşınır ve ara değer ALMAZ.
 */
export const TRACK_LEFT = 1;
export const TRACK_RIGHT = 2;
export const TRACK_BITS = 2;
export const LEGS_PER_SIDE = 4;

/** Yürüyücünün bacak bitini verir; `side` 0 sol, 1 sağ, `station` önden arkaya. */
export function legBit(side: number, station: number): number {
  return 1 << (side * LEGS_PER_SIDE + station);
}

/** Bir yandaki kırık bacak sayısı (0-4); `side` 0 sol, 1 sağ. */
export function lostLegs(parts: number, side: number): number {
  let bits = (parts >> (side * LEGS_PER_SIDE)) & 0xf;
  let count = 0;
  while (bits !== 0) {
    count += bits & 1;
    bits >>= 1;
  }
  return count;
}

/**
 * Eksik bacaklı yanın yürüyüş döngüsündeki çöküşü [0, 1]: yan başına kayıp bacak oranı ile yürüyüş
 * döngüsünün fazından türer (rastgelelik yok). Sim tökezleme kapasitesini kayıpla ölçekleyerek, görünüm
 * gövdenin çökmesini yalnız fazı için (`lost` = tam yan) okur; çizilen çökme ile hız kesintisi aynı karede olur.
 */
export function limpCollapse(lost: number, ground: number): number {
  const phase = (ground / PARTS.walker.stumble.stride) * Math.PI * 2;
  return (lost / LEGS_PER_SIDE) * 0.5 * (1 - Math.cos(phase));
}

/** Parçanın gövde çerçevesindeki bağlantı noktası: ileri ve sağ ekseni (dünya birimi). */
export interface PartAnchor {
  forward: number;
  right: number;
}

/**
 * Parçanın gövdeye bağlandığı nokta: tankta yan paletin ortası, süzülen araçta yan iticinin ortası, yürüyücüde bacağın kalçası kenarda.
 * Kopan parçanın savrulacağı yer ve yön buradan türer (sunum ve ses, fizik değil).
 */
export function partAnchor(spec: VehicleSpec, index: number, out: PartAnchor): PartAnchor {
  const side = partSide(spec.kind, index);
  switch (spec.kind) {
    case 'tank':
      out.forward = 0;
      out.right = side * spec.tank.trackOffset;
      break;
    case 'hover':
      out.forward = -4;
      out.right = side * spec.hover.trackOffset;
      break;
    case 'walker': {
      const stations: readonly number[] = PARTS.walker.stations[spec.id];
      out.forward = stations[index % LEGS_PER_SIDE];
      out.right = side * (spec.walker.halfWidth + 4);
      break;
    }
  }
  return out;
}

/** Tek bitin sırası (0 tabanlı). */
export function bitIndex(bit: number): number {
  return 31 - Math.clz32(bit);
}

/** Kırılan parçanın gövdenin hangi yanında olduğu: -1 sol, +1 sağ. */
export function partSide(kind: ChassisKind, index: number): -1 | 1 {
  if (kind === 'walker') return index < LEGS_PER_SIDE ? -1 : 1;
  return index === 0 ? -1 : 1;
}
