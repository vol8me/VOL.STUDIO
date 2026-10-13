import { describe, expect, it } from 'vitest';
import { BUILDING, KIND, WORLD } from '../../src/config/forge';
import { PALETTE } from '../../src/config/game';
import { drawChunk } from '../../src/view/raster';
import { smallSim } from '../helpers/world';

/** Çizim çağrılarını kaydeden bağlam: hangi renkle kaç dikdörtgen çizildiği sınanır. */
function recordingContext() {
  const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      fills.push({ style: this.fillStyle, x, y, w, h });
    },
    strokeRect() {
      calls.push('strokeRect');
    },
    beginPath() {
      calls.push('beginPath');
    },
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {
      calls.push('arc');
    },
    fill() {
      calls.push('fill');
      fills.push({ style: this.fillStyle, x: 0, y: 0, w: 0, h: 0 });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills, calls };
}

const TILE = 16;

describe('drawChunk', () => {
  it('her tile için zemin çizer; boş tile başka çizim eklemez', () => {
    const sim = smallSim();
    const s = sim.state;
    s.ore.fill(0);
    s.kind.fill(KIND.empty);
    const { ctx, fills } = recordingContext();
    drawChunk(ctx, s, 0, TILE);
    expect(fills).toHaveLength(WORLD.chunk * WORLD.chunk);
    expect(new Set(fills.map((fill) => fill.style))).toEqual(
      new Set([PALETTE.ground, PALETTE.groundAlt]),
    );
  });

  it('cevher zemini ayrı renkle çizer', () => {
    const s = smallSim().state;
    s.ore.fill(0);
    s.kind.fill(KIND.empty);
    s.ore[0] = 1;
    const { ctx, fills } = recordingContext();
    drawChunk(ctx, s, 0, TILE);
    expect(fills[0].style).toBe(PALETTE.ore);
  });

  it('chunk içi koordinatları kullanır: ikinci chunk de tuvalin sol üstünden başlar', () => {
    const s = smallSim().state;
    s.kind.fill(KIND.empty);
    const { ctx, fills } = recordingContext();
    drawChunk(ctx, s, 1, TILE);
    expect(fills[0]).toMatchObject({ x: 0, y: 0, w: TILE, h: TILE });
  });

  it('bant, matkap, işleyici, taret ve duvar kendi renklerini çizer', () => {
    const s = smallSim().state;
    s.ore.fill(0);
    s.kind.fill(KIND.empty);
    const put = (x: number, kind: number) => {
      s.kind[x] = kind;
      s.hp[x] = BUILDING[kind as 1].hp;
    };
    put(0, KIND.conveyor);
    put(1, KIND.drill);
    put(2, KIND.smelter);
    put(3, KIND.turret);
    put(4, KIND.wall);
    const { ctx, fills, calls } = recordingContext();
    drawChunk(ctx, s, 0, TILE);
    const styles = new Set(fills.map((fill) => fill.style));
    for (const style of [
      PALETTE.conveyor,
      PALETTE.drill,
      PALETTE.smelter,
      PALETTE.turret,
      PALETTE.wall,
    ])
      expect(styles.has(style), style).toBe(true);
    expect(calls).toContain('arc');
  });

  it('çekirdeği çizer ve hasar örtüsü bindirmez', () => {
    const sim = smallSim();
    const s = sim.state;
    const origin = s.coreOrigin;
    const chunk = s.chunkOfTile[s.index(origin.x, origin.y)];
    const { ctx, fills } = recordingContext();
    drawChunk(ctx, s, chunk, TILE);
    expect(fills.some((fill) => fill.style === PALETTE.core)).toBe(true);
    expect(fills.some((fill) => fill.style === PALETTE.damage)).toBe(false);
  });

  it('yarıdan fazla hasar görmüş yapının üstüne örtü çizer, sağlam yapıya çizmez', () => {
    const s = smallSim().state;
    s.ore.fill(0);
    s.kind.fill(KIND.empty);
    s.kind[0] = KIND.wall;
    s.kind[1] = KIND.wall;
    s.hp[0] = 10;
    s.hp[1] = BUILDING[KIND.wall].hp;
    const { ctx, fills } = recordingContext();
    drawChunk(ctx, s, 0, TILE);
    const overlays = fills.filter((fill) => fill.style === PALETTE.damage);
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({ x: 0, y: 0 });
  });
});
