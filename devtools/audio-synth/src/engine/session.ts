import type { RenderCache } from './renderCache';

/**
 * Render kalitesi. Program ve düğümler iki kalitede de AYNIDIR; yalnız iç
 * aşırı örnekleme katsayıları değişir. `final` üretim yoludur ve yayın
 * yalnız onu kabul eder; `draft` agent yinelemesi içindir.
 */
export type RenderQuality = 'final' | 'draft';

export const RENDER_QUALITIES: readonly RenderQuality[] = ['final', 'draft'];

export interface QualityProfileV1 {
  /** Ses sentezi motorunun iç oranı (örnek oranının katı). */
  readonly voiceOversample: 1 | 2;
  /** Doygunluk şekillendiricisinin iç oranı. */
  readonly saturationOversample: 1 | 4;
  /** True-peak ölçümü ve sınırlayıcının ara değer katsayısı; 1 = örnek tepesi. */
  readonly truePeakOversample: 1 | 4;
}

export const QUALITY_PROFILES: Readonly<Record<RenderQuality, QualityProfileV1>> = {
  final: { voiceOversample: 2, saturationOversample: 4, truePeakOversample: 4 },
  draft: { voiceOversample: 1, saturationOversample: 1, truePeakOversample: 1 },
};

export interface RenderSession {
  readonly quality: RenderQuality;
  readonly cache: RenderCache | null;
}

const DEFAULT_SESSION: RenderSession = { quality: 'final', cache: null };

let current: RenderSession = DEFAULT_SESSION;

/** Etkin oturum; hiçbir oturum kurulmamışsa nihai kalite ve önbelleksiz render. */
export function renderSession(): RenderSession {
  return current;
}

export function qualityProfile(): QualityProfileV1 {
  return QUALITY_PROFILES[current.quality];
}

/**
 * `fn` süresince oturumu kurar. Verilmeyen alan dıştaki oturumdan miras
 * alınır. Render yolu senkrondur ve her worker kendi modül durumunu taşır;
 * oturum bu yüzden çağrı sınırının dışına sızmaz.
 */
export function withRenderSession<T>(session: Partial<RenderSession>, fn: () => T): T {
  const previous = current;
  current = {
    quality: session.quality ?? previous.quality,
    cache: session.cache === undefined ? previous.cache : session.cache,
  };
  try {
    return fn();
  } finally {
    current = previous;
  }
}
