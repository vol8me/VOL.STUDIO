import {
  VISUAL_PRESET_CATALOG,
  createVisualPreset,
  findVisualPresets,
  type FieldNode,
  type PresetCategory,
  type SpriteDoc,
  type VisualPresetId,
} from '@volstudio/core/visual';
import { parseVisualIntent, type VisualIntentModifiers } from './parseIntent';

export type VisualObjectId = 'worm';

export interface VisualIntentRequest {
  readonly prompt: string;
  readonly current: SpriteDoc;
  /** Katalog kartına tıklanması, serbest metin eşleşmesinden daha açıktır. */
  readonly preset?: VisualPresetId;
}

export type VisualIntentResolution =
  | {
      readonly kind: 'object';
      readonly object: VisualObjectId;
      readonly doc: SpriteDoc;
      readonly category: PresetCategory;
    }
  | {
      readonly kind: 'preset';
      readonly preset: VisualPresetId;
      readonly doc: SpriteDoc;
      readonly category: PresetCategory;
    }
  | { readonly kind: 'modifiers'; readonly doc: SpriteDoc }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'empty' };

interface ObjectRecipe {
  readonly terms: readonly string[];
  readonly category: PresetCategory;
  readonly build: (current: SpriteDoc) => SpriteDoc;
}

const OBJECT_RECIPES: Record<VisualObjectId, ObjectRecipe> = {
  worm: {
    terms: ['solucan', 'worm', 'kurtçuk', 'kurtcuk', 'larva'],
    category: 'organic',
    build: createWormRecipe,
  },
};

/**
 * Kullanıcı niyetini tek ve denetlenebilir bir karar sırasıyla çözer.
 *
 * Bilinmeyen bir kelimeyi seçili tarife sessizce düşürmez: o davranış
 * arayüzün metni anladığı izlenimini veriyor fakat pikselde bir karşılığı
 * olmuyordu. Nesne sözlüğü, katalog ve evrensel değiştiriciler ayrı sonuç
 * türleriyle döner; çağıran hangi kararın uygulandığını açıkça gösterebilir.
 */
export function resolveVisualIntent(request: VisualIntentRequest): VisualIntentResolution {
  const prompt = request.prompt.trim();
  const modifiers = parseVisualIntent(prompt);

  if (request.preset) {
    const doc = applyModifiers(
      createVisualPreset(request.preset, {
        size: modifiers.size ?? request.current.size,
        seed: request.current.seed,
      }),
      modifiers,
    );
    return {
      kind: 'preset',
      preset: request.preset,
      doc,
      category: VISUAL_PRESET_CATALOG[request.preset].category,
    };
  }

  if (prompt.length === 0) return { kind: 'empty' };

  const object = findObject(prompt);
  if (object) {
    const recipe = OBJECT_RECIPES[object];
    return {
      kind: 'object',
      object,
      doc: applyModifiers(recipe.build(request.current), modifiers),
      category: recipe.category,
    };
  }

  const preset = findVisualPresets({ text: prompt })[0];
  if (preset) {
    const doc = applyModifiers(
      createVisualPreset(preset, {
        size: modifiers.size ?? request.current.size,
        seed: request.current.seed,
      }),
      modifiers,
    );
    return {
      kind: 'preset',
      preset,
      doc,
      category: VISUAL_PRESET_CATALOG[preset].category,
    };
  }

  if (hasModifiers(modifiers)) {
    return { kind: 'modifiers', doc: applyModifiers(request.current, modifiers) };
  }

  return { kind: 'unknown' };
}

function findObject(prompt: string): VisualObjectId | undefined {
  const normalized = normalize(prompt);
  return (Object.keys(OBJECT_RECIPES) as VisualObjectId[]).find((id) =>
    OBJECT_RECIPES[id].terms.some((term) => hasWord(normalized, normalize(term))),
  );
}

function hasModifiers(modifiers: VisualIntentModifiers): boolean {
  return (
    modifiers.size !== undefined || modifiers.color !== undefined || modifiers.finish !== undefined
  );
}

/** Her SpriteDoc'ta aynı anlama gelen küçük, güvenli değiştirici kümesi. */
export function applyModifiers(doc: SpriteDoc, modifiers: VisualIntentModifiers): SpriteDoc {
  let next = doc;
  if (modifiers.size) next = { ...next, size: [...modifiers.size] as [number, number] };

  const requests = next.palette.generate;
  if (modifiers.color && requests?.[0]) {
    const [first, ...rest] = requests;
    next = {
      ...next,
      palette: { generate: [{ ...first, base: modifiers.color }, ...rest] },
    };
  }

  if (modifiers.finish) {
    const smooth = modifiers.finish === 'smooth';
    next = {
      ...next,
      antialias: smooth,
      post: {
        ...next.post,
        dither: smooth ? null : next.post?.dither ?? { kind: 'bayer4', amount: 0.08 },
        quantize: { mode: smooth ? 'nearest' : 'ramp' },
      },
    };
  }
  return next;
}

/**
 * “Solucan” bir organik etikete indirgenmez; dört kapsülün birleşimi, baş,
 * göz ve tohumdan etkilenen hacim alanıyla ayrı bir prosedürel tariftir.
 */
function createWormRecipe(current: SpriteDoc): SpriteDoc {
  const body = union([
    { kind: 'sdf.capsule', a: [-0.72, 0.22], b: [-0.34, -0.08], r: 0.2 },
    { kind: 'sdf.capsule', a: [-0.36, -0.08], b: [0.02, 0.16], r: 0.22 },
    { kind: 'sdf.capsule', a: [0.02, 0.16], b: [0.38, -0.12], r: 0.21 },
    { kind: 'sdf.capsule', a: [0.36, -0.12], b: [0.64, -0.02], r: 0.23 },
    { kind: 'sdf.circle', center: [0.66, -0.02], r: 0.25 },
  ]);

  return {
    schemaVersion: 1,
    size: [current.size[0], current.size[1]],
    seed: current.seed,
    antialias: current.antialias ?? false,
    palette: {
      generate: [
        { base: '#a96878', steps: 6, hueShift: -12, satCurve: 'arch', name: 'body' },
        { base: '#29212e', steps: 3, hueShift: -8, satCurve: 'flat', name: 'eye' },
      ],
    },
    layers: [
      {
        id: 'body',
        source: body,
        height: {
          kind: 'mix',
          a: { kind: 'gradient.linear', angle: -72, from: -0.7, to: 0.65 },
          b: { kind: 'noise.value', freq: 7 },
          t: 0.18,
        },
        material: 0,
      },
      {
        id: 'eye',
        source: { kind: 'sdf.circle', center: [0.72, -0.09], r: 0.055 },
        height: { kind: 'gradient.radial', center: [0.7, -0.12], radius: 0.15 },
        material: 1,
      },
    ],
    shade: {
      light: [-0.55, -0.72, 0.52],
      strength: 0.58,
      ambient: 0.38,
      rim: 0.1,
      relief: 0.42,
      ao: { radius: 0.035, strength: 0.22 },
    },
    post: {
      outline: { px: 1, mode: 'outside', colorIndex: 0 },
      dither: current.antialias ? null : { kind: 'bayer4', amount: 0.06 },
      quantize: { mode: current.antialias ? 'nearest' : 'ramp' },
    },
  };
}

function union(nodes: readonly FieldNode[]): FieldNode {
  const [first, ...rest] = nodes;
  if (!first) throw new Error('Birleşim en az bir alan bekliyor');
  return rest.reduce<FieldNode>((a, b) => ({ kind: 'min', a, b }), first);
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i');
}

function hasWord(source: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(source);
}
