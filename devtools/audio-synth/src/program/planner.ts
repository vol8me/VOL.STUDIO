import type { AcousticBriefV1 } from './brief';
import { materialById } from './materials';
import {
  MATERIAL_TERMS,
  MECHANISM_TERMS,
  MECHANISMS,
  mechanismStatus,
  ONTOLOGY_VERSION,
  type MechanismStatus,
  type MechanismV1,
} from './ontology';
import type { LayerRole } from './roles';
import { resolveProgram } from './schema';

/**
 * ProgramPlanner — brief'i ontoloji mekanizmalarına ayırır ve registry'den
 * AÇIKLANABİLİR bir başlangıç topolojisi önerir. Yaratıcı karar vermez; LLM
 * de gerekmez: mekanizmalar brief'in beyanından (`mechanisms`) ve ontolojinin
 * terim sözlüğünden (betimleyiciler + başlık + niyet) deterministik
 * çıkarılır. Sağlayıcısı olmayan mekanizma `unsupported` olarak raporlanır
 * ve başka bir yapı taşıyla TAKLİT EDİLMEZ. Her önerilen katman gerekçesini
 * (`rationale`) programa taşır; agent iskeleti düzenler, gerekçe kalır.
 */
export const PROGRAM_PLAN_SCHEMA = 'ProgramPlanV1';

export const STYLE_TERMS: readonly (readonly [string, string])[] = [
  ['arcade', 'arcade'],
  ['industrial', 'industrial'],
  ['endüstriyel', 'industrial'],
  ['cinematic', 'cinematic'],
  ['sinematik', 'cinematic'],
  ['lo-fi', 'lo-fi'],
  ['lofi', 'lo-fi'],
  ['retro', 'retro-digital'],
  ['realistic', 'realistic-heavy'],
  ['gerçekçi', 'realistic-heavy'],
  ['minimal', 'minimal'],
  ['toy', 'toy-like'],
  ['oyuncak', 'toy-like'],
  ['brutal', 'brutal'],
  ['soft', 'soft'],
  ['yumuşak', 'soft'],
  ['organic', 'organic'],
  ['organik', 'organic'],
  ['sci-fi', 'clean-sci-fi'],
  ['bilimkurgu', 'clean-sci-fi'],
];

export interface PlannedMechanismV1 {
  readonly id: string;
  readonly status: MechanismStatus;
  readonly role: LayerRole;
  /** Nereden geldi: `declared` (brief) ya da `term:<sözcük>`. */
  readonly sources: readonly string[];
  readonly providers: readonly string[];
  readonly pipelines: readonly string[];
}

export interface PlannedLayerV1 {
  readonly name: string;
  readonly role: LayerRole;
  readonly mechanism: string;
  readonly chain: readonly string[];
  readonly rationale: string;
}

interface DraftLayer extends PlannedLayerV1 {
  readonly params: Record<string, unknown>;
  readonly resonatorParams: readonly Readonly<Record<string, unknown>>[];
}

export interface ProgramPlanV1 {
  readonly schema: typeof PROGRAM_PLAN_SCHEMA;
  readonly ontologyVersion: number;
  readonly brief: { readonly id: string; readonly subtype: string };
  readonly mechanisms: readonly PlannedMechanismV1[];
  readonly unsupported: readonly string[];
  readonly pipelines: readonly string[];
  readonly layers: readonly PlannedLayerV1[];
  readonly style: string | null;
  readonly styleSuggestions: readonly string[];
  readonly material: string | null;
  /** Önerilen topolojinin render edilebilir iskeleti (desteklenen katman yoksa `null`). */
  readonly skeleton: Record<string, unknown> | null;
}

/** Küçük harf (Türkçe büyük İ/I düzeltmeli), NFC, harf/rakam/tire dışı ayraç. */
export function tokenize(text: string): string[] {
  return text
    .replace(/İ/g, 'i')
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((t) => t.length > 0);
}

function containsPhrase(tokens: readonly string[], phrase: string): boolean {
  const words = tokenize(phrase);
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, k) => tokens[i + k] === w)) return true;
  }
  return false;
}

function briefTokens(brief: AcousticBriefV1): string[] {
  return tokenize([brief.title, brief.intent, ...(brief.descriptors ?? [])].join(' '));
}

function matchMechanisms(brief: AcousticBriefV1): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (id: string, source: string) => {
    const list = found.get(id) ?? [];
    if (!list.includes(source)) list.push(source);
    found.set(id, list);
  };
  for (const id of brief.mechanisms ?? []) add(id, 'declared');
  const tokens = briefTokens(brief);
  for (const [term, ids] of MECHANISM_TERMS) {
    if (containsPhrase(tokens, term)) for (const id of ids) add(id, `term:${term}`);
  }
  return found;
}

function materialOf(brief: AcousticBriefV1, tokens: readonly string[]): string | null {
  if (brief.material) return brief.material;
  const hit = MATERIAL_TERMS.find(([term]) => tokens.includes(term));
  return hit && materialById(hit[1]) ? hit[1] : null;
}

