import type { FieldSet } from '@/runtime/sim/FieldSet';

export function rasterizeFields(
  fields: FieldSet,
  target = new Uint8ClampedArray(fields.length * 4),
): Uint8ClampedArray {
  if (target.length !== fields.length * 4) {
    throw new RangeError(`Alan piksel tamponu ${fields.length * 4} bayt olmalı: ${target.length}`);
  }

  const { light, nutrient, temperature, disturbance } = fields;
  for (let i = 0, pixel = 0; i < fields.length; i++, pixel += 4) {
    const l = finiteUnit(light[i]);
    const n = finiteUnit(nutrient[i]);
    const t = finiteUnit(temperature[i]);
    const d = finiteUnit(disturbance[i]);
    target[pixel] = channel(5 + l * 128 + n * 18 + t * 12 - d * 22);
    target[pixel + 1] = channel(10 + l * 62 + n * 104 + t * 8 - d * 28);
    target[pixel + 2] = channel(17 + l * 30 + n * 74 + (1 - t) * 20 + d * 20);
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
