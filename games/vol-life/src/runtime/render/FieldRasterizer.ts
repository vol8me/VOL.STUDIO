import type { FieldSet } from '@/runtime/sim/FieldSet';

/**
 * Alanları RGBA'ya çevirir. `shade` verilirse (0–1, hücre başına) renk onunla
 * çarpılır: kıyıya yaklaşan hücreler organik biçimde kararır (DESIGN.md §6).
 */
export function rasterizeFields(
  fields: FieldSet,
  target = new Uint8ClampedArray(fields.length * 4),
  shade: Float32Array | null = null,
): Uint8ClampedArray {
  if (target.length !== fields.length * 4) {
    throw new RangeError(`Alan piksel tamponu ${fields.length * 4} bayt olmalı: ${target.length}`);
  }
  if (shade && shade.length !== fields.length) {
    throw new RangeError(`Gölge tamponu ${fields.length} değer taşımalı: ${shade.length}`);
  }

  const { light, nutrient, temperature, disturbance } = fields;
  for (let i = 0, pixel = 0; i < fields.length; i++, pixel += 4) {
    const l = finiteUnit(light[i]);
    const n = finiteUnit(nutrient[i]);
    const t = finiteUnit(temperature[i]);
    const d = finiteUnit(disturbance[i]);
    const s = shade ? finiteUnit(shade[i]) : 1;
    target[pixel] = channel((4 + l * 38 + n * 6 + t * 4 - d * 10) * s);
    target[pixel + 1] = channel((7 + l * 18 + n * 30 + t * 4 - d * 12) * s);
    target[pixel + 2] = channel((12 + l * 10 + n * 22 + (1 - t) * 12 + d * 8) * s);
    target[pixel + 3] = 255;
  }
  return target;
}

function finiteUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function channel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}
