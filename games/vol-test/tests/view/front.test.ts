import { describe, expect, it } from 'vitest';
import { WAR } from '@/config/war';
import { WORLD } from '@/config/world';
import { baseCenter } from '@/sim/war/Deployment';
import { NO_OWNER } from '@/sim/war/Zones';
import { createFront } from '@/view/front';

describe('createFront', () => {
  it('bölge geometrisini sunucunun kullandığı hesaptan türetir', () => {
    const front = createFront(WORLD);
    expect(front.zones).toHaveLength(WAR.zones.length);
    front.zones.forEach((zone, index) => {
      const spec = WAR.zones[index];
      expect(zone).toMatchObject({
        index,
        id: spec.id,
        x: spec.x * WORLD.width,
        y: spec.y * WORLD.height,
        radius: spec.radius,
      });
    });
  });

  it('bölgeler tarafsız ve ilerlemesiz başlar', () => {
    for (const zone of createFront(WORLD).zones) {
      expect(zone.owner).toBe(NO_OWNER);
      expect(zone.progress).toBe(0);
      expect(zone.contested).toBe(false);
    }
  });

  it('üsler cephe sırasıyla ve doğma merkeziyle aynı yerdedir', () => {
    const front = createFront(WORLD);
    expect(front.bases).toHaveLength(WAR.factions);
    front.bases.forEach((base, faction) => {
      expect(base).toMatchObject({ faction, ...baseCenter(WORLD, faction) });
      expect(base.radius).toBe(WAR.bases[faction].radius);
    });
  });

  it('dünya ölçüsü değişince düzen oranını korur', () => {
    const half = createFront({ width: WORLD.width / 2, height: WORLD.height / 2 });
    const full = createFront(WORLD);
    half.zones.forEach((zone, index) => {
      expect(zone.x * 2).toBeCloseTo(full.zones[index].x, 6);
      expect(zone.y * 2).toBeCloseTo(full.zones[index].y, 6);
    });
  });
});
