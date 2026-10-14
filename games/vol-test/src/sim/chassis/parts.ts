/**
 * Şasi parçalarının bit maskesi (`Chassis.parts`): bir bit, kırık bir parçadır. Tankta iki bit yan
 * paletlerdir; yürüyücüde `taraf * 4 + istasyon` bacağı: sol bacaklar 0-3, sağ bacaklar 4-7, önden arkaya
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

/** Tek bitin sırası (0 tabanlı). */
export function bitIndex(bit: number): number {
  return 31 - Math.clz32(bit);
}

/** Kırılan parçanın gövdenin hangi yanında olduğu: -1 sol, +1 sağ. */
export function partSide(kind: 'tank' | 'walker', index: number): -1 | 1 {
  if (kind === 'tank') return index === 0 ? -1 : 1;
  return index < LEGS_PER_SIDE ? -1 : 1;
}
