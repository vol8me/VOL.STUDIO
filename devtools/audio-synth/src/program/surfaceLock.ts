import type { Sha256 } from '../protocol/canonical';

/**
 * Registry render yüzeyi kilidinin biçimi. Kilidi `audio:surface-lock`
 * yazar, `tests/governance/renderSurface.test.ts` bugünkü registry ile
 * birebir eşleşmesini ister.
 */
export const RENDER_SURFACE_LOCK_PATH = 'render-surface.lock.json';

export interface RenderSurfaceLockV1 {
  readonly schema: 'RenderSurfaceLockV1';
  readonly nodes: Readonly<Record<string, { readonly version: number; readonly hash: Sha256 }>>;
}
