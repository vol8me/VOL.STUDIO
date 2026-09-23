import type { Random } from '@volstudio/core/random';
import { AudioParamError } from '../guard/errors';
import type { CausalEffect, ParamSpec, ResolvedParams } from './params';
import type { ResolvedZone } from './sampleBank';
import type { SampleData, SampleDeclV1 } from './samples';

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
  /** Yalnız sidechain alan efektlerde: detektörün dinlediği kanallar (bus/katman çıkışı). */
  readonly sidechain?: readonly Float32Array[];
  /** Programın `samples` bildirimindeki ada göre çözülmüş veri (yalnız sample kullanan programda). */
  readonly sample?: (name: string) => SampleData;
  /** Programın sampler bankası (ada göre çözülmüş bölgeler). */
  readonly bank?: (name: string) => readonly ResolvedZone[];
}

/** Kaynak kancalarının gördüğü çözüm bağlamı (veri yüklemeden). */
export interface SourceCheckContext {
  readonly channels: 1 | 2;
  readonly samples: ReadonlyMap<string, SampleDeclV1>;
  readonly banks: ReadonlyMap<string, readonly ResolvedZone[]>;
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
  /** Tampon uzunluğuyla büyüyen ara bellek (kare başına bayt; kanal başına). */
  readonly bytesPerFrame?: (params: CostParams) => number;
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
  /**
   * Varsayılanları KİMLİK olan (etkisiz: 0 dB bell) yapı taşlarının governance
   * yoklama noktası: "her parametre PCM'i değiştirir" denetimi varsayılanlar
   * yerine bu noktada yapılır; `channels: 2` ilintisiz stereo yoklama ister.
   */
  readonly probe?: {
    readonly params?: Readonly<Record<string, number | string>>;
    readonly channels?: 1 | 2;
    /** Efekt yoklama sinyali: durağan gürültü (varsayılan) ya da sönümlü darbe (atak + kuyruk). */
    readonly signal?: 'noise' | 'impulsive';
  };
}

export interface SourceEntry extends EntryBase {
  readonly kind: 'source' | 'exciter';
  /** `out` sıfırlanmış gelir; kaynak onu yazar. */
  readonly render: (out: Float32Array, params: ResolvedParams, ctx: NodeContext) => void;
  /**
   * Stereo programda iki kanal yazan kaynak (tanecik yerleşimi, stereo sample).
   * Tanımlıysa katman stereo olur: rezonatör/artikülasyon her kanalı ayrı
   * işler ve katman `pan` almaz. Mono programda `render` kullanılır.
   */
  readonly renderStereo?: (
    left: Float32Array,
    right: Float32Array,
    params: ResolvedParams,
    ctx: NodeContext,
  ) => void;
  /** `renderStereo` olan kaynakta katmanın gerçekten stereo olup olmadığı (verilmezse: her zaman). */
  readonly stereoFor?: (
    params: Readonly<Record<string, unknown>>,
    context: SourceCheckContext,
  ) => boolean;
  /** Çözüm anı yapısal denetimi (veri yüklemeden): sorun varsa açıklama, yoksa `null`. */
  readonly check?: (
    params: Readonly<Record<string, unknown>>,
    context: SourceCheckContext,
  ) => string | null;
}

export interface ProcessorEntry extends EntryBase {
  readonly kind: 'resonator' | 'articulation';
  /** Mono tamponu yerinde işler. */
  readonly process: (buffer: Float32Array, params: ResolvedParams, ctx: NodeContext) => void;
}

export interface EffectEntry extends EntryBase {
  readonly kind: 'effect';
  /** Zamana yayılan efekt (reverb, delay, konvolüsyon): katman insert'ine giremez, bus/send ister. */
  readonly timeBased: boolean;
  /** Doğrusal ve zamanla değişmez mi: stem paritesi yalnız doğrusal efektlerle korunur. */
  readonly linear: boolean;
  /** Detektörü başka bir bus/katmanı dinleyebilir mi (`sidechain` alanı). */
  readonly sidechain?: boolean;
  /** Program kanallarını yerinde işler (1 ya da 2 kanal). */
  readonly process: (
    channels: readonly Float32Array[],
    params: ResolvedParams,
    ctx: NodeContext,
  ) => void;
}

export interface CurveEntry extends EntryBase {
  readonly kind: 'curve';
  /** Noktalardan segment değerlendiricisi kurar (spline teğetleri burada bir kez hesaplanır). */
  readonly prepare: (
    points: readonly (readonly [number, number])[],
  ) => (segment: number, u: number) => number;
  /** Segment bu eğriyle tanımsızsa açıklama, değilse `null`. */
  readonly segmentIssue: (a: number, b: number) => string | null;
}

export interface ModulatorEntry extends EntryBase {
  readonly kind: 'modulator';
  /** `out`a [−1, 1] aralığında normalize modülasyon yazar (program zaman ekseni). */
  readonly render: (out: Float32Array, params: ResolvedParams, ctx: NodeContext) => void;
}

/**
 * Makro hedefi: kontrol değeri c ∈ [0, 1] (0.5 nötr) için `octaves` yasası
 * parametreyi 2^(span·(2c−1)) ile çarpar, `linear` yasası span·(2c−1)
 * ekler. `modulation-depth` hedefi programdaki bütün modülasyon
 * derinliklerini aynı yasayla ölçekler.
 */
export interface ControlTarget {
  readonly primitive: string;
  readonly param: string;
  readonly law: 'octaves' | 'linear';
  readonly span: number;
}

export interface ControlEntry extends EntryBase {
  readonly kind: 'control';
  readonly targets: readonly ControlTarget[];
  readonly modulationDepth?: { readonly span: number };
}

/** Archetype'ın bir katmanındaki yapı taşı zinciri — yapısal sözleşme. */
export interface ArchetypeLayer {
  readonly layer: string;
  readonly chain: readonly string[];
}

/**
 * Preset'in ÜSTÜNDE bir aile tanımı: topoloji (katman → yapı taşı zinciri),
 * makro uzayı ve deterministik varyasyon politikası. `expand` yalnız
 * program BELGESİ üretir; doğrulama ve render kanonik program yolundadır.
 */
export interface ArchetypeEntry extends EntryBase {
  readonly kind: 'archetype';
  readonly topology: readonly ArchetypeLayer[];
  readonly macros: readonly string[];
  readonly variation: { readonly policy: string; readonly guaranteed: number };
  /** Parametre birleşimi yapısal olarak geçersizse açıklama, değilse `null`. */
  readonly constraint: (params: Readonly<Record<string, number>>) => string | null;
  readonly expand: (
    params: Readonly<Record<string, number>>,
    random: Random,
    sampleRate: number,
    profiles: ArchetypeProfiles,
  ) => Record<string, unknown>;
  /** İstekte kabul edilen profil türleri (stil/materyal); verilmeyen tür istekte reddedilir. */
  readonly profiles?: readonly ('style' | 'material')[];
}

/** Archetype isteğinin profil seçimleri: stil başvurusu ve gövde materyali. */
export interface ArchetypeProfiles {
  readonly style?: unknown;
  readonly material?: string;
}

export type ProgramEntry =
  | SourceEntry
  | ProcessorEntry
  | EffectEntry
  | CurveEntry
  | ModulatorEntry
  | ControlEntry
  | ArchetypeEntry;

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
