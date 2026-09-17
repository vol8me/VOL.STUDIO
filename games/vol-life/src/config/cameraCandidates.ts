import type { PointerModality, PointerMomentumProfile } from '@volstudio/core';

/**
 * Kamera aday ölçüleri (D5/D6). Karar SAYILARLA değil kullanıcının eliyle
 * verilir; bu dosya karşılaştırılacak adayları açıkça sayıya döker ki
 * "daha iyi hissettiriyor" cümlesi bir ölçü kümesine bağlansın.
 *
 * Adaylar YALNIZ geliştirme sunucusunda seçilebilir (`?camera=<ad>`); üretim
 * her zaman `dengeli` ile açılır.
 */
export interface CameraCandidate {
  readonly id: string;
  /** Kullanıcının pakette göreceği kısa açıklama. */
  readonly summary: string;
  readonly profiles: Readonly<Record<PointerModality, PointerMomentumProfile>>;
  readonly wheelSensitivity: number;
  readonly wheelSmoothingMs: number;
}

export const cameraCandidates: readonly CameraCandidate[] = [
  {
    id: 'dengeli',
    summary: 'Bugünkü varsayılan: fare ani, parmak savurmalı.',
    profiles: {
      mouse: { momentumMs: 90, resistanceBandRatio: 0.08 },
      touch: { momentumMs: 180, resistanceBandRatio: 0.12 },
      pen: { momentumMs: 120, resistanceBandRatio: 0.1 },
      trackpad: { momentumMs: 140, resistanceBandRatio: 0.1 },
    },
    wheelSensitivity: 0.0015,
    wheelSmoothingMs: 90,
  },
  {
    id: 'cevik',
    summary: 'Kısa kayma, dar direnç bandı, hızlı zoom: kamera elin altında durur.',
    profiles: {
      mouse: { momentumMs: 45, resistanceBandRatio: 0.05 },
      touch: { momentumMs: 110, resistanceBandRatio: 0.08 },
      pen: { momentumMs: 70, resistanceBandRatio: 0.06 },
      trackpad: { momentumMs: 80, resistanceBandRatio: 0.06 },
    },
    wheelSensitivity: 0.0022,
    wheelSmoothingMs: 60,
  },
  {
    id: 'agir',
    summary: 'Uzun kayma, geniş direnç bandı, yumuşak zoom: kamera ağırlık taşır.',
    profiles: {
      mouse: { momentumMs: 160, resistanceBandRatio: 0.12 },
      touch: { momentumMs: 320, resistanceBandRatio: 0.18 },
      pen: { momentumMs: 220, resistanceBandRatio: 0.15 },
      trackpad: { momentumMs: 240, resistanceBandRatio: 0.15 },
    },
    wheelSensitivity: 0.001,
    wheelSmoothingMs: 140,
  },
];

export const defaultCameraCandidateId = 'dengeli';

export function cameraCandidateById(id: string): CameraCandidate {
  const found = cameraCandidates.find((candidate) => candidate.id === id);
  if (!found) {
    const names = cameraCandidates.map((candidate) => candidate.id).join(', ');
    throw new RangeError(`Bilinmeyen kamera adayı "${id}"; seçenekler: ${names}.`);
  }
  return found;
}

export function validateCameraCandidates(candidates: readonly CameraCandidate[]): void {
  if (candidates.length < 2) throw new RangeError('Karşılaştırma en az iki aday ister.');
  if (new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length) {
    throw new RangeError('Kamera adayı kimlikleri benzersiz olmalı.');
  }
  for (const candidate of candidates) {
    for (const [modality, profile] of Object.entries(candidate.profiles)) {
      if (!(profile.momentumMs >= 0) || !Number.isFinite(profile.momentumMs)) {
        throw new RangeError(`${candidate.id}/${modality}: momentum sonlu ve negatif olmamalı.`);
      }
      if (!(profile.resistanceBandRatio > 0) || profile.resistanceBandRatio >= 0.5) {
        throw new RangeError(
          `${candidate.id}/${modality}: direnç bandı (0, 0,5) aralığında olmalı.`,
        );
      }
    }
    if (!(candidate.wheelSensitivity > 0) || !(candidate.wheelSmoothingMs >= 0)) {
      throw new RangeError(`${candidate.id}: tekerlek ölçüleri pozitif olmalı.`);
    }
  }
}
