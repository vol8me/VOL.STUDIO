import { MASTER_BUS } from './routing';
import { resolveProgram, type ResolvedProgram } from './schema';

/**
 * SoundGraph izdüşümü: programın render ETMEDEN okunan topolojisi. Düğümler
 * katmanlar (yapı taşı zinciri + rol + mekanizma), bus'lar ve master; kenarlar
 * yönlendirme (`route`), send ve sidechain. Sıralama kimliğe göredir ve
 * parametre değerleri topolojiye girmez — aynı topolojide farklı ayarlar
 * (ya da farklı stil) aynı düğüm/kenar kümesini verir. Kanonik JSON'a
 * dökülüp özetlenmesi protokol katmanındadır (bu katman saf kalır).
 */
export const SOUND_GRAPH_SCHEMA = 'SoundGraphV1';

export interface SoundGraphNodeV1 {
  readonly id: string;
  readonly kind: 'layer' | 'bus' | 'master';
  readonly chain: readonly string[];
  readonly role?: string | null;
  readonly mechanism?: string | null;
  readonly rationale?: string | null;
  readonly routing?: 'series' | 'parallel';
  readonly channels?: 1 | 2;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
}

export interface SoundGraphEdgeV1 {
  readonly from: string;
  readonly to: string;
  readonly kind: 'route' | 'send' | 'sidechain';
}

export interface SoundGraphV1 {
  readonly schema: typeof SOUND_GRAPH_SCHEMA;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly durationSeconds: number;
  readonly nodes: readonly SoundGraphNodeV1[];
  readonly edges: readonly SoundGraphEdgeV1[];
  /** Rol → katman kimlikleri (ayrışım özeti; rolsüz katmanlar `unassigned`). */
  readonly roles: Readonly<Record<string, readonly string[]>>;
  readonly style: {
    readonly profile: string | null;
    readonly notApplied: readonly string[];
  } | null;
  readonly master: { readonly limiter: boolean };
}

const byId = <T extends { readonly id: string }>(a: T, b: T) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

const nodeId = (name: string) => (name === MASTER_BUS ? 'master' : `bus:${name}`);

export function graphOf(program: ResolvedProgram): SoundGraphV1 {
  const nodes: SoundGraphNodeV1[] = [];
  const edges: SoundGraphEdgeV1[] = [];
  const roles: Record<string, string[]> = {};
  for (const layer of program.layers) {
    const id = `layer:${layer.name}`;
    nodes.push({
      id,
      kind: 'layer',
      chain: [
        layer.source.entry.id,
        ...layer.resonators.map((r) => r.entry.id),
        ...(layer.articulation ? [layer.articulation.entry.id] : []),
        ...layer.inserts.map((e) => e.entry.id),
      ],
      role: layer.role,
      mechanism: layer.mechanism,
      rationale: layer.rationale,
      routing: layer.routing,
      channels: program.channels === 2 && layer.source.entry.renderStereo ? 2 : 1,
      startSeconds: layer.startSeconds,
      durationSeconds: layer.frames / program.sampleRate,
    });
    edges.push({ from: id, to: nodeId(layer.bus), kind: 'route' });
    for (const send of layer.sends) edges.push({ from: id, to: nodeId(send.bus), kind: 'send' });
    (roles[layer.role ?? 'unassigned'] ??= []).push(id);
  }
  for (const bus of program.buses) {
    const id = nodeId(bus.name);
    nodes.push({ id, kind: 'bus', chain: bus.effects.map((e) => e.entry.id) });
    edges.push({ from: id, to: nodeId(bus.output), kind: 'route' });
    for (const send of bus.sends) edges.push({ from: id, to: nodeId(send.bus), kind: 'send' });
    for (const effect of bus.effects) {
      if (!effect.sidechain) continue;
      const from =
        effect.sidechain.kind === 'bus'
          ? nodeId(effect.sidechain.name)
          : `layer:${effect.sidechain.name}`;
      edges.push({ from, to: id, kind: 'sidechain' });
    }
  }
  nodes.push({ id: 'master', kind: 'master', chain: program.effects.map((e) => e.entry.id) });
  for (const effect of program.effects) {
    if (!effect.sidechain) continue;
    const from =
      effect.sidechain.kind === 'bus'
        ? nodeId(effect.sidechain.name)
        : `layer:${effect.sidechain.name}`;
    edges.push({ from, to: 'master', kind: 'sidechain' });
  }
  const edgeKey = (e: SoundGraphEdgeV1) => `${e.from}|${e.to}|${e.kind}`;
  return {
    schema: SOUND_GRAPH_SCHEMA,
    sampleRate: program.sampleRate,
    channels: program.channels,
    durationSeconds: program.durationSeconds,
    nodes: nodes.sort(byId),
    edges: edges.sort((a, b) => (edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0)),
    roles: Object.fromEntries(
      Object.keys(roles)
        .sort()
        .map((role) => [role, roles[role].sort()]),
    ),
    style: program.style
      ? { profile: program.style.profile, notApplied: program.style.notApplied }
      : null,
    master: { limiter: program.master.limiter !== null },
  };
}

/** Program belgesinden (doğrulayarak) SoundGraph izdüşümü. */
export function soundGraph(program: unknown): SoundGraphV1 {
  return graphOf(resolveProgram(program));
}

/** Topoloji imzası: düğüm zincirleri + roller + kenarlar; zaman ve stil hariç. */
export function topologyOf(graph: SoundGraphV1) {
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      chain: n.chain,
      role: n.role ?? null,
    })),
    edges: graph.edges,
  };
}
