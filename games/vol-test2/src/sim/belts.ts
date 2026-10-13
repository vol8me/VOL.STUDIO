import { BELT, ITEM, KIND, MACHINES } from '@/config/factory';
import { DX, DY, type FactoryState } from './state';

/** Bir tile'a `item` verir; kabul edildiyse `true`. `direction` eşyanın hareket yönüdür. */
export function offer(s: FactoryState, to: number, item: number, direction: number): boolean {
  switch (s.kind[to]) {
    case KIND.conveyor:
      return insertOnBelt(s, to, item, direction);
    case KIND.core:
      s.inventory[item]++;
      s.delivered[item]++;
      return true;
    case KIND.smelter:
      if (item !== ITEM.ore || s.bufA[to] >= MACHINES.smelterBuffer) return false;
      s.bufA[to]++;
      return true;
    case KIND.turret:
      if (
        item !== ITEM.plate ||
        s.bufA[to] + MACHINES.turret.shotsPerPlate > MACHINES.turret.ammoCap
      )
        return false;
      s.bufA[to] += MACHINES.turret.shotsPerPlate;
      return true;
    default:
      return false;
  }
}

/** `from` tile'ının önündeki komşu tile; dünya dışıysa -1. */
export function front(s: FactoryState, from: number, direction: number): number {
  const y = (from / s.width) | 0;
  const x = from - y * s.width;
  const nx = x + DX[direction];
  const ny = y + DY[direction];
  return nx < 0 || ny < 0 || nx >= s.width || ny >= s.height ? -1 : ny * s.width + nx;
}

/**
 * Banda eşya ekler. Kafa kafaya gelen bant kabul edilmez; arkadan girenler
 * başa, yandan girenler ortaya yerleşir. Komşu eşyalarla aralık korunur.
 */
export function insertOnBelt(
  s: FactoryState,
  to: number,
  item: number,
  direction: number,
): boolean {
  const target = s.rot[to];
  if (((direction + 2) & 3) === target) return false;
  const count = s.beltCount[to];
  if (count >= BELT.slots) return false;
  const position = direction === target ? 0 : BELT.sidePosition;
  const base = to * BELT.slots;
  let index = 0;
  while (index < count && s.beltPos[base + index] > position) index++;
  if (index > 0 && s.beltPos[base + index - 1] - position < BELT.spacing) return false;
  if (index < count && position - s.beltPos[base + index] < BELT.spacing) return false;
  for (let slot = count; slot > index; slot--) {
    s.beltPos[base + slot] = s.beltPos[base + slot - 1];
    s.beltItem[base + slot] = s.beltItem[base + slot - 1];
  }
  s.beltPos[base + index] = position;
  s.beltItem[base + index] = item;
  s.beltCount[to] = count + 1;
  return true;
}

/** Bant tile'ının eşyalarını ilerletir ve öndekini bir sonraki tile'a aktarmayı dener. */
export function stepBelts(s: FactoryState): void {
  s.chunkItems.fill(0);
  const last = BELT.length - 1;
  for (let entry = 0; entry < s.beltListLength; entry++) {
    const tile = s.beltList[entry];
    const count = s.beltCount[tile];
    if (count === 0) continue;
    const base = tile * BELT.slots;
    let limit = last;
    for (let slot = 0; slot < count; slot++) {
      const before = s.beltPos[base + slot];
      let next = before + BELT.speed;
      if (next > limit) next = limit;
      if (next < before) next = before;
      s.beltPos[base + slot] = next;
      limit = next - BELT.spacing;
    }
    let remaining = count;
    if (s.beltPos[base] >= last) {
      const destination = front(s, tile, s.rot[tile]);
      if (destination >= 0 && offer(s, destination, s.beltItem[base], s.rot[tile])) {
        for (let slot = 1; slot < count; slot++) {
          s.beltPos[base + slot - 1] = s.beltPos[base + slot];
          s.beltItem[base + slot - 1] = s.beltItem[base + slot];
        }
        remaining = count - 1;
        s.beltCount[tile] = remaining;
      }
    }
    s.chunkItems[s.chunkOfTile[tile]] += remaining;
  }
}

/** Matkap ve işleyiciler; taret ateşi birim adımıyla birlikte `units.ts`tedir. */
export function stepMachines(s: FactoryState): void {
  for (let entry = 0; entry < s.machineListLength; entry++) {
    const tile = s.machineList[entry];
    const kind = s.kind[tile];
    if (kind === KIND.drill) {
      if (s.timer[tile] < MACHINES.drillPeriod) s.timer[tile]++;
      if (s.timer[tile] >= MACHINES.drillPeriod) {
        const destination = front(s, tile, s.rot[tile]);
        if (destination >= 0 && offer(s, destination, ITEM.ore, s.rot[tile])) s.timer[tile] = 0;
      }
    } else if (kind === KIND.smelter) {
      if (s.bufOut[tile] > 0) {
        const destination = front(s, tile, s.rot[tile]);
        if (destination >= 0 && offer(s, destination, ITEM.plate, s.rot[tile])) s.bufOut[tile]--;
      }
      if (s.bufA[tile] >= MACHINES.smelterInput && s.bufOut[tile] < MACHINES.smelterOutputBuffer) {
        s.timer[tile]++;
        if (s.timer[tile] >= MACHINES.smelterPeriod) {
          s.bufA[tile] -= MACHINES.smelterInput;
          s.bufOut[tile]++;
          s.timer[tile] = 0;
        }
      }
    }
  }
}
