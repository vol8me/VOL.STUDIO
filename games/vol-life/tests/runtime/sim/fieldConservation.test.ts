import { describe, expect, it } from 'vitest';
import { habitatConfig } from '@/config/habitat';
import { substrateConfig } from '@/config/substrate';
import { worldConfig } from '@/config/world';
import { FieldSet } from '@/runtime/sim/FieldSet';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createSimRandom } from '@/runtime/sim/rng';
import { createHabitatDomain, rasterizeHabitatMask } from '@/runtime/sim/WorldDomain';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

const STORAGE = worldConfig.boundsUnits;
const DIFFUSION = worldConfig.nutrientDiffusion;
const ROUNDS = 20;

/**
 * Tolerans FLOAT32 yuvarlamasından türetilir, deneyerek büyütülmez: her hücre
 * güncellemesi beş float32 değerin ağırlıklı toplamıdır ve sonuç float32'ye
 * yuvarlanır, yani hücre başına bağıl hata ≤ 2^-24. Tur başına toplam mutlak
 * hata ≤ toplam kütle × 2^-24; beş terimli toplama ve tur sayısı için 8 katlık
 * pay bırakılır.
 */
function conservationTolerance(totalMass: number, rounds: number): number {
  return totalMass * 2 ** -24 * 8 * rounds;
}

function sumHabitat(field: Float32Array, mask: Uint8Array): number {
  let total = 0;
  for (let index = 0; index < field.length; index++) {
    if (mask[index] === 1) total += field[index];
  }
  return total;
}

function seedRandomNutrient(fields: FieldSet, mask: Uint8Array, seed: number): void {
  const random = createSimRandom(seed);
  for (let index = 0; index < fields.length; index++) {
    fields.nutrient[index] = mask[index] === 1 ? random.next() : 0;
  }
}

function maskedFields(resolution: number, seed: number): { fields: FieldSet; mask: Uint8Array } {
  const domain = createHabitatDomain(STORAGE, habitatConfig, seed);
  const mask = rasterizeHabitatMask(domain, resolution);
  const fields = new FieldSet(resolution);
  fields.setMask(mask);
  seedRandomNutrient(fields, mask, seed);
  return { fields, mask };
}

describe('maskeli alan korunumu', () => {
  it.each([64, 256])(
    '%i² gerçek habitat maskesinde difüzyon habitat toplamını korur',
    (resolution) => {
      const { fields, mask } = maskedFields(resolution, 11);
      const before = sumHabitat(fields.nutrient, mask);
      expect(before).toBeGreaterThan(0);

      for (let round = 0; round < ROUNDS; round++) fields.diffuse('nutrient', DIFFUSION);

      const after = sumHabitat(fields.nutrient, mask);
      expect(Math.abs(after - before)).toBeLessThanOrEqual(conservationTolerance(before, ROUNDS));
    },
  );

  it('difüzyon Void hücrelerine sızmaz', () => {
    const { fields, mask } = maskedFields(64, 5);

    for (let round = 0; round < ROUNDS; round++) fields.diffuse('nutrient', DIFFUSION);

    for (let index = 0; index < fields.length; index++) {
      if (mask[index] === 0) expect(fields.nutrient[index]).toBe(0);
    }
  });

  it('kıyı hücresine konan tekil kütle Void’e geçmez ve habitatta korunur', () => {
    const { fields, mask } = maskedFields(64, 3);
    fields.nutrient.fill(0);
    const shore = findShoreCell(mask, 64);
    fields.nutrient[shore] = 1;

    for (let round = 0; round < ROUNDS; round++) fields.diffuse('nutrient', DIFFUSION);

    for (let index = 0; index < fields.length; index++) {
      if (mask[index] === 0) expect(fields.nutrient[index]).toBe(0);
    }
    expect(Math.abs(sumHabitat(fields.nutrient, mask) - 1)).toBeLessThanOrEqual(
      conservationTolerance(1, ROUNDS),
    );
  });

  it('depolama kenarına değen habitat hücreleri de korunur', () => {
    const resolution = 32;
    const mask = new Uint8Array(resolution * resolution).fill(1);
    const fields = new FieldSet(resolution);
    fields.setMask(mask);
    seedRandomNutrient(fields, mask, 7);
    const before = sumHabitat(fields.nutrient, mask);

    for (let round = 0; round < ROUNDS; round++) fields.diffuse('nutrient', DIFFUSION);

    expect(Math.abs(sumHabitat(fields.nutrient, mask) - before)).toBeLessThanOrEqual(
      conservationTolerance(before, ROUNDS),
    );
  });

  it.each([2, 4, 8, 16])('maskeli %i bantlı tur tam difüzyonla bayt düzeyinde eşittir', (bands) => {
    const resolution = 64;
    const banded = maskedFields(resolution, 13);
    const full = maskedFields(resolution, 13);
    const rowCount = resolution / bands;

    full.fields.diffuse('nutrient', DIFFUSION);
    const source = banded.fields.nutrient.slice();
    for (let band = 0; band < bands; band++) {
      banded.fields.diffuseRows('nutrient', DIFFUSION, band * rowCount, rowCount, source);
    }

    expect(new Uint8Array(banded.fields.nutrient.buffer.slice(0))).toEqual(
      new Uint8Array(full.fields.nutrient.buffer.slice(0)),
    );
  });
});

describe('LifeWorld alan maskesi', () => {
  it('600 tick boyunca Void hücreleri difüzyon, yenilenme ve ışıktan sonra TAM sıfır kalır', () => {
    const config = {
      ...substrateConfig,
      world: { ...substrateConfig.world, fieldResolution: 64 },
      particles: { ...substrateConfig.particles, capacity: 32 },
    };
    const world = new LifeWorld(config, createExplicitWorldMetadata(23));
    const mask = world.fields.mask;
    expect(mask).not.toBeNull();

    for (let tick = 0; tick < 600; tick++) world.step();

    const violations: string[] = [];
    for (const name of world.fields.names()) {
      const field = world.fields.get(name);
      for (let index = 0; index < field.length; index++) {
        if (mask![index] === 0 && field[index] !== 0) {
          violations.push(`${name}[${index}] = ${field[index]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('yenilenme bir KAYNAK terimidir: habitatta besin üretir, Void’e yazmaz', () => {
    const { fields, mask } = maskedFields(64, 17);
    fields.nutrient.fill(0);
    fields.light.fill(0);
    for (let index = 0; index < fields.length; index++) {
      if (mask[index] === 1) fields.light[index] = 0.5;
    }
    const renewal = worldConfig.nutrientRenewal;

    for (let index = 0; index < fields.length; index++) {
      fields.nutrient[index] += (fields.light[index] - fields.nutrient[index]) * renewal;
    }

    let habitatGain = 0;
    for (let index = 0; index < fields.length; index++) {
      if (mask[index] === 0) expect(fields.nutrient[index]).toBe(0);
      else habitatGain += fields.nutrient[index];
    }
    expect(habitatGain).toBeGreaterThan(0);
  });
});

function findShoreCell(mask: Uint8Array, resolution: number): number {
  for (let y = 1; y < resolution - 1; y++) {
    for (let x = 1; x < resolution - 1; x++) {
      const index = y * resolution + x;
      if (mask[index] === 0) continue;
      const voidNeighbour =
        mask[index - 1] === 0 ||
        mask[index + 1] === 0 ||
        mask[index - resolution] === 0 ||
        mask[index + resolution] === 0;
      if (voidNeighbour) return index;
    }
  }
  throw new Error('Maskede kıyı hücresi bulunamadı.');
}
