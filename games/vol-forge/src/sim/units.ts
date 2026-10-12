import type { SpatialIndex } from '@volstudio/core/spatial';
import {
  FLOW_RECOMPUTE_MIN_TICKS,
  ITEM,
  KIND,
  MACHINES,
  SUPPLY,
  UNIT,
  UNIT_KIND,
  WAVES,
  WORLD,
} from '@/config/forge';
import { DX, DY, type ForgeState, type Unit } from './state';

/** Taret ateşi: kaynak tile ve hedef konum (tile uzayı). Bir adım için geçerlidir. */
export interface Shot {
  tile: number;
  targetX: number;
  targetY: number;
}

const specOf = (kind: number) => (kind === UNIT_KIND.brute ? UNIT.brute : UNIT.crawler);

/** Katı bina birim yolunu keser; bant ve boş tile'lar geçilebilirdir. */
export function isSolid(kind: number): boolean {
  return (
    kind === KIND.drill ||
    kind === KIND.smelter ||
    kind === KIND.turret ||
    kind === KIND.wall ||
    kind === KIND.core
  );
}

/**
 * Çekirdekten geriye 4 komşuluklu genişlik öncelikli tarama. Maliyetler eşit
 * olduğundan Dijkstra'nın sonucunu verir; CORE `FlowField`i hücre başına
 * nesne ayırdığından 65 bin hücrede bu yol seçildi (ölçüm: docs/backend-research.md).
 */
export class FlowSolver {
  private readonly queue: Int32Array;

  constructor(private readonly state: ForgeState) {
    this.queue = new Int32Array(state.count);
  }

  /** Hedefe yönelik hareket yönü (0-3) `flowDir`e yazılır; ulaşılamayan -1 kalır. */
  compute(): void {
    const s = this.state;
    const queue = this.queue;
    s.flowDir.fill(-1);
    let head = 0;
    let tail = 0;
    const seen = this.seen(s);
    const origin = s.coreOrigin;
    for (let dy = 0; dy < WORLD.coreSize; dy++)
      for (let dx = 0; dx < WORLD.coreSize; dx++) {
        const tile = s.index(origin.x + dx, origin.y + dy);
        seen[tile] = 1;
        queue[tail++] = tile;
      }
    while (head < tail) {
      const tile = queue[head++];
      const y = (tile / s.width) | 0;
      const x = tile - y * s.width;
      for (let direction = 0; direction < 4; direction++) {
        const nx = x + DX[direction];
        const ny = y + DY[direction];
        if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
        const next = ny * s.width + nx;
        if (seen[next] === 1 || isSolid(s.kind[next])) continue;
        seen[next] = 1;
        // `next`ten `tile`a gitmek için hareket yönü `direction`ın tersidir.
        s.flowDir[next] = (direction + 2) & 3;
        queue[tail++] = next;
      }
    }
    s.flowTick = s.tick;
    s.flowDirty = false;
  }

  private seenBuffer: Uint8Array | null = null;
  private seen(s: ForgeState): Uint8Array {
    if (!this.seenBuffer || this.seenBuffer.length !== s.count)
      this.seenBuffer = new Uint8Array(s.count);
    else this.seenBuffer.fill(0);
    return this.seenBuffer;
  }
}

/** Bir sonraki ölçülü dalga sayısı ve konumları deterministik rastgeleden gelir. */
export interface Spawner {
  next(): number;
}

function edgePosition(s: ForgeState, random: Spawner): { x: number; y: number } {
  const side = Math.floor(random.next() * 4);
  const along = 2 + random.next() * ((side & 1 ? s.height : s.width) - 4);
  const inset = 1 + random.next() * 2;
  if (side === 0) return { x: inset, y: along };
  if (side === 1) return { x: along, y: inset };
  if (side === 2) return { x: s.width - inset, y: along };
  return { x: along, y: s.height - inset };
}

export function spawnUnit(s: ForgeState, kind: number, random: Spawner): Unit | null {
  const at = edgePosition(s, random);
  return s.allocateUnit(kind, at.x, at.y, specOf(kind).hp);
}

/** Dalga zamanı geldiyse birimleri doğurur. */
export function spawnWave(s: ForgeState, random: Spawner): void {
  if (s.tick < s.nextWaveTick) return;
  const total = WAVES.baseCount + WAVES.perWave * s.wave;
  const brutes = (s.wave + 1) % WAVES.bruteEvery === 0 ? Math.floor(total / 4) : 0;
  for (let index = 0; index < total; index++)
    spawnUnit(s, index < brutes ? UNIT_KIND.brute : UNIT_KIND.crawler, random);
  s.wave++;
  s.nextWaveTick = s.tick + WAVES.period;
}

/** Birim sayısı `target`ın altındaysa eksik kadarını (adım başına sınırlı) doğurur. */
export function sustainUnits(s: ForgeState, target: number, random: Spawner): void {
  const missing = Math.min(target - s.aliveUnits, 24);
  for (let index = 0; index < missing; index++)
    spawnUnit(s, random.next() < 0.1 ? UNIT_KIND.brute : UNIT_KIND.crawler, random);
}

export function damageBuilding(s: ForgeState, tile: number, amount: number): void {
  const kind = s.kind[tile];
  if (kind === KIND.core) {
    s.coreHp = Math.max(0, s.coreHp - amount);
    return;
  }
  if (kind === KIND.empty) return;
  const remaining = s.hp[tile] - amount;
  if (remaining > 0) {
    s.hp[tile] = remaining;
    s.touchHp(tile);
    return;
  }
  destroyBuilding(s, tile);
}

