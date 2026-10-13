import { PALETTE } from '@/config/game';
import { BUILDING, KIND, WORLD, type Kind } from '@/config/factory';
import type { FactoryState } from '@/sim/state';

/** Hasar bu orandan aşağıdaki yapının üstüne kırmızı örtü çizilir. */
const DAMAGE_RATIO = 0.5;

/** Ok ucu üçgeninin tile'a oranı. */
function arrow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rot: number, size: number) {
  const dx = [1, 0, -1, 0][rot & 3];
  const dy = [0, 1, 0, -1][rot & 3];
  const px = -dy;
  const py = dx;
  ctx.beginPath();
  ctx.moveTo(cx + dx * size, cy + dy * size);
  ctx.lineTo(cx - dx * size * 0.7 + px * size * 0.8, cy - dy * size * 0.7 + py * size * 0.8);
  ctx.lineTo(cx - dx * size * 0.7 - px * size * 0.8, cy - dy * size * 0.7 - py * size * 0.8);
  ctx.closePath();
  ctx.fill();
}

/**
 * Bir chunk'ın durağan katmanını (zemin, cevher, yapılar) 2B tuvale çizer. Yalnız durumdan okur ve
 * tuval bağlamına yazar: Phaser'dan bağımsızdır, sürüm değişmedikçe yeniden çağrılmaz.
 */
export function drawChunk(
  ctx: CanvasRenderingContext2D,
  s: FactoryState,
  chunk: number,
  tilePx: number,
): void {
  const chunksX = s.chunksX;
  const originX = (chunk % chunksX) * WORLD.chunk;
  const originY = Math.floor(chunk / chunksX) * WORLD.chunk;
  const half = tilePx / 2;
  for (let ly = 0; ly < WORLD.chunk; ly++) {
    for (let lx = 0; lx < WORLD.chunk; lx++) {
      const x = originX + lx;
      const y = originY + ly;
      const tile = y * s.width + x;
      const px = lx * tilePx;
      const py = ly * tilePx;
      const checker = (x + y) & 1;
      ctx.fillStyle = s.ore[tile]
        ? checker
          ? PALETTE.oreAlt
          : PALETTE.ore
        : checker
          ? PALETTE.groundAlt
          : PALETTE.ground;
      ctx.fillRect(px, py, tilePx, tilePx);
      const kind = s.kind[tile];
      if (kind === KIND.empty) continue;
      const inset = Math.max(1, Math.round(tilePx / 8));
      switch (kind) {
        case KIND.conveyor:
          ctx.fillStyle = PALETTE.conveyorEdge;
          ctx.fillRect(px + inset, py + inset, tilePx - inset * 2, tilePx - inset * 2);
          ctx.fillStyle = PALETTE.conveyor;
          ctx.fillRect(
            px + inset + 1,
            py + inset + 1,
            tilePx - inset * 2 - 2,
            tilePx - inset * 2 - 2,
          );
          ctx.fillStyle = PALETTE.arrow;
          arrow(ctx, px + half, py + half, s.rot[tile], tilePx * 0.26);
          break;
        case KIND.drill:
          ctx.fillStyle = PALETTE.drill;
          ctx.fillRect(px + inset, py + inset, tilePx - inset * 2, tilePx - inset * 2);
          ctx.fillStyle = PALETTE.drillCore;
          ctx.fillRect(px + half - 2, py + half - 2, 4, 4);
          break;
        case KIND.smelter:
          ctx.fillStyle = PALETTE.smelter;
          ctx.fillRect(px + inset, py + inset, tilePx - inset * 2, tilePx - inset * 2);
          ctx.fillStyle = PALETTE.smelterGlow;
          ctx.fillRect(px + half - 2, py + inset + 1, 4, tilePx - inset * 2 - 2);
          break;
        case KIND.core:
          ctx.fillStyle = PALETTE.core;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.strokeStyle = PALETTE.coreRim;
          ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
          break;
        case KIND.turret:
          ctx.fillStyle = PALETTE.turret;
          ctx.beginPath();
          ctx.arc(px + half, py + half, half - inset, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.turretBarrel;
          ctx.fillRect(px + half - 1, py + inset, 2, half);
          break;
        case KIND.wall:
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(px, py, tilePx, tilePx);
          ctx.strokeStyle = PALETTE.wallEdge;
          ctx.strokeRect(px + 0.5, py + 0.5, tilePx - 1, tilePx - 1);
          break;
        default:
          break;
      }
      if (kind !== KIND.core) {
        const max = BUILDING[kind as Exclude<Kind, 0>].hp;
        if (s.hp[tile] < max * DAMAGE_RATIO) {
          ctx.fillStyle = PALETTE.damage;
          ctx.fillRect(px, py, tilePx, tilePx);
        }
      }
    }
  }
}
