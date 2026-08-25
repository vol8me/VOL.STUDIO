/**
 * Yeniden kullanılabilir yüzey tarifleri.
 *
 * Tarif şekil çizmez; bir `source` alanını nasıl dokulandıracağını, hangi
 * rampaları beklediğini ve hangi ilk ışık ayarının güvenli başlangıç olduğunu
 * bildirir. Böylece aynı metal/odun/taş tarifi daireye, kutuya ya da path'e
 * uygulanabilir. Fotoğrafik malzeme veya PBR iddiası yoktur.
 */

import type { FieldNode, LayerSpec, PaletteSpec, ShadeSpec, SpriteDoc } from './types';

export interface VisualMaterialMetadata {
  readonly description: string;
  readonly useCase: string;
  readonly tags: readonly string[];
}

export interface VisualMaterialRecipe extends VisualMaterialMetadata {
  readonly palette: PaletteSpec;
  readonly height: FieldNode;
  readonly material: number;
  readonly materialMask?: FieldNode;
  readonly materialAlt?: number;
  readonly materialThreshold?: number;
  readonly shade?: ShadeSpec;
}

export const VISUAL_MATERIAL_RECIPES = {
  brushedMetal: {
    description: 'Yönlü çizgi, ince gürültü ve iki rampalı metal başlangıcı.',
    useCase: 'Panel, mekanik gövde, çelik yüzey',
    tags: ['metal', 'steel', 'çelik', 'mechanical', 'mekanik', 'brushed', 'fırçalı'],
    palette: {
      generate: [
        { base: '#66717d', steps: 6, hueShift: -10, satCurve: 'flat', name: 'metal' },
        { base: '#a9b8c4', steps: 5, hueShift: -8, satCurve: 'flat', name: 'highlight' },
      ],
    },
    height: {
      kind: 'mul',
      a: { kind: 'pattern.stripes', freq: 22, angle: -8, duty: 0.22 },
      b: { kind: 'noise.value', freq: 8 },
    },
    material: 0,
    materialMask: { kind: 'noise.value', freq: 3, seed: 17 },
    materialAlt: 1,
    materialThreshold: 0.78,
    shade: { light: [-0.6, -0.7, 0.5], strength: 0.48, ambient: 0.42, relief: 0.24 },
  },
  warmWood: {
    description: 'Döşenebilir damar çizgisi ve doğal ton ayrımı taşıyan odun yüzeyi.',
    useCase: 'Tahta, sap, masa yüzeyi, sandık parçası',
    tags: ['wood', 'odun', 'bark', 'kabuk', 'grain', 'damar', 'natural', 'doğal'],
    palette: {
      generate: [
        { base: '#70442d', steps: 6, hueShift: -8, satCurve: 'arch', name: 'wood' },
        { base: '#b77a46', steps: 5, hueShift: -12, satCurve: 'arch', name: 'grain' },
      ],
    },
    height: {
      kind: 'mix',
      a: { kind: 'pattern.stripes', freq: 7, angle: 6, duty: 0.58 },
      b: { kind: 'noise.fbm', base: { kind: 'noise.value', freq: 5 }, octaves: 3, gain: 0.5 },
      t: 0.3,
    },
    material: 0,
    materialMask: { kind: 'pattern.stripes', freq: 7, angle: 6, duty: 0.46 },
    materialAlt: 1,
    materialThreshold: 0.54,
    shade: { light: [-0.5, -0.72, 0.48], strength: 0.5, ambient: 0.38, relief: 0.32 },
  },
  coarseStone: {
    description: 'Farklı ölçekli hücre ve değer gürültüsüyle pürüzlü taş yüzeyi.',
    useCase: 'Kaya, duvar, mineral, zemin kaplaması',
    tags: ['stone', 'taş', 'rock', 'kaya', 'mineral', 'rough', 'pürüzlü'],
    palette: {
      generate: [{ base: '#77736b', steps: 7, hueShift: -4, satCurve: 'flat', name: 'stone' }],
    },
    height: {
      kind: 'mul',
      a: { kind: 'noise.fbm', base: { kind: 'noise.value', freq: 4 }, octaves: 3, gain: 0.52 },
      b: { kind: 'noise.worley', freq: 8, mode: 'F2-F1' },
    },
    material: 0,
    shade: { light: [-0.48, -0.72, 0.54], strength: 0.56, ambient: 0.34, relief: 0.42 },
  },
  organicFlesh: {
    description: 'Yumuşak, düşük frekanslı damar ve sıcak kırmızı yüzey başlangıcı.',
    useCase: 'Meyve, bitki gövdesi, etli organik prop',
    tags: ['flesh', 'et', 'organic', 'organik', 'fruit', 'meyve', 'soft', 'yumuşak'],
    palette: {
      generate: [{ base: '#a94337', steps: 7, hueShift: -16, satCurve: 'arch', name: 'flesh' }],
    },
    height: {
      kind: 'mix',
      a: { kind: 'gradient.radial', center: [-0.1, -0.16], radius: 1.05 },
      b: { kind: 'noise.fbm', base: { kind: 'noise.value', freq: 5 }, octaves: 2, gain: 0.45 },
      t: 0.22,
    },
    material: 0,
    shade: { light: [-0.52, -0.7, 0.5], strength: 0.44, ambient: 0.4, rim: 0.08, relief: 0.28 },
  },
  emissiveGlow: {
    description: 'Parlak çekirdek, palette-safe emission ve stilize halo başlangıcı.',
    useCase: 'LED, enerji çekirdeği, yıldız, sihir efekti',
    tags: ['glow', 'parıltı', 'emissive', 'ışık', 'led', 'energy', 'enerji'],
    palette: {
      generate: [
        { base: '#5b3ba5', steps: 6, hueShift: -12, satCurve: 'rise', name: 'core' },
        { base: '#d68bff', steps: 5, hueShift: -8, satCurve: 'rise', name: 'halo' },
      ],
    },
    height: { kind: 'gradient.radial', center: [-0.08, -0.12], radius: 0.92 },
    material: 0,
    materialMask: { kind: 'gradient.radial', center: [-0.08, -0.12], radius: 0.72 },
    materialAlt: 1,
    materialThreshold: 0.36,
    shade: {
      light: [-0.4, -0.6, 0.65],
      strength: 0.38,
      ambient: 0.44,
      rim: 0.2,
      relief: 0.18,
      emission: 0.22,
    },
  },
} as const satisfies Record<string, VisualMaterialRecipe>;

