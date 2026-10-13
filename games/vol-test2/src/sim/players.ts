import type { SpatialIndex } from '@volstudio/core/spatial';
import { DIR_VECTORS, PLAYER } from '@/config/factory';
import { circleHitsBlocked, moveCircle, type MovedPosition } from './playerMove';
import { SHOT_SOURCE, type Shot } from './shot';
import { isSolid } from './solid';
import { PLAYER_STATUS, type FactoryState, type Unit } from './state';

/** Engel: dünya dışı ve katı bina tile'ları. */
export function blockedTile(s: FactoryState, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= s.width || tileY >= s.height) return true;
  return isSolid(s.kind[tileY * s.width + tileX]);
}

/**
 * Doğuş noktası: çekirdek merkezinden `spawnRing` uzaklıktaki halkada, yuvaya göre kaydırılmış yönden
 * başlayıp ilk boş nokta; halka doluysa yarıçap birer tile büyür. Yalnız durumdan türer (deterministik).
 */
export function spawnPoint(s: FactoryState, slot: number): MovedPosition {
  const core = s.coreCenter;
  const blocked = (tx: number, ty: number): boolean => blockedTile(s, tx, ty);
  for (let ring = 0; ring < 24; ring++) {
    const radius = PLAYER.spawnRing + ring;
    for (let step = 0; step < DIR_VECTORS.length; step++) {
      const [vx, vy] = DIR_VECTORS[(slot * 5 + step) % DIR_VECTORS.length];
      const x = core.x + vx * radius;
      const y = core.y + vy * radius;
      if (x < 1 || y < 1 || x > s.width - 1 || y > s.height - 1) continue;
      if (!circleHitsBlocked(blocked, x, y, PLAYER.radius)) return { x, y };
    }
  }
  return { x: core.x, y: core.y + PLAYER.spawnRing };
}

function resetSlot(s: FactoryState, slot: number, key: string | null): void {
  const p = s.players;
  p.keys[slot] = key;
  p.dir[slot] = 0;
  p.moveUntil[slot] = 0;
  p.cooldown[slot] = 0;
  p.respawnAt[slot] = 0;
  p.aimX[slot] = 1;
  p.aimY[slot] = 0;
}

function placeAtSpawn(s: FactoryState, slot: number): void {
  const p = s.players;
  const at = spawnPoint(s, slot);
  p.x[slot] = at.x;
  p.y[slot] = at.y;
  p.hp[slot] = PLAYER.hp;
  p.status[slot] = PLAYER_STATUS.alive;
}

/**
 * Anahtara yuva verir ve tankı doğurur. Anahtar zaten yuvadaysa bir şey değişmez (yeniden bağlanma,
 * yeniden eşitleme): `changed` false. Yuva kalmadıysa `slot` -1 olur.
 */
export function joinPlayer(s: FactoryState, key: string): { slot: number; changed: boolean } {
  const existing = s.players.slotOf(key);
  if (existing >= 0) return { slot: existing, changed: false };
  const slot = s.players.lowestFree();
  if (slot < 0) return { slot: -1, changed: false };
  resetSlot(s, slot, key);
  placeAtSpawn(s, slot);
  return { slot, changed: true };
}

/** Yuvayı boşaltır (tank dünyadan kalkar). Yuva zaten boşsa false. */
export function leavePlayerSlot(s: FactoryState, slot: number): boolean {
  const p = s.players;
  if (slot < 0 || slot >= PLAYER.slots || p.status[slot] === PLAYER_STATUS.free) return false;
  p.status[slot] = PLAYER_STATUS.free;
  p.x[slot] = 0;
  p.y[slot] = 0;
  p.hp[slot] = 0;
  resetSlot(s, slot, null);
  return true;
}

/** Oyuncuya hasar: canı biterse ölür ve doğuşu planlanır. */
export function damagePlayer(s: FactoryState, slot: number, amount: number): void {
  const p = s.players;
  if (p.status[slot] !== PLAYER_STATUS.alive) return;
  const remaining = p.hp[slot] - amount;
  if (remaining > 0) {
    p.hp[slot] = remaining;
    return;
  }
  p.hp[slot] = 0;
  p.status[slot] = PLAYER_STATUS.dead;
  p.dir[slot] = 0;
  p.moveUntil[slot] = 0;
  p.respawnAt[slot] = s.tick + PLAYER.respawnTicks;
}

const candidates: Unit[] = [];
const moved: MovedPosition = { x: 0, y: 0 };

/**
 * Oyuncuların bir adımı: doğuş, hareket (niyet süresi içinde), otomatik ateş. Yuva sırasıyla koşar
 * (sıra durumun parçasıdır). Ateş en yakın canlı birimedir; eşit uzaklıkta düşük yuva kazanır.
 */
export function playerStep(s: FactoryState, index: SpatialIndex<Unit>, shots: Shot[]): void {
  const p = s.players;
  const blocked = (tx: number, ty: number): boolean => blockedTile(s, tx, ty);
  for (let slot = 0; slot < PLAYER.slots; slot++) {
    const status = p.status[slot];
    if (status === PLAYER_STATUS.free) continue;
    if (status === PLAYER_STATUS.dead) {
      if (s.tick >= p.respawnAt[slot]) placeAtSpawn(s, slot);
      continue;
    }

    const direction = p.dir[slot];
    if (direction !== 0 && s.tick >= p.moveUntil[slot]) p.dir[slot] = 0;
    if (p.dir[slot] !== 0) {
      const [vx, vy] = DIR_VECTORS[p.dir[slot] - 1];
      moveCircle(
        blocked,
        p.x[slot],
        p.y[slot],
        vx * PLAYER.speed,
        vy * PLAYER.speed,
        PLAYER.radius,
        moved,
      );
      p.x[slot] = moved.x;
      p.y[slot] = moved.y;
    }

    if (p.cooldown[slot] > 0) p.cooldown[slot]--;
    const px = p.x[slot];
    const py = p.y[slot];
    index.queryRadiusInto(candidates, px, py, PLAYER.gun.range);
    let target: Unit | null = null;
    let best = Infinity;
    for (const candidate of candidates) {
      if (!candidate.alive) continue;
      const ex = candidate.x - px;
      const ey = candidate.y - py;
      const distance = ex * ex + ey * ey;
      if (distance > PLAYER.gun.range * PLAYER.gun.range) continue;
      if (
        distance < best ||
        (distance === best && target !== null && candidate.slot < target.slot)
      ) {
        best = distance;
        target = candidate;
      }
    }
    if (target === null) {
      // Hedef yokken taret gidiş yönüne bakar; duruyorsa son yönünü korur.
      if (p.dir[slot] !== 0) {
        const [vx, vy] = DIR_VECTORS[p.dir[slot] - 1];
        p.aimX[slot] = vx;
        p.aimY[slot] = vy;
      }
      continue;
    }
    const length = Math.sqrt(best);
    if (length > 0) {
      p.aimX[slot] = (target.x - px) / length;
      p.aimY[slot] = (target.y - py) / length;
    }
    if (p.cooldown[slot] > 0) continue;
    target.hp -= PLAYER.gun.damage;
    p.cooldown[slot] = PLAYER.gun.cooldown;
    shots.push({
      tile: -1,
      fromX: px,
      fromY: py,
      targetX: target.x,
      targetY: target.y,
      source: SHOT_SOURCE.player,
    });
    if (target.hp <= 0) s.releaseUnit(target);
  }
}
