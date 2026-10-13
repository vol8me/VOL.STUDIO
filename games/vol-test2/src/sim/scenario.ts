import { BELT, BUILDING, ITEM, KIND, WORLD, type Kind } from '@/config/factory';
import type { FactorySim } from './sim';
import type { FactoryState } from './state';

export interface CombOptions {
  /** En çok bu kadar konveyör kurulur (tavan; dünya sığdırdığı kadarını alır). */
  readonly maxBelts: number;
  /** Çekirdek çevresindeki taret halkası. */
  readonly turrets?: number;
  /** Her bant karesine konan eşya (0-4); doluluk ne kadar yüksekse adım o kadar pahalıdır. */
  readonly fill?: number;
  /** Her `smelterEvery`. satıra hat içi işleyici konur; 0 kapatır. */
  readonly smelterEvery?: number;
}

export interface CombReport {
  readonly belts: number;
  readonly drills: number;
  readonly smelters: number;
  readonly turrets: number;
  readonly items: number;
}

const ROW_SPACING = 3;
const RING_HALF = 7;

function put(s: FactoryState, x: number, y: number, kind: Kind, rot: number): number {
  const tile = s.index(x, y);
  s.kind[tile] = kind;
  s.rot[tile] = rot;
  s.team[tile] = 1;
  s.hp[tile] = BUILDING[kind as Exclude<Kind, 0>].hp;
  s.touchStructure(tile);
  return tile;
}

/**
 * "Tarak" fabrika: çekirdeğe inen iki dikey gövde ve onlara yandan bağlanan yatay satırlar.
 * Matkaplar cevher üstündeki satır kenarlarına, hat içi işleyiciler satır ortasına konur.
 * Yapı komutsuz kurulur (senaryo); deterministiktir ve aynı seçeneklerle aynı dünyayı verir.
 */
export function buildComb(sim: FactorySim, options: CombOptions): CombReport {
  const s = sim.state;
  const fill = Math.min(BELT.slots, Math.max(0, options.fill ?? 0));
  const core = s.coreOrigin;
  const trunk = Math.floor(s.coreCenter.x);
  let belts = 0;
  let drills = 0;
  let smelters = 0;
  let rowIndex = 0;

  const belt = (x: number, y: number, rot: number): void => {
    const tile = put(s, x, y, KIND.conveyor, rot);
    belts++;
    for (let slot = 0; slot < fill; slot++) {
      s.beltPos[tile * BELT.slots + slot] = BELT.length - 1 - slot * BELT.spacing;
      s.beltItem[tile * BELT.slots + slot] = ITEM.ore;
    }
    s.beltCount[tile] = fill;
  };

  // Gövde: kuzey yarıda güneye, güney yarıda kuzeye akar.
  for (let y = 0; y < core.y; y++) belt(trunk, y, 1);
  for (let y = core.y + WORLD.coreSize; y < s.height; y++) belt(trunk, y, 3);

  const rows: number[] = [];
  for (let k = 0; ; k++) {
    const north = core.y - 2 - ROW_SPACING * k;
    const south = core.y + WORLD.coreSize + 1 + ROW_SPACING * k;
    const hasNorth = north >= 1;
    const hasSouth = south <= s.height - 2;
    if (!hasNorth && !hasSouth) break;
    if (hasNorth) rows.push(north);
    if (hasSouth) rows.push(south);
  }

  for (const y of rows) {
    const arm = (from: number, to: number, rot: number): void => {
      const step = from < to ? 1 : -1;
      const smelterAt =
        options.smelterEvery && rowIndex % options.smelterEvery === 0
          ? from + step * Math.floor(Math.abs(to - from) / 2)
          : -1;
      for (let x = from; x !== to + step; x += step) {
        if (belts >= options.maxBelts && x !== smelterAt) return;
        if (x === smelterAt) {
          put(s, x, y, KIND.smelter, rot);
          smelters++;
        } else {
          belt(x, y, rot);
        }
        for (const [dy, facing] of [
          [-1, 1],
          [1, 3],
        ] as const) {
          const tile = s.index(x, y + dy);
          if (x === smelterAt || s.ore[tile] === 0 || s.kind[tile] !== KIND.empty) continue;
          put(s, x, y + dy, KIND.drill, facing);
          drills++;
        }
      }
    };
    arm(0, trunk - 1, 0);
    arm(s.width - 1, trunk + 1, 2);
    rowIndex++;
    if (belts >= options.maxBelts) break;
  }

  const turrets = placeRing(s, options.turrets ?? 0);
  s.listsDirty = true;
  s.flowDirty = true;
  s.rebuildLists();
  let items = 0;
  for (let tile = 0; tile < s.count; tile++) items += s.beltCount[tile];
  return { belts, drills, smelters, turrets, items };
}

/** Çekirdeği çevreleyen kare halkada boş karelere taret koyar; dolu kareyi atlar. */
function placeRing(s: FactoryState, wanted: number): number {
  if (wanted <= 0) return 0;
  const center = s.coreCenter;
  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const ring: number[] = [];
  for (let d = -RING_HALF; d <= RING_HALF; d++) ring.push(s.index(cx + d, cy - RING_HALF));
  for (let d = -RING_HALF + 1; d <= RING_HALF; d++) ring.push(s.index(cx + RING_HALF, cy + d));
  for (let d = RING_HALF - 1; d >= -RING_HALF; d--) ring.push(s.index(cx + d, cy + RING_HALF));
  for (let d = RING_HALF - 1; d > -RING_HALF; d--) ring.push(s.index(cx - RING_HALF, cy + d));
  const stride = Math.max(1, Math.floor(ring.length / wanted));
  let placed = 0;
  for (let at = 0; at < ring.length && placed < wanted; at += stride) {
    for (let probe = 0; probe < stride; probe++) {
      const tile = ring[(at + probe) % ring.length];
      if (s.kind[tile] !== KIND.empty) continue;
      const y = (tile / s.width) | 0;
      put(s, tile - y * s.width, y, KIND.turret, 0);
      placed++;
      break;
    }
  }
  return placed;
}
