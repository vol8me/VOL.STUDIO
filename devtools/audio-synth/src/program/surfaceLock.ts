import type { Sha256 } from '../kernel/canonical';

/**
 * Registry render yüzeyi kilidinin biçimi. Kilidi `audio:surface-lock`
 * yazar, `tests/governance/renderSurface.test.ts` bugünkü registry ile
 * birebir eşleşmesini ister. Çok sürümlü düğümlerde anahtar `id@version`
 * çiftidir: dondurulmuş eski sürümler de aynı kilitle izlenir.
 */
export const RENDER_SURFACE_LOCK_PATH = 'render-surface.lock.json';

export interface RenderSurfaceLockV2 {
  readonly schema: 'RenderSurfaceLockV2';
  /** Anahtar: `düğüm.kimliği@sürüm`. */
  readonly nodes: Readonly<Record<string, { readonly version: number; readonly hash: Sha256 }>>;
}
