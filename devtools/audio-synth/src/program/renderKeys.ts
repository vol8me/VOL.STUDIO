import { cacheKey } from '../engine/renderCache';
import type { RenderQuality } from '../kernel/session';
import type { Sha256 } from '../kernel/canonical';
import type { ResolvedGesture } from './bindings';
import type { ProgramEntry, ProcessorEntry, SourceEntry } from './registry';
import type { ResolvedEffect } from './routing';
import type { ResolvedLayer, ResolvedNode, ResolvedProgram, ResolvedValue } from './schema';

/**
 * Artımlı render'ın anahtarları. Her aşamanın anahtarı, bir önceki aşamanın
 * anahtarı ile kendi düğümünün kimliğinden (sürüm, alt akış yolu, parametre
 * değerleri, dinlediği modülatörlerin anahtarları) türer. Bir yaprak
 * parametresi değişince yalnız o aşamanın ve ardından gelenlerin anahtarı
 * değişir; öncekiler önbellekten gelir.
 */

export type LayerStage =
  | { readonly kind: 'source'; readonly node: ResolvedNode<SourceEntry> }
  | { readonly kind: 'series'; readonly node: ResolvedNode<ProcessorEntry> }
  | { readonly kind: 'parallel'; readonly nodes: readonly ResolvedNode<ProcessorEntry>[] }
  | { readonly kind: 'articulation'; readonly node: ResolvedNode<ProcessorEntry> }
  | { readonly kind: 'insert'; readonly node: ResolvedEffect };

export function layerStages(layer: ResolvedLayer): LayerStage[] {
  const stages: LayerStage[] = [{ kind: 'source', node: layer.source }];
  if (layer.routing === 'parallel' && layer.resonators.length > 0) {
    stages.push({ kind: 'parallel', nodes: layer.resonators });
  } else {
    for (const node of layer.resonators) stages.push({ kind: 'series', node });
  }
  if (layer.articulation) stages.push({ kind: 'articulation', node: layer.articulation });
  for (const node of layer.inserts) stages.push({ kind: 'insert', node });
  return stages;
}

function gestureKey(gesture: ResolvedGesture): unknown {
  return {
    name: gesture.name,
    curve: `${gesture.curve.id}@${gesture.curve.version}`,
    points: gesture.points,
  };
}

function valueKey(value: ResolvedValue): unknown {
  if (typeof value !== 'object') return value;
  return {
    base: typeof value.base === 'number' ? value.base : gestureKey(value.base),
    controls: value.controls.map((control) => ({
      ...control,
      value: typeof control.value === 'number' ? control.value : gestureKey(control.value),
    })),
    modulations: value.modulations,
  };
}

function nodeKey(node: ResolvedNode<ProgramEntry>): unknown {
  return {
    id: node.entry.id,
    version: node.entry.version,
    stream: node.streamPath,
    params: Object.fromEntries(
      Object.keys(node.params)
        .sort()
        .map((name) => [name, valueKey(node.params[name])]),
    ),
  };
}

function listenedModulators(node: ResolvedNode<ProgramEntry>): string[] {
  const names = new Set<string>();
  for (const value of Object.values(node.params)) {
    if (typeof value === 'object') for (const m of value.modulations) names.add(m.by);
  }
  return [...names].sort();
}

export interface ProgramKeys {
  readonly base: Sha256;
  readonly modulators: ReadonlyMap<string, Sha256>;
}

/** Programın bütün aşamalarının paylaştığı taban ve modülatör anahtarları. */
export function programKeys(
  program: ResolvedProgram,
  seed: number,
  quality: RenderQuality,
  rendererVersion: number,
): ProgramKeys {
  const depth = program.depthControl;
  const base = cacheKey({
    domain: 'program-stage',
    rendererVersion,
    quality,
    seed,
    sampleRate: program.sampleRate,
    frames: program.frames,
    depth: depth && {
      span: depth.span,
      value: typeof depth.value === 'number' ? depth.value : gestureKey(depth.value),
    },
    samples: [...program.samples.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    banks: [...program.banks.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
  });
  const modulators = new Map<string, Sha256>();
  for (const node of program.modulators) {
    const name = node.streamPath.slice('modulator:'.length);
    const listened = listenedModulators(node).map((by) => modulators.get(by) ?? by);
    modulators.set(name, cacheKey({ base, stage: 'modulator', node: nodeKey(node), listened }));
  }
  return { base, modulators };
}

function stageNodes(stage: LayerStage): readonly ResolvedNode<ProgramEntry>[] {
  return stage.kind === 'parallel' ? stage.nodes : [stage.node];
}

/** Katman aşamalarının zincirli anahtarları; sıra `layerStages` ile aynıdır. */
export function layerStageKeys(layer: ResolvedLayer, keys: ProgramKeys): Sha256[] {
  let previous: Sha256 = cacheKey({
    base: keys.base,
    layer: { frames: layer.frames, startFrame: layer.startFrame, channels: layer.channels },
  });
  return layerStages(layer).map((stage) => {
    const nodes = stageNodes(stage);
    previous = cacheKey({
      previous,
      stage: stage.kind,
      nodes: nodes.map(nodeKey),
      modulators: [...new Set(nodes.flatMap(listenedModulators))]
        .sort()
        .map((name) => keys.modulators.get(name) ?? name),
    });
    return previous;
  });
}

/** Bütün programın anahtarı; belge kanonik JSON değilse önbellek kullanılmaz. */
export function programRootKey(
  document: unknown,
  seed: number,
  quality: RenderQuality,
  rendererVersion: number,
): Sha256 | null {
  try {
    return cacheKey({ domain: 'program', rendererVersion, quality, seed, document });
  } catch {
    return null;
  }
}
