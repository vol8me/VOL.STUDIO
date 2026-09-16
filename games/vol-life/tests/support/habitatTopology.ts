import { defaultSubstrateCandidate } from '@/config/candidate';
import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import { createHabitatDomain, rasterizeHabitatMask } from '@/runtime/sim/WorldDomain';

/**
 * C7 ön-kayıtlı topoloji sınırları (ölçümden ÖNCE yazıldı):
 * tek bağlı habitat, iç delik yok, eğrilik yarıçapı ≥ 2×fringe + 4, boğaz
 * ≥ 2×kernel cutoff, güvenli iç bölge ≥ habitat alanının %50'si.
 */
export const MIN_CURVATURE_RADIUS_UNITS = 2 * defaultSubstrateCandidate.void.widthUnits + 4;
export const MIN_THROAT_UNITS = 2 * defaultSubstrateCandidate.physics.cutoffUnits;
export const MIN_SAFE_AREA_RATIO = 0.5;
export const SAFE_INTERIOR_DISTANCE_UNITS =
  defaultSubstrateCandidate.seeding.safeEdgeMarginUnits +
  defaultSubstrateCandidate.seeding.patchRadiusUnits;

/**
 * Boğaz ve eğrilik için 512 segment yeter: ölçüldü, 2048 segmentli tarama ile
 * boğaz değeri 0,02 birimden az farkediyor (549,66 vs 549,68) ve O(n²) tarama
 * 17,8 ms yerine 1,0 ms sürüyor.
 */
const CONTOUR_SEGMENTS = 512;
const AREA_RESOLUTION = 256;

export interface TopologyReport {
  readonly seed: number;
  readonly habitatComponents: number;
  readonly voidHoles: number;
  readonly minCurvatureRadius: number;
  readonly minThroat: number;
  readonly safeAreaRatio: number;
  readonly problems: readonly string[];
}

/** Habitat 4-komşulukla, Void 8-komşulukla taranır: ikili topolojide paradoks çıkmasın. */
export function measureTopology(
  seed: number,
  maskResolutions: readonly number[] = [256, 1024],
): TopologyReport {
  const storage = worldConfig.boundsUnits;
  const domain = createHabitatDomain(storage, habitatConfig, seed);
  const problems: string[] = [];
  let components = 0;
  let holes = 0;

  for (const resolution of maskResolutions) {
    const mask = rasterizeHabitatMask(domain, resolution);
    const resolutionComponents = countHabitatComponents(mask, resolution);
    const resolutionHoles = countVoidHoles(mask, resolution);
    components = Math.max(components, resolutionComponents);
    holes = Math.max(holes, resolutionHoles);
    if (resolutionComponents !== 1) {
      problems.push(`${resolution}²: habitat bileşeni ${resolutionComponents}`);
    }
    if (resolutionHoles !== 0) problems.push(`${resolution}²: iç delik ${resolutionHoles}`);
  }

  const contour = domain.contour(CONTOUR_SEGMENTS);
  const curvature = minCurvatureRadius(contour);
  if (curvature < MIN_CURVATURE_RADIUS_UNITS) {
    problems.push(`eğrilik yarıçapı ${curvature.toFixed(1)} < ${MIN_CURVATURE_RADIUS_UNITS}`);
  }
  const throat = minThroat(contour);
  if (throat < MIN_THROAT_UNITS) problems.push(`boğaz ${throat.toFixed(1)} < ${MIN_THROAT_UNITS}`);

  const safeAreaRatio = measureSafeAreaRatio(domain, storage);
  if (safeAreaRatio < MIN_SAFE_AREA_RATIO) {
    problems.push(`güvenli iç bölge %${(safeAreaRatio * 100).toFixed(1)} < %50`);
  }

  return {
    seed,
    habitatComponents: components,
    voidHoles: holes,
    minCurvatureRadius: curvature,
    minThroat: throat,
    safeAreaRatio,
    problems,
  };
}

export function countHabitatComponents(mask: Uint8Array, resolution: number): number {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let components = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    components++;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % resolution;
      const y = (index / resolution) | 0;
      if (x > 0) pushIf(mask, seen, stack, index - 1, 1);
      if (x < resolution - 1) pushIf(mask, seen, stack, index + 1, 1);
      if (y > 0) pushIf(mask, seen, stack, index - resolution, 1);
      if (y < resolution - 1) pushIf(mask, seen, stack, index + resolution, 1);
    }
  }
  return components;
}

export function countVoidHoles(mask: Uint8Array, resolution: number): number {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  let holes = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 1 || seen[start] === 1) continue;
    let touchesBorder = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      const x = index % resolution;
      const y = (index / resolution) | 0;
      if (x === 0 || y === 0 || x === resolution - 1 || y === resolution - 1) touchesBorder = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= resolution || ny >= resolution) continue;
          pushIf(mask, seen, stack, ny * resolution + nx, 0);
        }
      }
    }
    if (!touchesBorder) holes++;
  }
  return holes;
}

function pushIf(
  mask: Uint8Array,
  seen: Uint8Array,
  stack: number[],
  index: number,
  wanted: number,
): void {
  if (mask[index] === wanted && seen[index] === 0) {
    seen[index] = 1;
    stack.push(index);
  }
}

/** Üç ardışık kontur noktasından çevrel çember yarıçapı. */
function minCurvatureRadius(contour: Float32Array): number {
  const count = contour.length / 2;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index++) {
    const previous = (index - 1 + count) % count;
    const next = (index + 1) % count;
    const ax = contour[previous * 2];
    const ay = contour[previous * 2 + 1];
    const bx = contour[index * 2];
    const by = contour[index * 2 + 1];
    const cx = contour[next * 2];
    const cy = contour[next * 2 + 1];
    const area2 = Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    if (area2 < 1e-12) continue;
    const radius =
      (Math.hypot(bx - ax, by - ay) * Math.hypot(cx - bx, cy - by) * Math.hypot(cx - ax, cy - ay)) /
      (2 * area2);
    minimum = Math.min(minimum, radius);
  }
  return minimum;
}

/** Konturda en az çeyrek çevre ayrık iki nokta arasındaki en küçük mesafe. */
function minThroat(contour: Float32Array): number {
  const count = contour.length / 2;
  const quarter = Math.floor(count / 4);
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < count; i += 2) {
    for (let j = i + quarter; j <= i + count - quarter; j += 2) {
      const k = j % count;
      const distance = Math.hypot(
        contour[i * 2] - contour[k * 2],
        contour[i * 2 + 1] - contour[k * 2 + 1],
      );
      if (distance < minimum) minimum = distance;
    }
  }
  return minimum;
}

function measureSafeAreaRatio(
  domain: ReturnType<typeof createHabitatDomain>,
  storage: typeof worldConfig.boundsUnits,
): number {
  const cell = storage.width / AREA_RESOLUTION;
  const sample = { distance: 0, normalX: 1, normalY: 0 };
  let habitatCells = 0;
  let safeCells = 0;
  for (let gy = 0; gy < AREA_RESOLUTION; gy++) {
    for (let gx = 0; gx < AREA_RESOLUTION; gx++) {
      const distance = domain.sampleDistanceAndNormal(
        storage.x + (gx + 0.5) * cell,
        storage.y + (gy + 0.5) * cell,
        sample,
      ).distance;
      if (distance >= 0) habitatCells++;
      if (distance >= SAFE_INTERIOR_DISTANCE_UNITS) safeCells++;
    }
  }
  return habitatCells > 0 ? safeCells / habitatCells : 0;
}