export type VisualMaterialId = keyof typeof VISUAL_MATERIAL_RECIPES;

export interface FindVisualMaterialsQuery {
  readonly tags?: readonly string[];
  readonly text?: string;
}

export interface CreateVisualMaterialOptions {
  readonly size?: number | readonly [number, number];
  readonly seed?: number;
  readonly source?: FieldNode;
  readonly layerId?: string;
}

/** Arama sonucu deterministik katalog sırasını korur. */
export function findVisualMaterials(query: FindVisualMaterialsQuery = {}): VisualMaterialId[] {
  const tags = (query.tags ?? []).map(normalizeSearch);
  const terms = tokenize(query.text ?? '');
  return (
    Object.entries(VISUAL_MATERIAL_RECIPES) as Array<[VisualMaterialId, VisualMaterialRecipe]>
  )
    .filter(([, recipe]) => {
      if (
        tags.length > 0 &&
        !tags.some((tag) => recipe.tags.some((item) => normalizeSearch(item) === tag))
      ) {
        return false;
      }
      if (terms.length === 0) return true;
      const haystack = normalizeSearch(
        `${recipe.description} ${recipe.useCase} ${recipe.tags.join(' ')}`,
      );
      return terms.some((term) => haystack.includes(term));
    })
    .map(([id]) => id);
}

/** Tarif graphını verilen biçime uygulayan katman parçası. */
export function createVisualMaterialLayer(
  id: string,
  source: FieldNode,
  materialId: VisualMaterialId,
): LayerSpec {
  const recipe: VisualMaterialRecipe = VISUAL_MATERIAL_RECIPES[materialId];
  return {
    id,
    source,
    height: cloneField(recipe.height),
    material: recipe.material,
    ...(recipe.materialMask ? { materialMask: cloneField(recipe.materialMask) } : {}),
    ...(recipe.materialAlt !== undefined ? { materialAlt: recipe.materialAlt } : {}),
    ...(recipe.materialThreshold !== undefined
      ? { materialThreshold: recipe.materialThreshold }
      : {}),
  };
}

/**
 * Tarifin tek başına doğrulanabilir bir örnek belgesini üretir.
 * Varsayılan `const:1` şekil seçimi bilinçlidir: bu bir nesne preset'i değil,
 * her pikselde yüzey örneği veren malzeme test kartıdır.
 */
export function createVisualMaterialDocument(
  materialId: VisualMaterialId,
  options: CreateVisualMaterialOptions = {},
): SpriteDoc {
  const recipe: VisualMaterialRecipe = VISUAL_MATERIAL_RECIPES[materialId];
  const size = options.size ?? 64;
  const source = options.source ?? { kind: 'const', value: 1 };
  const layer = createVisualMaterialLayer(options.layerId ?? 'surface', source, materialId);
  return {
    schemaVersion: 1,
    size: typeof size === 'number' ? [size, size] : [size[0], size[1]],
    seed: options.seed ?? 1337,
    tileable: true,
    antialias: false,
    palette: clonePaletteSpec(recipe.palette),
    layers: [layer],
    ...(recipe.shade ? { shade: { ...recipe.shade } } : {}),
    ...(materialId === 'emissiveGlow'
      ? {
          post: {
            glow: { radius: 3, strength: 0.78, colorIndex: 1 },
            quantize: { mode: 'ramp' as const },
          },
        }
      : { post: { quantize: { mode: 'ramp' as const } } }),
  };
}

function cloneField(field: FieldNode): FieldNode {
  return JSON.parse(JSON.stringify(field)) as FieldNode;
}

function clonePaletteSpec(palette: PaletteSpec): PaletteSpec {
  return JSON.parse(JSON.stringify(palette)) as PaletteSpec;
}

function tokenize(value: string): string[] {
  return normalizeSearch(value)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i');
}