function layerParams(mechanism: MechanismV1, material: string | null): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(mechanism.recipe?.params ?? {}) };
  if (!material) return params;
  if (mechanism.recipe?.source === 'source.contact') params.materialB = material;
  if (mechanism.recipe?.source === 'source.friction') params.material = material;
  return params;
}

const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  ...(Object.keys(params).length > 0 ? { params } : {}),
});

function skeletonOf(
  brief: AcousticBriefV1,
  layers: readonly DraftLayer[],
  space: string | null,
  style: string | null,
): Record<string, unknown> | null {
  if (layers.length === 0) return null;
  const { min, max } = brief.durationSeconds;
  const target = Math.min(max, Math.max(min, Number(((min + max) / 2).toFixed(3))));
  const crossfade = brief.loop ? Number(Math.min(0.5, target / 4).toFixed(3)) : 0;
  const rolesWithTail = new Set<LayerRole>(['transient', 'body', 'mechanism']);
  return {
    schema: 'AcousticProgramV1',
    description: `ProgramPlanner iskeleti: ${brief.id}`,
    sampleRate: 48000,
    channels: brief.channels,
    durationSeconds: Number((target + crossfade).toFixed(3)),
    seed: 1,
    layers: layers.map((layer) => {
      const [source, ...rest] = layer.chain;
      const articulation = rest.find((id) => id.startsWith('articulation.'));
      const resonators = rest.filter((id) => id.startsWith('resonator.'));
      return {
        name: layer.name,
        role: layer.role,
        mechanism: layer.mechanism,
        rationale: layer.rationale,
        source: node(source, layer.params),
        ...(resonators.length > 0
          ? {
              resonators: resonators.map((id, i) =>
                node(id, { ...(layer.resonatorParams[i] ?? {}) }),
              ),
            }
          : {}),
        ...(articulation ? { articulation: node(articulation) } : {}),
        gainDb: -6,
        ...(space && rolesWithTail.has(layer.role)
          ? { sends: [{ bus: 'space', levelDb: -12 }] }
          : {}),
      };
    }),
    ...(space
      ? {
          buses: {
            space: { effects: [node(space, space === 'effect.reverb' ? { amount: 1 } : {})] },
          },
        }
      : {}),
    ...(style ? { style: { profile: style, version: 1 } } : {}),
    master: brief.loop
      ? { normalize: 'peak', peakDbfs: -3, loop: { crossfadeSeconds: crossfade } }
      : { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.02 },
  };
}

export function planBrief(brief: AcousticBriefV1): ProgramPlanV1 {
  const matched = matchMechanisms(brief);
  const tokens = briefTokens(brief);
  const material = materialOf(brief, tokens);
  const style = brief.style ?? null;
  const mechanisms: PlannedMechanismV1[] = [];
  const layers: DraftLayer[] = [];
  let space: string | null = null;
  for (const mechanism of MECHANISMS) {
    const sources = matched.get(mechanism.id);
    if (!sources) continue;
    const status = mechanismStatus(mechanism);
    mechanisms.push({
      id: mechanism.id,
      status,
      role: mechanism.role,
      sources,
      providers: [...mechanism.providers].sort(),
      pipelines: mechanism.pipelines ?? [],
    });
    const recipe = mechanism.recipe;
    if (status !== 'supported' || !recipe) continue;
    if (recipe.busEffect) {
      space ??= recipe.busEffect;
      continue;
    }
    if (!recipe.source) continue;
    const chain = [
      recipe.source,
      ...(recipe.resonators ?? []),
      ...(recipe.articulation ? [recipe.articulation] : []),
    ];
    layers.push({
      name: mechanism.id,
      role: mechanism.role,
      mechanism: mechanism.id,
      chain,
      rationale: `${mechanism.description} (${sources.join(', ')})`,
      params: layerParams(mechanism, material),
      resonatorParams: recipe.resonatorParams ?? [],
    });
  }
  const skeleton = skeletonOf(brief, layers, space, style);
  if (skeleton) resolveProgram(skeleton);
  return {
    schema: PROGRAM_PLAN_SCHEMA,
    ontologyVersion: ONTOLOGY_VERSION,
    brief: { id: brief.id, subtype: brief.subtype },
    mechanisms,
    unsupported: mechanisms.filter((m) => m.status === 'unsupported').map((m) => m.id),
    pipelines: mechanisms.filter((m) => m.status === 'pipeline').map((m) => m.id),
    layers: layers.map(({ name, role, mechanism, chain, rationale }) => ({
      name,
      role,
      mechanism,
      chain,
      rationale,
    })),
    style,
    styleSuggestions: [
      ...new Set(STYLE_TERMS.filter(([t]) => containsPhrase(tokens, t)).map(([, id]) => id)),
    ],
    material,
    skeleton,
  };
}