export function destroyBuilding(s: ForgeState, tile: number): void {
  const wasSolid = isSolid(s.kind[tile]);
  clearTile(s, tile);
  if (wasSolid) s.flowDirty = true;
}

/** Tile'ı boşaltır; bant üstündeki eşyalar yok olur. */
export function clearTile(s: ForgeState, tile: number): void {
  s.kind[tile] = KIND.empty;
  s.rot[tile] = 0;
  s.team[tile] = 0;
  s.hp[tile] = 0;
  s.timer[tile] = 0;
  s.bufA[tile] = 0;
  s.bufOut[tile] = 0;
  s.beltCount[tile] = 0;
  s.touchStructure(tile);
}

export function unitStep(s: ForgeState): void {
  const center = s.coreCenter;
  for (const unit of s.units) {
    if (!unit.alive) continue;
    const spec = specOf(unit.kind);
    const cx = Math.min(s.width - 1, Math.max(0, Math.floor(unit.x)));
    const cy = Math.min(s.height - 1, Math.max(0, Math.floor(unit.y)));
    const here = cy * s.width + cx;
    if (s.kind[here] === KIND.core) {
      s.coreHp = Math.max(0, s.coreHp - spec.coreDamage);
      s.releaseUnit(unit);
      continue;
    }

    const direction = s.flowDir[here];
    let tx: number;
    let ty: number;
    if (direction >= 0) {
      const nx = cx + DX[direction];
      const ny = cy + DY[direction];
      const next = ny * s.width + nx;
      if (s.kind[next] === KIND.core) {
        s.coreHp = Math.max(0, s.coreHp - spec.coreDamage);
        s.releaseUnit(unit);
        continue;
      }
      if (isSolid(s.kind[next])) {
        damageBuilding(s, next, spec.damage);
        continue;
      }
      tx = nx + 0.5;
      ty = ny + 0.5;
    } else {
      // Yol yok (kuşatılmış bölge): doğrudan çekirdeğe yönel, önüne çıkan katı binayı kır.
      tx = center.x;
      ty = center.y;
      const dx = tx - unit.x;
      const dy = ty - unit.y;
      const along = Math.abs(dx) > Math.abs(dy);
      const nx = cx + (along ? Math.sign(dx) : 0);
      const ny = cy + (along ? 0 : Math.sign(dy));
      if (nx >= 0 && ny >= 0 && nx < s.width && ny < s.height) {
        const next = ny * s.width + nx;
        if (isSolid(s.kind[next]) && s.kind[next] !== KIND.core) {
          damageBuilding(s, next, spec.damage);
          continue;
        }
      }
    }
    const dx = tx - unit.x;
    const dy = ty - unit.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-9) continue;
    const step = Math.min(spec.speed, distance);
    unit.x += (dx / distance) * step;
    unit.y += (dy / distance) * step;
  }
}

const candidates: Unit[] = [];

/**
 * Her taret menzilindeki en yakın canlı birime vurur. Eşit uzaklıkta düşük yuva kazanır:
 * hücre içi sıra geri yüklemede değişse de sonuç değişmez.
 */
export function turretStep(s: ForgeState, index: SpatialIndex<Unit>, shots: Shot[]): void {
  const core = s.coreCenter;
  const supplyRadiusSq = SUPPLY.radius * SUPPLY.radius;
  const supplying = s.tick % SUPPLY.period === 0;
  for (let entry = 0; entry < s.machineListLength; entry++) {
    const tile = s.machineList[entry];
    if (s.kind[tile] !== KIND.turret) continue;
    const y = (tile / s.width) | 0;
    const x = tile - y * s.width;
    if (
      supplying &&
      s.inventory[ITEM.plate] > 0 &&
      s.bufA[tile] + MACHINES.turret.shotsPerPlate <= MACHINES.turret.ammoCap
    ) {
      const dx = x + 0.5 - core.x;
      const dy = y + 0.5 - core.y;
      if (dx * dx + dy * dy <= supplyRadiusSq) {
        s.inventory[ITEM.plate]--;
        s.bufA[tile] += MACHINES.turret.shotsPerPlate;
      }
    }
    if (s.timer[tile] > 0) s.timer[tile]--;
    if (s.timer[tile] > 0 || s.bufA[tile] === 0) continue;
    index.queryRadiusInto(candidates, x + 0.5, y + 0.5, MACHINES.turret.range);
    let target: Unit | null = null;
    let best = Infinity;
    for (const candidate of candidates) {
      if (!candidate.alive) continue;
      const ex = candidate.x - (x + 0.5);
      const ey = candidate.y - (y + 0.5);
      const distance = ex * ex + ey * ey;
      if (
        distance < best ||
        (distance === best && target !== null && candidate.slot < target.slot)
      ) {
        best = distance;
        target = candidate;
      }
    }
    if (!target) continue;
    target.hp -= MACHINES.turret.damage;
    s.bufA[tile]--;
    s.timer[tile] = MACHINES.turret.cooldown;
    shots.push({ tile, targetX: target.x, targetY: target.y });
    if (target.hp <= 0) s.releaseUnit(target);
  }
}

/** Yol alanı eskidiyse ve bekleme süresi dolduysa yeniden hesaplanır. */
export function refreshFlow(s: ForgeState, solver: FlowSolver): void {
  if (!s.flowDirty) return;
  if (s.flowTick >= 0 && s.tick - s.flowTick < FLOW_RECOMPUTE_MIN_TICKS) return;
  solver.compute();
}
