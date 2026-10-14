import { describe, expect, it } from 'vitest';
import { LAKE, LAKE_SPECS } from '@/config/lakes';
import { WAR } from '@/config/war';
import { WORLD } from '@/config/world';
import { LakeField, type LakeProbe } from '@/sim/world/LakeField';
import { createBattleWorld } from '@/sim/world/battleWorld';
import { World } from '@/sim/world/World';

const field = new LakeField(WORLD.width, WORLD.height, LAKE_SPECS);

describe('LakeField', () => {
  it('göllerin dışı kuru, merkezi tam derinliktedir; kıyıdan merkeze derinlik hiç azalmaz', () => {
    expect(field.lakes).toHaveLength(LAKE_SPECS.length);
    for (const lake of field.lakes) {
      expect(field.depthAt(lake.x, lake.y)).toBeCloseTo(1, 6);
      expect(field.depthAt(lake.x + lake.reach * 1.2, lake.y)).toBe(0);
      for (let step = 0; step < 16; step++) {
        const angle = (step / 16) * Math.PI * 2;
        let previous = 0;
        for (let along = 0; along <= 1; along += 0.02) {
          const depth = field.depthAt(
            lake.x + Math.cos(angle) * lake.reach * (1 - along),
            lake.y + Math.sin(angle) * lake.reach * (1 - along),
          );
          expect(depth).toBeGreaterThanOrEqual(previous - 1e-9);
          previous = depth;
        }
      }
    }
  });

  it('göller dünyanın merkezine göre nokta simetriktir: karşıt üsler aynı coğrafyayı görür', () => {
    const probe: LakeProbe = { lake: 0, depth: 0, s: 0 };
    for (let index = 0; index < 400; index++) {
      const x = ((index * 7919) % 1000) * (WORLD.width / 1000);
      const y = ((index * 104729) % 1000) * (WORLD.height / 1000);
      const here = field.depthAt(x, y);
      const there = field.depthAt(WORLD.width - x, WORLD.height - y);
      expect(there).toBeCloseTo(here, 9);
      field.probe(x, y, probe);
      expect(probe.depth).toBeCloseTo(here, 9);
    }
  });

  it('hiçbir göl bir üsse, bölge çemberine ya da dünya kenarına değmez', () => {
    const margin = 240;
    for (const lake of field.lakes) {
      expect(lake.x - lake.reach).toBeGreaterThan(0);
      expect(lake.y - lake.reach).toBeGreaterThan(0);
      expect(lake.x + lake.reach).toBeLessThan(WORLD.width);
      expect(lake.y + lake.reach).toBeLessThan(WORLD.height);
      for (const spot of [...WAR.bases, ...WAR.zones]) {
        const cx = spot.x * WORLD.width;
        const cy = spot.y * WORLD.height;
        // Çember çevresinde yoğun örnekleme: içeride ve kenarında su yok.
        for (let ray = 0; ray < 48; ray++) {
          const angle = (ray / 48) * Math.PI * 2;
          for (const radius of [0, spot.radius * 0.5, spot.radius, spot.radius + margin]) {
            const depth = field.depthAt(
              cx + Math.cos(angle) * radius,
              cy + Math.sin(angle) * radius,
            );
            expect(depth, `${lake.id} ${spot.x},${spot.y} r=${radius}`).toBe(0);
          }
        }
      }
    }
  });

  it('gradyan derinliğin arttığı yöne bakar ve karada sıfırdır', () => {
    const out = { x: 0, y: 0 };
    for (const lake of field.lakes) {
      const x = lake.x + lake.rx * 0.7;
      const y = lake.y;
      const here = field.depthAt(x, y);
      if (here <= 0 || here >= 1) continue;
      field.gradient(x, y, out);
      const ahead = field.depthAt(x + out.x * 40, y + out.y * 40);
      expect(ahead).toBeGreaterThan(here);
    }
    field.gradient(0, 0, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });

  it('kıyı çokgeni kıyı oranında 1 dir ve şerit dışarıdadır', () => {
    const lake = field.lakes[0];
    const shore = field.outline(lake);
    expect(shore).toHaveLength(LAKE.outlinePoints * 2);
    for (let index = 0; index < LAKE.outlinePoints; index++)
      expect(field.ratio(lake, shore[index * 2], shore[index * 2 + 1])).toBeCloseTo(1, 6);
    const bank = field.outline(lake, 1 + LAKE.bank);
    for (let index = 0; index < LAKE.outlinePoints; index++)
      expect(field.ratio(lake, bank[index * 2], bank[index * 2 + 1])).toBeGreaterThan(1.05);
  });

  it('küçük dünya gölleri oranla küçültür; kendini kesen şekil reddedilir', () => {
    const small = new LakeField(WORLD.width / 2, WORLD.height / 2, LAKE_SPECS);
    expect(small.lakes[0].rx).toBeCloseTo(field.lakes[0].rx / 2, 6);
    expect(
      () =>
        new LakeField(1000, 1000, [
          { id: 'x', x: 0.5, y: 0.5, rx: 100, ry: 100, rotation: 0, shape: [[2, 0.6, 0]] },
        ]),
    ).toThrow(RangeError);
    expect(() => new LakeField(0, 100)).toThrow(RangeError);
  });
});

describe('World göl alanı', () => {
  it('savaş dünyası sabit gölleri taşır; çıplak dünya karadır', () => {
    expect(createBattleWorld().lakes.lakes).toHaveLength(LAKE_SPECS.length);
    expect(new World(1000, 1000, 100).lakes.isEmpty).toBe(true);
  });
});
