import type { SpriteDoc } from './types';

/**
 * Kategori sözlüğü — §8.11 ve §10.2'nin ORTAK kaynağı.
 *
 * Editörün çıktı klasörleri ile preset kataloğunun kategorileri aynı olmak
 * zorunda: iki yerde ayrı ayrı büyüyen iki taksonomi kaçınılmaz olarak
 * ayrışır ve bir süre sonra `metal` ile `metaller` yan yana durur.
 *
 * Kategoriler bir TÜRÜ (genre) değil malzeme/biçim ailesini adlandırır;
 * `primitiveNeutrality` bekçisi bunu tarar.
 */
export const PRESET_CATEGORIES = [
  'material',
  'terrain',
  'organic',
  'liquid',
  'mineral',
  'structure',
  'effect',
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export function isPresetCategory(value: unknown): value is PresetCategory {
  return typeof value === 'string' && (PRESET_CATEGORIES as readonly string[]).includes(value);
}

/** Ajan ve niyet araması için kullanıcı metninden bağımsız katalog verisi. */
export interface VisualPresetMetadata {
  readonly category: PresetCategory;
  readonly description: string;
  readonly useCase: string;
  readonly tags: readonly string[];
  readonly related?: readonly string[];
}

/**
 * Genel başlangıç tarifleri.
 *
 * Bunlar belirli bir nesneyi bitmiş saymaz; biçim/malzeme ailesi için geçerli
 * bir belge verir. Kullanıcı ya da ajan bu belgeyi niyete göre daraltır.
 */
export const VISUAL_PRESET_CATALOG = {
  brushedSurface: {
    category: 'material',
    description: 'Yönlü çizgiler ve düşük kabartmayla işlenmiş yüzey başlangıcı.',
    useCase: 'Directional hard-surface texture, panel or plate base',
    tags: ['metal', 'steel', 'çelik', 'surface', 'yüzey', 'panel', 'brushed', 'fırçalı'],
    related: ['structureGrid', 'cutMineral'],
  },
  terrainCells: {
    category: 'terrain',
    description: 'Döşenebilir, iki ölçekli hücresel zemin başlangıcı.',
    useCase: 'Repeatable ground, soil or coarse natural surface',
    tags: ['terrain', 'ground', 'zemin', 'toprak', 'tile', 'döşeme', 'rough', 'pürüzlü'],
    related: ['organicCluster', 'liquidRipples'],
  },
  organicCluster: {
    category: 'organic',
    description: 'Yumuşak ana biçim ve doğal renk ayrımı taşıyan organik başlangıç.',
    useCase: 'Plant-like cluster, soft natural prop or organic silhouette',
    tags: ['organic', 'organik', 'plant', 'bitki', 'tree', 'ağaç', 'leaf', 'yaprak', 'soft'],
    related: ['terrainCells', 'softGlow'],
  },
  liquidRipples: {
    category: 'liquid',
    description: 'Tekrarlanan halkamsı değerlerle döşenebilir sıvı yüzeyi.',
    useCase: 'Water-like ripple, glossy fluid or repeating wave surface',
    tags: ['liquid', 'sıvı', 'water', 'su', 'ripple', 'dalgalı', 'fluid', 'akışkan'],
    related: ['terrainCells', 'softGlow'],
  },
  cutMineral: {
    category: 'mineral',
    description: 'Keskin çokgen silüet ve yönlü hacim taşıyan mineral başlangıç.',
    useCase: 'Faceted shard, crystal-like prop or cut stone silhouette',
    tags: ['mineral', 'crystal', 'kristal', 'stone', 'taş', 'rock', 'kaya', 'sharp', 'keskin'],
    related: ['brushedSurface', 'softGlow'],
  },
  structureGrid: {
    category: 'structure',
    description: 'Izgara kabartmalı, döşenebilir yapı yüzeyi başlangıcı.',
    useCase: 'Masonry, panel grid or repeatable constructed surface',
    tags: ['structure', 'yapı', 'wall', 'duvar', 'grid', 'ızgara', 'brick', 'tuğla', 'panel'],
    related: ['brushedSurface', 'terrainCells'],
  },
  softGlow: {
    category: 'effect',
    description: 'Parlak merkezli, yıldızsı ve yumuşak ışık etkisi başlangıcı.',
    useCase: 'Glow, burst, highlight or compact energy-like effect',
    tags: ['effect', 'efekt', 'glow', 'parıltı', 'light', 'ışık', 'energy', 'enerji', 'magic'],
    related: ['cutMineral', 'organicCluster'],
  },
} as const satisfies Record<string, VisualPresetMetadata>;

export type VisualPresetId = keyof typeof VISUAL_PRESET_CATALOG;

export interface FindVisualPresetsQuery {
  readonly category?: PresetCategory;
  readonly tags?: readonly string[];
  /** Serbest niyet metni; açıklama, kullanım ve etiketlerde aranır. */
  readonly text?: string;
}

export interface CreateVisualPresetOptions {
  readonly size?: number | readonly [number, number];
  readonly seed?: number;
}

const DOCUMENTS: Record<VisualPresetId, SpriteDoc> = {
  brushedSurface: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    tileable: true,
    antialias: false,
    palette: {
      generate: [{ base: '#66717d', steps: 6, hueShift: -10, satCurve: 'flat' }],
    },
    layers: [
      {
        id: 'surface',
        source: { kind: 'const', value: 1 },
        height: {
          kind: 'mul',
          a: { kind: 'pattern.stripes', freq: 22, angle: -8, duty: 0.22 },
          b: { kind: 'noise.value', freq: 8 },
        },
        material: 0,
      },
    ],
    shade: { light: [-0.6, -0.7, 0.5], strength: 0.45, ambient: 0.42, relief: 0.22 },
    post: { dither: { kind: 'bayer4', amount: 0.08 }, quantize: { mode: 'ramp' } },
  },
  terrainCells: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    tileable: true,
    antialias: false,
    palette: {
      generate: [{ base: '#66734c', steps: 6, hueShift: -16, satCurve: 'arch' }],
    },
    layers: [
      {
        id: 'ground',
        source: { kind: 'const', value: 1 },
        height: {
          kind: 'mul',
          a: {
            kind: 'noise.fbm',
            base: { kind: 'noise.value', freq: 4 },
            octaves: 3,
            lacunarity: 2,
            gain: 0.5,
          },
          b: { kind: 'noise.worley', freq: 7, mode: 'F2-F1' },
        },
        material: 0,
      },
    ],
    shade: { light: [-0.45, -0.7, 0.55], strength: 0.5, ambient: 0.38, relief: 0.3 },
    post: { dither: { kind: 'bayer4', amount: 0.1 }, quantize: { mode: 'ramp' } },
  },
  organicCluster: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    antialias: false,
    palette: {
      generate: [
        { base: '#64824d', steps: 5, hueShift: -18, satCurve: 'arch', name: 'crown' },
        { base: '#74523d', steps: 4, hueShift: -10, satCurve: 'arch', name: 'stem' },
      ],
    },
    layers: [
      {
        id: 'stem',
        source: { kind: 'sdf.capsule', a: [-0.08, 0.65], b: [0.08, -0.25], r: 0.13 },
        height: { kind: 'gradient.linear', angle: 90, from: -0.8, to: 0.8 },
        material: 1,
      },
      {
        id: 'crown',
        source: {
          kind: 'min',
          a: { kind: 'sdf.circle', center: [-0.22, -0.3], r: 0.42 },
          b: { kind: 'sdf.circle', center: [0.24, -0.38], r: 0.48 },
        },
        height: {
          kind: 'mix',
          a: { kind: 'gradient.radial', center: [-0.18, -0.5], radius: 1.05 },
          b: { kind: 'noise.value', freq: 5 },
          t: 0.24,
        },
        material: 0,
      },
    ],
    shade: {
      light: [-0.55, -0.7, 0.5],
      strength: 0.58,
      ambient: 0.36,
      rim: 0.1,
      relief: 0.45,
    },
    post: {
      outline: { px: 1, mode: 'outside', colorIndex: 0 },
      dither: { kind: 'bayer4', amount: 0.08 },
      quantize: { mode: 'ramp' },
    },
  },
  liquidRipples: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    tileable: true,
    antialias: false,
    palette: {
      generate: [{ base: '#3f7892', steps: 6, hueShift: -16, satCurve: 'rise' }],
    },
    layers: [
      {
        id: 'ripples',
        source: { kind: 'const', value: 1 },
        height: {
          kind: 'mul',
          a: { kind: 'pattern.dots', freq: 6, r: 0.72 },
          b: { kind: 'noise.value', freq: 4 },
        },
        material: 0,
      },
    ],
    shade: { light: [-0.5, -0.65, 0.6], strength: 0.6, ambient: 0.44, rim: 0.12, relief: 0.4 },
    post: { dither: { kind: 'blueNoise', amount: 0.06 }, quantize: { mode: 'ramp' } },
  },
  cutMineral: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    antialias: false,
    palette: {
      generate: [{ base: '#667ca8', steps: 6, hueShift: -24, satCurve: 'arch' }],
    },
    layers: [
      {
        id: 'facet',
        source: { kind: 'sdf.polygon', center: [0, 0], n: 6, r: 0.68, rotation: 30 },
        height: {
          kind: 'mix',
          a: { kind: 'gradient.linear', angle: -38, from: -0.72, to: 0.72 },
          b: { kind: 'noise.value', freq: 4 },
          t: 0.22,
        },
        material: 0,
      },
    ],
    shade: {
      light: [-0.58, -0.72, 0.5],
      strength: 0.62,
      ambient: 0.34,
      rim: 0.16,
      relief: 0.62,
      ao: { radius: 0.05, strength: 0.35 },
    },
    post: {
      outline: { px: 1, mode: 'outside', colorIndex: 0 },
      dither: { kind: 'bayer4', amount: 0.08 },
      quantize: { mode: 'ramp' },
    },
  },
  structureGrid: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    tileable: true,
    antialias: false,
    palette: {
      generate: [{ base: '#796b61', steps: 5, hueShift: -8, satCurve: 'flat' }],
    },
    layers: [
      {
        id: 'grid',
        source: { kind: 'const', value: 1 },
        height: {
          kind: 'mix',
          a: {
            kind: 'invert',
            input: { kind: 'pattern.grid', freq: 5, thickness: 0.14 },
          },
          b: { kind: 'noise.value', freq: 10 },
          t: 0.16,
        },
        material: 0,
      },
    ],
    shade: { light: [-0.6, -0.75, 0.48], strength: 0.48, ambient: 0.4, relief: 0.35 },
    post: { dither: { kind: 'bayer4', amount: 0.06 }, quantize: { mode: 'ramp' } },
  },
  softGlow: {
    schemaVersion: 1,
    size: [64, 64],
    seed: 1337,
    antialias: true,
    palette: {
      generate: [
        { base: '#a96fd1', steps: 8, hueShift: -18, satCurve: 'rise', name: 'core' },
        { base: '#59408f', steps: 7, hueShift: -24, satCurve: 'rise', name: 'halo' },
      ],
    },
    layers: [
      {
        id: 'halo',
        source: { kind: 'gradient.radial', center: [0, 0], radius: 0.92 },
        height: { kind: 'gradient.radial', center: [-0.12, -0.16], radius: 1.05 },
        opacity: 0.62,
        material: 1,
      },
      {
        id: 'core',
        source: { kind: 'sdf.star', center: [0, 0], n: 8, rOuter: 0.68, rInner: 0.34 },
        height: {
          kind: 'mix',
          a: { kind: 'gradient.radial', center: [-0.12, -0.16], radius: 0.92 },
          b: { kind: 'noise.value', freq: 5 },
          t: 0.2,
        },
        material: 0,
      },
    ],
    shade: { light: [-0.4, -0.6, 0.65], strength: 0.52, ambient: 0.45, rim: 0.3, relief: 0.24 },
    post: { quantize: { mode: 'nearest' } },
  },
};

