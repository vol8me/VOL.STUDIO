import { describe, expect, it } from 'vitest';
import { SHOT_LOOK } from '@/config/fx';
import { WEAPON_STYLES } from '@/config/tank';
import { Projectiles } from '@/sim/combat/Projectiles';
import { TracerLayer } from '@/view/effects/TracerLayer';

/** Çizim çağrılarını kaydeden Graphics yerine geçer. */
function recorder() {
  const colours: number[] = [];
  const widths: number[] = [];
  const graphics = {
    setDepth: () => graphics,
    clear: () => graphics,
    fillStyle: (color: number) => colours.push(color),
    fillCircle: () => graphics,
    lineStyle: (width: number, color: number) => {
      widths.push(width);
      colours.push(color);
    },
    lineBetween: () => graphics,
    destroy: () => undefined,
  };
  return { graphics, colours, widths };
}

function drawStyle(styleIndex: number) {
  const { graphics, colours, widths } = recorder();
  const layer = new TracerLayer({ add: { graphics: () => graphics } } as never);
  const projectiles = new Projectiles(4, 1000);
  const profile = projectiles.addProfile(1000, undefined, styleIndex);
  projectiles.spawn(1, 0, 0, 300, 0, profile);
  layer.draw(projectiles, 1);
  return { colours, widths };
}

describe('TracerLayer: silah başına mermi görünümü', () => {
  it('her stil kendi parıltı ve çekirdek rengiyle çizilir', () => {
    WEAPON_STYLES.forEach((style, index) => {
      const { colours } = drawStyle(index);
      expect(colours, style).toContain(SHOT_LOOK[style].glow);
      expect(colours, style).toContain(SHOT_LOOK[style].hot);
    });
  });

  it('ağır mermi ince raydan kalın çizilir', () => {
    const slug = drawStyle(WEAPON_STYLES.indexOf('slug'));
    const rail = drawStyle(WEAPON_STYLES.indexOf('rail'));
    expect(Math.max(...slug.widths)).toBeGreaterThan(Math.max(...rail.widths));
  });
});
