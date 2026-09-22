import type { Random } from '@volstudio/core/random';
import { AudioParamError } from '../guard/errors';
import type { CausalEffect, ParamSpec, ResolvedParams } from './params';

/**
 * Registry: agent'a açılan her yapı taşının TEK kaynağı. Program
 * doğrulaması, render, maliyet tahmini, `audio:job context` ve governance
 * testi bu kayıtları okur; README'deki bir tablo kanonik değildir.
 */
export type RegistryKind =
  | 'source'
  | 'exciter'
  | 'resonator'
  | 'articulation'
  | 'effect'
  | 'curve'
  | 'modulator'
  | 'control'
  | 'archetype';

export interface NodeContext {
  readonly sampleRate: number;
  /** Düğümün işlediği tampon uzunluğu (örnek). */
  readonly frames: number;
  /** Düğüm yoluna bağlı, adla türeyen bağımsız alt akış. */
  readonly random: (label: string) => Random;
  /** Aynı alt akışın 32-bit tohumu (tohum alan mevcut üreteçler için). */
  readonly seed: (label: string) => number;
}

/** Maliyet tahmini için statik görünüm: otomasyonlu alan eğrisinin EN BÜYÜK değeriyle görünür. */
export type CostParams = Readonly<Record<string, number | string>>;

export interface ResourceModel {
  /** Agent'ın okuyacağı karmaşıklık özeti (ör. `O(kare·mod)`). */
  readonly model: string;
  /** Çerçeve başına iş birimi (≈10 ns, bkz. guard/budget). */
  readonly workPerFrame: (params: CostParams, automated: ReadonlySet<string>) => number;
  /** Düğümün render boyunca tuttuğu durum (bayt). */
  readonly stateBytes: (params: CostParams, sampleRate: number) => number;
}

export interface Determinism {
  readonly stochastic: boolean;
  /** Düğümün açtığı alt akış etiketleri; `stochastic: false` ise boş. */
  readonly substreams: readonly string[];
}

interface EntryBase {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  readonly capabilities: readonly string[];
  readonly params: Readonly<Record<string, ParamSpec>>;
  readonly causal: readonly CausalEffect[];
  readonly determinism: Determinism;
  readonly resource: ResourceModel;
}

export interface SourceEntry extends EntryBase {
  readonly kind: 'source' | 'exciter';
  /** `out` sıfırlanmış gelir; kaynak onu yazar. */
  readonly render: (out: Float32Array, params: ResolvedParams, ctx: NodeContext) => void;
}

export interface ProcessorEntry extends EntryBase {
  readonly kind: 'resonator' | 'articulation';
  /** Mono tamponu yerinde işler. */
  readonly process: (buffer: Float32Array, params: ResolvedParams, ctx: NodeContext) => void;
}

export interface EffectEntry extends EntryBase {
  readonly kind: 'effect';
  /** Program kanallarını yerinde işler (1 ya da 2 kanal). */
  readonly process: (
    channels: readonly Float32Array[],
    params: ResolvedParams,
    ctx: NodeContext,
  ) => void;
}

export interface CurveEntry extends EntryBase {
  readonly kind: 'curve';
  /** `u ∈ [0, 1]` için `a → b` ara değeri. */
  readonly interpolate: (a: number, b: number, u: number) => number;
  /** Segment bu eğriyle tanımsızsa açıklama, değilse `null`. */
  readonly segmentIssue: (a: number, b: number) => string | null;
}

export type ProgramEntry = SourceEntry | ProcessorEntry | EffectEntry | CurveEntry;

const ENTRY_ID =
  /^(source|exciter|resonator|articulation|effect|curve|modulator|control|archetype)\.[a-z][a-z0-9-]*$/;

export class Registry<
  E extends { readonly id: string; readonly version: number; readonly kind: RegistryKind },
> {
  private readonly byId = new Map<string, E>();

  constructor(entries: readonly E[]) {
    for (const entry of entries) {
      if (!ENTRY_ID.test(entry.id) || !entry.id.startsWith(`${entry.kind}.`)) {
        throw new Error(`registry: kimlik türüyle eşleşmiyor: ${entry.id} (${entry.kind})`);
      }
      if (this.byId.has(entry.id)) throw new Error(`registry: yinelenen kimlik ${entry.id}`);
      this.byId.set(entry.id, entry);
    }
  }

  entries(): E[] {
    return [...this.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /**
   * Programdaki bir başvuruyu çözer. Kimlik yoksa `unknown-id`, sürüm
   * farklıysa `version`, tür beklenmiyorsa `type` — hepsi render'dan önce.
   */
  resolve<K extends E['kind']>(
    id: unknown,
    version: unknown,
    kinds: readonly K[],
    path: string,
  ): Extract<E, { kind: K }> {
    if (typeof id !== 'string') throw new AudioParamError(path, 'type', 'kimlik metni olmalı', id);
    const entry = this.byId.get(id);
    if (!entry) throw new AudioParamError(path, 'unknown-id', "registry'de yok", id);
    if (!(kinds as readonly string[]).includes(entry.kind)) {
      throw new AudioParamError(path, 'type', `beklenen tür: ${kinds.join(' | ')}`, id);
    }
    if (version !== entry.version) {
      throw new AudioParamError(
        `${path}@version`,
        'version',
        `${id} registry sürümü ${entry.version}; program başka bir sürümü istiyor`,
        version,
      );
    }
    return entry as Extract<E, { kind: K }>;
  }
}
