import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { PROGRAM_REGISTRY } from './catalog';
import type { ParamSpec } from './params';
import type { ProgramEntry } from './registry';
import type { ResolvedProgram } from './schema';

/**
 * Render yüzeyi: bir programın KULLANDIĞI düğümlerin PCM'i belirleyen
 * sözleşmesi — kimlik, sürüm, tür, parametre alanı ve varsayılanı, efekt
 * yönlendirmesi, archetype'ın genişletme verisi. Açıklama metni, nedensellik notu, kaynak modeli ve test
 * yoklama noktası DIŞARIDADIR: onlar değişince ses değişmez, özet de
 * değişmemelidir. Kullanılmayan bir düğümün eklenmesi de özeti oynatmaz.
 *
 * Manifest bunu kaydeder; `verify` düğüm düğüm karşılaştırıp PCM farkının
 * hangi düğümden geldiğini adıyla söyler.
 */
export const RENDER_SURFACE_SCHEME = 'render-surface-v1';

export interface NodeSurfaceV1 {
  readonly id: string;
  readonly version: number;
  readonly hash: Sha256;
}

export interface InstrumentSurfaceV1 {
  readonly id: string;
  readonly hash: Sha256;
}

export interface RenderSurfaceV1 {
  readonly scheme: typeof RENDER_SURFACE_SCHEME;
  readonly hash: Sha256;
  readonly nodes: readonly NodeSurfaceV1[];
  /** Müzik programlarında şeritlerin enstrüman beyanları (preset'lerin sürümü yoktur). */
  readonly instruments?: readonly InstrumentSurfaceV1[];
}

function paramDomain(spec: ParamSpec): Record<string, unknown> {
  switch (spec.type) {
    case 'number':
      return {
        type: spec.type,
        min: spec.min,
        max: spec.max,
        default: spec.default,
        integer: spec.integer === true,
        automatable: spec.automatable === true,
        belowNyquist: spec.belowNyquist === true,
      };
    case 'choice':
      return { type: spec.type, choices: [...spec.choices], default: spec.default };
    case 'sample':
      return { type: spec.type, of: spec.of ?? 'sample' };
  }
}

/** Düğümün render'ı belirleyen izdüşümü; belge alanları bilinçli olarak yoktur. */
export function renderProjection(entry: ProgramEntry): Record<string, unknown> {
  return {
    id: entry.id,
    kind: entry.kind,
    version: entry.version,
    params: Object.fromEntries(
      Object.keys(entry.params)
        .sort()
        .map((name) => [name, paramDomain(entry.params[name])]),
    ),
    ...(entry.kind === 'effect'
      ? {
          routing: {
            timeBased: entry.timeBased,
            linear: entry.linear,
            sidechain: entry.sidechain === true,
          },
        }
      : {}),
    ...((entry.kind === 'source' || entry.kind === 'exciter') && entry.renderStereo
      ? { stereo: true }
      : {}),
    ...(entry.kind === 'control' ? { targets: entry.targets } : {}),
    ...(entry.kind === 'archetype'
      ? {
          expansion: {
            topology: entry.topology,
            macros: entry.macros,
            variation: entry.variation,
            profiles: entry.profiles ?? null,
          },
        }
      : {}),
  };
}

export function nodeSurface(id: string): NodeSurfaceV1 {
  const entry = PROGRAM_REGISTRY.get(id);
  return { id, version: entry.version, hash: hashCanonical(renderProjection(entry)) };
}

export function surfaceOf(
  ids: Iterable<string>,
  instruments?: readonly InstrumentSurfaceV1[],
): RenderSurfaceV1 {
  const nodes = [...new Set(ids)].sort().map(nodeSurface);
  const sortedInstruments = instruments
    ? [...instruments].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    : undefined;
  return {
    scheme: RENDER_SURFACE_SCHEME,
    hash: hashCanonical({ nodes, instruments: sortedInstruments ?? [] }),
    nodes,
    ...(sortedInstruments ? { instruments: sortedInstruments } : {}),
  };
}

/**
 * Bütün registry'nin render izdüşümü özeti. Açıklama ve yoklama metni
 * girmez; yeni bir düğüm eklemek ise onu değiştirir — programa özgü kanıt
 * `surfaceOf` ile manifest'e yazılır, bu özet yalnız motor yüzeyinin
 * sürüm etiketidir.
 */
export function registryRenderHash(): Sha256 {
  return hashCanonical(PROGRAM_REGISTRY.entries().map(renderProjection));
}

/**
 * Çözülmüş programın dokunduğu her düğüm: katman zinciri, bus ve master
 * efektleri, modülatörler ve (belgede yazılı) makro kontroller.
 */
export function programNodeIds(program: ResolvedProgram, document: unknown): string[] {
  const ids: string[] = [];
  for (const layer of program.layers) {
    ids.push(layer.source.entry.id);
    ids.push(...layer.resonators.map((node) => node.entry.id));
    if (layer.articulation) ids.push(layer.articulation.entry.id);
    ids.push(...layer.inserts.map((effect) => effect.entry.id));
  }
  for (const bus of program.buses) ids.push(...bus.effects.map((effect) => effect.entry.id));
  ids.push(...program.effects.map((effect) => effect.entry.id));
  ids.push(...(program.treatment?.chain ?? []).map((effect) => effect.entry.id));
  ids.push(...program.modulators.map((node) => node.entry.id));
  const controls = (document as { controls?: readonly { control?: unknown }[] }).controls ?? [];
  for (const control of controls) {
    if (typeof control.control === 'string') ids.push(control.control);
  }
  return ids;
}

export interface SurfaceChangeV1 {
  readonly id: string;
  readonly change: 'changed' | 'removed' | 'version';
  readonly detail: string;
}

/**
 * Kayıtlı yüzeyi bugünkü registry (ve verilirse bugünkü enstrüman
 * beyanları) ile düğüm düğüm karşılaştırır.
 */
export function compareSurface(
  recorded: RenderSurfaceV1,
  currentInstruments: readonly InstrumentSurfaceV1[] = [],
): SurfaceChangeV1[] {
  const changes: SurfaceChangeV1[] = [];
  for (const instrument of recorded.instruments ?? []) {
    const current = currentInstruments.find((i) => i.id === instrument.id);
    if (!current) {
      changes.push({ id: instrument.id, change: 'removed', detail: 'enstrüman kaydında yok' });
    } else if (current.hash !== instrument.hash) {
      changes.push({ id: instrument.id, change: 'changed', detail: 'enstrüman beyanı değişti' });
    }
  }
  for (const node of recorded.nodes) {
    if (!PROGRAM_REGISTRY.has(node.id)) {
      changes.push({ id: node.id, change: 'removed', detail: 'registry’de yok' });
      continue;
    }
    const entry = PROGRAM_REGISTRY.get(node.id);
    if (entry.version !== node.version) {
      changes.push({
        id: node.id,
        change: 'version',
        detail: `sürüm ${node.version} → ${entry.version}`,
      });
      continue;
    }
    if (hashCanonical(renderProjection(entry)) !== node.hash) {
      changes.push({
        id: node.id,
        change: 'changed',
        detail: 'aynı sürümde parametre alanı ya da varsayılan değişti',
      });
    }
  }
  return changes;
}
