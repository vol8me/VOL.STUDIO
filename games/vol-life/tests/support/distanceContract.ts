import { habitatConfig } from '@/config/habitat';
import { worldConfig } from '@/config/world';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import { HabitatTruth } from './habitatTruth';

/** C6 ön-kayıtlı sınırları; ölçümden ÖNCE yazıldı ve sonuç görüldükten sonra değişmedi. */
export const BAND_UNITS = 64;
export const MAX_BAND_ERROR_UNITS = 0.5;
export const MAX_NORMAL_ANGLE_DEG = 2;
export const MAX_NORMAL_LENGTH_ERROR = 1e-6;
/** İşaret iddiası kıyının üstünde tanımsızdır; bu komşuluk sınanmaz. */
export const SIGN_GUARD_UNITS = 0.01;
/** Bant üyeliği iddiası 64 eşiğinin bu komşuluğunda tanımsızdır. */
export const BAND_GUARD_UNITS = 1;

const OFFSETS = [-64, -48, -32, -24, -16, -8, -4, -1, 0, 1, 4, 8, 16, 24, 32, 48, 64];
const ANGLE_STEPS = 180;
const GRID = 48;
const TRUTH_SEGMENTS = 20_000;

export interface DistanceContractReport {
  readonly seeds: number;
  readonly bandSamples: number;
  readonly bandMaxAbsError: number;
  readonly bandFailures: number;
  readonly signSamples: number;
  readonly signMismatches: number;
  readonly membershipSamples: number;
  readonly bandMembershipMismatches: number;
  readonly normalSamples: number;
  readonly normalMaxAngleDeg: number;
  readonly normalMaxLengthError: number;
  readonly normalExcluded: number;
}

/**
 * Yoğun kontur referansına karşı ölçüm. Sorgular kıyı boyunca normal yönünde
 * ofsetlenmiş noktalar ve depolama ızgarasıdır; referans `HabitatTruth`tur.
 */
export function measureDistanceContract(seeds: readonly number[]): DistanceContractReport {
  const storage = worldConfig.boundsUnits;
  const sample = { distance: 0, normalX: 1, normalY: 0 };
  let bandSamples = 0;
  let bandMaxAbsError = 0;
  let bandFailures = 0;
  let signSamples = 0;
  let signMismatches = 0;
  let membershipSamples = 0;
  let bandMembershipMismatches = 0;
  let normalSamples = 0;
  let normalMaxAngleDeg = 0;
  let normalMaxLengthError = 0;
  let normalExcluded = 0;

  for (const seed of seeds) {
    const domain = createHabitatDomain(storage, habitatConfig, seed);
    const truth = new HabitatTruth(domain, TRUTH_SEGMENTS);
    const contour = domain.contour(ANGLE_STEPS);
    const queries: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < ANGLE_STEPS; index++) {
      const px = contour[index * 2];
      const py = contour[index * 2 + 1];
      const base = truth.sample(px, py);
      for (const offset of OFFSETS) {
        queries.push({ x: px + base.normalX * offset, y: py + base.normalY * offset });
      }
    }
    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        queries.push({
          x: storage.x + ((gx + 0.5) / GRID) * storage.width,
          y: storage.y + ((gy + 0.5) / GRID) * storage.height,
        });
      }
    }

    for (const query of queries) {
      const reference = truth.sample(query.x, query.y);
      domain.sampleDistanceAndNormal(query.x, query.y, sample);
      const truthAbs = Math.abs(reference.distance);

      if (truthAbs >= SIGN_GUARD_UNITS) {
        signSamples++;
        if (Math.sign(sample.distance) !== Math.sign(reference.distance)) signMismatches++;
      }
      if (Math.abs(truthAbs - BAND_UNITS) > BAND_GUARD_UNITS) {
        membershipSamples++;
        if (truthAbs <= BAND_UNITS !== Math.abs(sample.distance) <= BAND_UNITS) {
          bandMembershipMismatches++;
        }
      }
      if (truthAbs <= BAND_UNITS) {
        const error = Math.abs(sample.distance - reference.distance);
        bandSamples++;
        bandMaxAbsError = Math.max(bandMaxAbsError, error);
        if (error > MAX_BAND_ERROR_UNITS) bandFailures++;
        const length = Math.hypot(sample.normalX, sample.normalY);
        normalMaxLengthError = Math.max(normalMaxLengthError, Math.abs(length - 1));
        if (!reference.unique) {
          normalExcluded++;
        } else {
          const dot = Math.max(
            -1,
            Math.min(
              1,
              (sample.normalX * reference.normalX + sample.normalY * reference.normalY) / length,
            ),
          );
          normalMaxAngleDeg = Math.max(normalMaxAngleDeg, (Math.acos(dot) * 180) / Math.PI);
          normalSamples++;
        }
      }
    }
  }

  return {
    seeds: seeds.length,
    bandSamples,
    bandMaxAbsError,
    bandFailures,
    signSamples,
    signMismatches,
    membershipSamples,
    bandMembershipMismatches,
    normalSamples,
    normalMaxAngleDeg,
    normalMaxLengthError,
    normalExcluded,
  };
}
