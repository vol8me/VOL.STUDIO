/**
 * VisualSynth yetenek manifesti.
 *
 * Bu kayıt editör veya agent tarafında “motor neyi gerçekten yapıyor?”
 * sorusunun tek makine-okunur cevabıdır. Düğüm listesi şemadan türetilir;
 * böylece schema, validator ve üretim yüzeyi birbirinden kopmaz.
 */

import { FIELD_KINDS, NODE_SCHEMAS } from './schema';
import type { FieldKind } from './types';

export type VisualSynthCategory = 'generator' | 'domain' | 'buffered' | 'combine';

export interface VisualSynthCapabilities {
  readonly schemaVersion: 1;
  readonly fieldKinds: readonly FieldKind[];
  readonly kindsByCategory: Readonly<Record<VisualSynthCategory, readonly FieldKind[]>>;
  readonly guarantees: {
    readonly deterministicSeeded: true;
    readonly paletteLockedAfterQuantization: true;
    readonly headless: true;
    readonly unitAndPixelSpaces: true;
  };
  readonly shading: readonly ['ambient', 'lambert', 'rim', 'relief', 'ao'];
  readonly unsupported: readonly [
    'camera3d',
    'depthBuffer',
    'shadowMapping',
    'specular',
    'fresnel',
    'ibl',
    'pbr',
    'diffusion',
    'generalEditor',
  ];
}

const CATEGORIES: readonly VisualSynthCategory[] = ['generator', 'domain', 'buffered', 'combine'];

const kindsByCategory = Object.fromEntries(
  CATEGORIES.map((category) => [
    category,
    FIELD_KINDS.filter((kind) => NODE_SCHEMAS[kind].category === category),
  ]),
) as unknown as Record<VisualSynthCategory, readonly FieldKind[]>;

/** Tüketicilerin doğrudan paylaşabileceği sabit manifest. */
export const VISUAL_SYNTH_CAPABILITIES: VisualSynthCapabilities = {
  schemaVersion: 1,
  fieldKinds: FIELD_KINDS,
  kindsByCategory,
  guarantees: {
    deterministicSeeded: true,
    paletteLockedAfterQuantization: true,
    headless: true,
    unitAndPixelSpaces: true,
  },
  shading: ['ambient', 'lambert', 'rim', 'relief', 'ao'],
  unsupported: [
    'camera3d',
    'depthBuffer',
    'shadowMapping',
    'specular',
    'fresnel',
    'ibl',
    'pbr',
    'diffusion',
    'generalEditor',
  ],
};

/** Manifesti paylaşmak için isimli fonksiyon; gelecekte kopyalama politikası eklenebilir. */
export function getVisualSynthCapabilities(): VisualSynthCapabilities {
  return VISUAL_SYNTH_CAPABILITIES;
}
