import { describe, expect, it } from 'vitest';
import {
  cameraCandidateById,
  cameraCandidates,
  defaultCameraCandidateId,
  validateCameraCandidates,
} from '@/config/cameraCandidates';
import { resolveCameraCandidate } from '@/app/cameraCandidate';

describe('kamera aday ölçüleri (D5)', () => {
  it('adaylar geçerli ve karşılaştırılabilir', () => {
    expect(() => validateCameraCandidates(cameraCandidates)).not.toThrow();
    expect(cameraCandidates.length).toBeGreaterThanOrEqual(3);
    expect(cameraCandidateById(defaultCameraCandidateId).id).toBe('dengeli');
  });

  /* Adaylar GERÇEKTEN farklı ölçüler taşımalı; aynı sayılar karşılaştırma değildir. */
  it('adaylar birbirinden farklı sayılar taşır', () => {
    const momentums = cameraCandidates.map((candidate) => candidate.profiles.touch.momentumMs);
    expect(new Set(momentums).size).toBe(cameraCandidates.length);
    const sensitivities = cameraCandidates.map((candidate) => candidate.wheelSensitivity);
    expect(new Set(sensitivities).size).toBe(cameraCandidates.length);
  });

  it('geçersiz aday kümesi reddedilir', () => {
    const base = cameraCandidates[0];
    expect(() => validateCameraCandidates([base])).toThrow(RangeError);
    expect(() => validateCameraCandidates([base, base])).toThrow(RangeError);
    expect(() =>
      validateCameraCandidates([
        base,
        {
          ...base,
          id: 'bozuk',
          profiles: { ...base.profiles, touch: { momentumMs: -1, resistanceBandRatio: 0.1 } },
        },
      ]),
    ).toThrow(RangeError);
  });

  it('üretimde sorgu okunmaz; her zaman dengeli açılır', () => {
    expect(resolveCameraCandidate({ DEV: false }, '?camera=agir').id).toBe('dengeli');
  });

  it('geliştirmede sorgu adayı seçer', () => {
    expect(resolveCameraCandidate({ DEV: true }, '?camera=agir').id).toBe('agir');
    expect(resolveCameraCandidate({ DEV: true }, '').id).toBe('dengeli');
  });

  /* Bilinmeyen ad sessizce varsayılana DÜŞMEZ: yanlış adla alınan karar kaydı yalanlar. */
  it('bilinmeyen aday adı reddedilir', () => {
    expect(() => resolveCameraCandidate({ DEV: true }, '?camera=yok')).toThrow(RangeError);
  });
});
