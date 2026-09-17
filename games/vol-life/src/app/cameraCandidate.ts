import {
  cameraCandidateById,
  defaultCameraCandidateId,
  type CameraCandidate,
} from '@/config/cameraCandidates';

export interface CameraCandidateEnvironment {
  readonly DEV: boolean;
}

/**
 * Kamera adayı seçimi (D5/D6 kabul paketi). Üretimde sorgu okunmaz: aday
 * karşılaştırması bir geliştirme aracıdır ve kullanıcı kararı verilene kadar
 * üretim `dengeli` ile açılır.
 *
 * Bilinmeyen ad SESSİZCE varsayılana düşmez — hangi ölçülerin denendiği kabul
 * kaydının kendisidir ve yanlış adla alınan bir karar o kaydı yalanlar.
 */
export function resolveCameraCandidate(
  env: CameraCandidateEnvironment = import.meta.env,
  search = typeof window === 'undefined' ? '' : window.location.search,
): CameraCandidate {
  if (!env.DEV) return cameraCandidateById(defaultCameraCandidateId);
  const requested = new URLSearchParams(search).get('camera');
  if (requested === null || requested.trim().length === 0) {
    return cameraCandidateById(defaultCameraCandidateId);
  }
  return cameraCandidateById(requested.trim());
}
