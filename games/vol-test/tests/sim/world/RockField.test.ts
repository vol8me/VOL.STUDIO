import { describe, expect, it } from 'vitest';
import type { Wall } from '@volstudio/core/physics';
import { LAKE_SPECS } from '@/config/lakes';
import { OUTCROP_SPECS, ROCKS } from '@/config/rocks';
import { WAR } from '@/config/war';
import { WORLD } from '@/config/world';
import { spawnCandidates } from '@/sim/war/Deployment';
import { LakeField } from '@/sim/world/LakeField';
import { RockField } from '@/sim/world/RockField';
import { createBattleWorld } from '@/sim/world/battleWorld';
import { World } from '@/sim/world/World';

const field = new RockField(WORLD.width, WORLD.height, OUTCROP_SPECS);

describe('RockField', () => {
  it('aynı tablodan aynı lobları kurar ve dünyanın merkezine göre nokta simetriktir', () => {
    const again = new RockField(WORLD.width, WORLD.height, OUTCROP_SPECS);
    expect(again.rocks).toEqual(field.rocks);
    expect(field.outcrops).toHaveLength(OUTCROP_SPECS.length);
    for (let index = 0; index < field.outcrops.length; index += 2) {
      const near = field.outcrops[index];
      const far = field.outcrops[index + 1];
      expect(far.x).toBeCloseTo(WORLD.width - near.x, 6);
      expect(far.y).toBeCloseTo(WORLD.height - near.y, 6);
      expect(far.rocks).toHaveLength(near.rocks.length);
    }
  });

  it('dünya kayasızsa boştur ve hiçbir sorguya tepki vermez', () => {
    const empty = new RockField(WORLD.width, WORLD.height);
    expect(empty.isEmpty).toBe(true);
    expect(empty.heightAt(100, 100)).toBe(0);
    expect(empty.covers(100, 100)).toBe(false);
    expect(empty.segmentHit(0, 0, 100, 100)).toBe(-1);
    expect(empty.nearest(5, 5, { x: 0, y: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(() => new RockField(0, 100)).toThrow(RangeError);
  });

  it('her kaya dünyanın içinde, göllerin dışında ve üslerden, bölge merkezlerinden uzaktadır', () => {
    const lakes = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);
    const edge = ROCKS.edgeMargin;
    for (const rock of field.rocks) {
      expect(rock.x - rock.radius).toBeGreaterThan(edge);
      expect(rock.y - rock.radius).toBeGreaterThan(edge);
      expect(rock.x + rock.radius).toBeLessThan(WORLD.width - edge);
      expect(rock.y + rock.radius).toBeLessThan(WORLD.height - edge);
      // Lobun çevresi göl şeridine girmez: merkez ve dört yönde kıyıdan uzak.
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        expect(lakes.depthAt(rock.x + dx * rock.radius, rock.y + dy * rock.radius)).toBe(0);
      for (const base of WAR.bases)
        expect(
          Math.hypot(rock.x - base.x * WORLD.width, rock.y - base.y * WORLD.height),
        ).toBeGreaterThan(base.radius + rock.radius);
      for (const zone of WAR.zones)
        expect(
          Math.hypot(rock.x - zone.x * WORLD.width, rock.y - zone.y * WORLD.height),
        ).toBeGreaterThan(rock.radius + 60);
    }
  });

  it('hiçbir doğma adayı kayanın içinde ya da dibinde değildir', () => {
    for (let faction = 0; faction < WAR.factions; faction++)
      for (const point of spawnCandidates({ width: WORLD.width, height: WORLD.height }, faction))
        expect(field.covers(point.x, point.y, 80)).toBe(false);
  });

  it('yükseklik profili kenarda sıfır, tepede yüksekliktir; kaya dışında 0', () => {
    const rock = field.rocks[0];
    expect(field.heightAt(rock.x, rock.y)).toBeGreaterThan(0);
    expect(field.heightAt(rock.x + rock.radius * 1.02, rock.y + rock.radius * 0.4)).toBeLessThan(
      field.heightAt(rock.x, rock.y),
    );
    expect(field.heightAt(1, 1)).toBe(0);
    // Yükseklik kenardan içeri doğru azalmaz.
    let previous = 0;
    for (let at = 0; at <= 1; at += 0.05) {
      const height = field.heightAt(rock.x + rock.radius * (1 - at) * 0.999, rock.y);
      expect(height).toBeGreaterThanOrEqual(previous - 0.35);
      previous = Math.max(previous, height);
    }
  });

  it('gövde kayaya girince kayadan gövdeye bakan teğet duvar üretir', () => {
    const rock = field.rocks[0];
    const reach = rock.radius * ROCKS.collisionInset;
    const walls: Wall[] = [];
    // Kayanın doğusunda, kenarına 5 birim girmiş bir gövde (yarı boy 30, yarı en 14).
    const x = rock.x + reach + 30 - 5;
    const count = field.contactWalls(x, rock.y, 0, 30, 14, walls);
    expect(count).toBeGreaterThanOrEqual(1);
    const wall = walls[walls.length - count];
    expect(Math.hypot(wall.nx, wall.ny)).toBeCloseTo(1, 10);
    expect(wall.nx).toBeGreaterThan(0.99);
    // Gövdenin kayaya en yakın köşesi duvarın ardında, derinlik 5 birimdir.
    const nearX = x - 30;
    expect(nearX * wall.nx + rock.y * wall.ny - wall.offset).toBeCloseTo(-5, 6);
  });

  it('uzaktaki gövde ve içine girmeyen gövde için duvar üretmez', () => {
    const outcrop = field.outcrops[0];
    const walls: Wall[] = [];
    expect(field.contactWalls(1, 1, 0, 30, 14, walls)).toBe(0);
    // Öbeğin menzilinin hemen dışında, gövde boyu kadar uzakta.
    const clear = outcrop.x + outcrop.reach + 40;
    expect(field.contactWalls(clear, outcrop.y, 0, 30, 14, walls)).toBe(0);
    expect(walls).toHaveLength(0);
  });

  it('kayanın tam ortasındaki gövde de dışarı itilir (merkez kutunun içinde)', () => {
    const rock = field.rocks[0];
    const walls: Wall[] = [];
    const count = field.contactWalls(rock.x + 1, rock.y, 0.3, 30, 14, walls);
    expect(count).toBeGreaterThanOrEqual(1);
    for (const wall of walls) expect(Number.isFinite(wall.offset)).toBe(true);
  });

  it('parça kayaya ilk girdiği yerde kesilir; dışından geçen ve yukarıdan aşan parça kesilmez', () => {
    const rock = field.rocks[0];
    const r = rock.radius * ROCKS.collisionInset;
    const t = field.segmentHit(rock.x - r - 100, rock.y, rock.x + r + 100, rock.y, 0);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.5);
    const above = rock.height * ROCKS.coverHeight + 5;
    expect(field.segmentHit(rock.x - r - 100, rock.y, rock.x + r + 100, rock.y, above)).toBe(-1);
    expect(
      field.segmentHit(rock.x - r - 100, rock.y - r * 4, rock.x + r + 100, rock.y - r * 4, 0),
    ).toBe(-1);
    // Başlangıç kayanın içindeyse tam o noktada durur.
    expect(field.segmentHit(rock.x, rock.y, rock.x + r * 3, rock.y, 0)).toBe(0);
  });

  it('kayada duran atıcının mermisi kendi kayasına çarpmaz: yüzeyin üstünden başlar, altından başlayan durur', () => {
    const rock = field.rocks[0];
    const surface = field.heightAt(rock.x, rock.y) * ROCKS.coverHeight;
    expect(surface).toBeGreaterThan(0);
    const r = rock.radius * ROCKS.collisionInset;
    // Merkezden dışarı yatay atış, yüzeyin biraz üstünden: kayayı yok sayar ve dışarı çıkar.
    expect(field.segmentHit(rock.x, rock.y, rock.x + r * 2, rock.y, surface + 3)).toBe(-1);
    // Yüzeyin altından başlayan (gömülü) parça aynı noktada durur.
    expect(field.segmentHit(rock.x, rock.y, rock.x + r * 2, rock.y, surface * 0.5)).toBe(0);
  });

  it('en yakın kaya: yüzeye uzaklık ve kayadan uzağa bakan yön', () => {
    const rock = field.rocks[0];
    const out = { x: 0, y: 0 };
    const distance = field.nearest(rock.x + rock.radius + 40, rock.y, out);
    expect(distance).toBeLessThanOrEqual(40.0001);
    expect(distance).toBeGreaterThan(-rock.radius);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 6);
  });

  it('savaş dünyası kayaları kurar; kayasız dünya ve küçük dünya geçerlidir', () => {
    expect(createBattleWorld().rocks.rocks.length).toBe(field.rocks.length);
    expect(new World(2048, 2048, 128).rocks.isEmpty).toBe(true);
    const small = new RockField(WORLD.width / 4, WORLD.height / 4, OUTCROP_SPECS);
    for (let index = 0; index < small.rocks.length; index++)
      expect(small.rocks[index].radius).toBeCloseTo(field.rocks[index].radius / 4, 6);
  });
});