/** Katalog içinde kategori, etiket ve serbest niyet metniyle arama. */
export function findVisualPresets(query: FindVisualPresetsQuery = {}): VisualPresetId[] {
  const wantedTags = (query.tags ?? []).map(normalizeSearchText);
  const terms = tokenize(query.text ?? '');

  return (Object.entries(VISUAL_PRESET_CATALOG) as Array<[VisualPresetId, VisualPresetMetadata]>)
    .filter(([, metadata]) => {
      if (query.category && metadata.category !== query.category) return false;
      if (
        wantedTags.length > 0 &&
        !wantedTags.some((tag) =>
          metadata.tags.some((candidate) => normalizeSearchText(candidate) === tag),
        )
      ) {
        return false;
      }
      return terms.length === 0 || scorePreset(metadata, terms) > 0;
    })
    .sort((a, b) => scorePreset(b[1], terms) - scorePreset(a[1], terms))
    .map(([id]) => id);
}

/** Başlangıç belgesini bağımsız bir kopya olarak üretir. */
export function createVisualPreset(
  id: VisualPresetId,
  options: CreateVisualPresetOptions = {},
): SpriteDoc {
  const source = DOCUMENTS[id];
  if (!source) throw new Error(`Bilinmeyen görsel preseti: ${String(id)}`);
  const doc = JSON.parse(JSON.stringify(source)) as SpriteDoc;
  const size = options.size ?? doc.size;
  return {
    ...doc,
    size: typeof size === 'number' ? [size, size] : [size[0], size[1]],
    seed: options.seed ?? doc.seed,
  };
}

function tokenize(text: string): string[] {
  return normalizeSearchText(text)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
}

function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i');
}

function scorePreset(metadata: VisualPresetMetadata, terms: readonly string[]): number {
  if (terms.length === 0) return 0;
  const tags = metadata.tags.map(normalizeSearchText);
  const category = normalizeSearchText(metadata.category);
  const prose = normalizeSearchText(`${metadata.description} ${metadata.useCase}`);
  let score = 0;
  for (const term of terms) {
    if (tags.some((tag) => tag === term)) score += 6;
    else if (tags.some((tag) => tag.includes(term) || term.includes(tag))) score += 3;
    if (category === term) score += 5;
    if (prose.includes(term)) score += 1;
  }
  return score;
}
