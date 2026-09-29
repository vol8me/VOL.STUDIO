import { AudioParamError } from '../guard/errors';
import { resolveDrum, type ResolvedDrum } from '../instruments/percussion/drum';
import { PRESET_CATALOG } from '../presets';
import { resolveBanks, type ResolvedZone } from '../program/sampleBank';
import { resolveSampleDecls, type SampleDeclV1 } from '../program/samples';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import {
  RETRO_TABLES,
  waveformFields,
  type RetroEnvelopeV1,
  type RetroOscillatorV1,
} from '../synthesis/retro';
import {
  INSTRUMENT_BACKEND_VERSIONS,
  LOCAL_INSTRUMENT_PREFIX,
  type InstrumentDefinitionV1,
  type InstrumentSourceKind,
  type InstrumentSourceV1,
  type RetroPatchV1,
  type VelocityResponseV1,
} from './instrumentDefinition';
import { INSTRUMENT_PREFIX, instrumentBasics, instrumentSurface, presetOf } from './instruments';
import { laneInstrument, type PaletteV1 } from './orchestration';
import type { LaneV1 } from './programTypes';
import { noteToMidi } from './tonal';
import type { Articulation, MusicRole } from './terms';

/**
 * Bestecilik sözleşmesinin çözülmüş hâli: `preset:` yerleşik enstrümanı da
 * `inst:` program tanımı da AYNI biçime iner; score, analiz ve ses planı
 * yalnız bunu okur. JSON'a yazılabilir (score'a gömülür).
 */
export interface ResolvedInstrumentV1 {
  readonly id: string;
  readonly role: MusicRole;
  readonly pitched: boolean;
  readonly range: { readonly lowMidi: number; readonly highMidi: number };
  readonly preferred: { readonly lowMidi: number; readonly highMidi: number };
  readonly transposition: number;
  readonly polyphony: number;
  readonly velocity: VelocityResponseV1;
  readonly releaseSeconds: number;
  readonly articulations: readonly Articulation[];
  readonly source: ResolvedSourceV1;
}

export interface ResolvedPieceV1 {
  readonly midi: number;
  readonly drum: Omit<ResolvedDrum, 'velocity' | 'seed'>;
  readonly choke: string | null;
  readonly gain: number;
}

export interface ResolvedRetroV1 {
  readonly osc: RetroOscillatorV1;
  readonly envelope: RetroEnvelopeV1;
  readonly arpeggio: { readonly semitones: readonly number[]; readonly rateHz: number } | null;
  readonly sweep: { readonly semitones: number; readonly seconds: number } | null;
  readonly vibrato: {
    readonly depthCents: number;
    readonly rateHz: number;
    readonly delaySeconds: number;
  } | null;
  readonly gain: number;
}

type SingleSource =
  | { readonly kind: 'preset'; readonly preset: string; readonly typicalSeconds: number }
  | {
      readonly kind: 'sampler';
      readonly bank: string;
      readonly zones: readonly ResolvedZone[];
      readonly samples: Readonly<Record<string, SampleDeclV1>>;
    }
  | { readonly kind: 'drum-kit'; readonly pieces: readonly ResolvedPieceV1[] }
  | ({ readonly kind: 'retro' } & ResolvedRetroV1);

export type ResolvedSourceV1 =
  | SingleSource
  | {
      readonly kind: 'layer';
      readonly layers: readonly {
        readonly source: SingleSource;
        readonly gain: number;
        readonly velocityLow: number;
        readonly velocityHigh: number;
      }[];
    };

/** Velocity yazılmamış notanın değeri; tepki bu noktada birim kazançtır. */
export const DEFAULT_VELOCITY = 0.8;
/** Yerleşik presetlerin velocity tepkisi (yalnız velocity YAZILDIĞINDA uygulanır). */
export const BUILTIN_VELOCITY: VelocityResponseV1 = { rangeDb: 18, brightness: 0 };

const RETRO_DEFAULT_ENVELOPE: RetroEnvelopeV1 = {
  attack: 0.002,
  decay: 0.08,
  sustain: 0.7,
  release: 0.05,
  steps: 0,
};

const dbToGain = (db: number) => Math.pow(10, db / 20);

/** `preset:<ad>` yerleşik enstrümanı: aralık ve rol katalogdan, artikülasyon ölçülen zarftan. */
export function builtinInstrument(id: string, path = 'instrument'): ResolvedInstrumentV1 {
  const preset = presetOf(id, path);
  const profile = instrumentBasics(id);
  const range = { lowMidi: profile.range.lowMidi, highMidi: profile.range.highMidi };
  return {
    id,
    role: profile.role,
    pitched: true,
    range,
    preferred: range,
    transposition: 0,
    polyphony: profile.polyphony.recommendedMax,
    velocity: BUILTIN_VELOCITY,
    releaseSeconds: 0,
    articulations: profile.articulations,
    source: { kind: 'preset', preset, typicalSeconds: profile.typical.durationSeconds },
  };
}

export function resolveRetro(patch: RetroPatchV1): ResolvedRetroV1 {
  const fields =
    patch.waveform === 'table-custom'
      ? { ...waveformFields('table-ramp-4bit'), table: patch.table ?? RETRO_TABLES['ramp-4bit'] }
      : waveformFields(patch.waveform);
  const duty = patch.duty ?? 0.5;
  return {
    osc: {
      ...fields,
      duty,
      dutyTo: patch.dutyTo ?? duty,
      dutySeconds: patch.dutySeconds ?? 0,
      noiseClockHz: patch.noiseClockHz ?? null,
      interpolate: patch.interpolate ?? false,
      syncRatio: patch.sync ?? 1,
      bits: patch.bits ?? 0,
      holdHz: patch.rateHz ?? 0,
    },
    envelope: { ...RETRO_DEFAULT_ENVELOPE, ...(patch.envelope ?? {}) },
    arpeggio: patch.arpeggio ?? null,
    sweep: patch.sweep ?? null,
    vibrato: patch.vibrato
      ? { ...patch.vibrato, delaySeconds: patch.vibrato.delaySeconds ?? 0 }
      : null,
    gain: patch.gain ?? 0.5,
  };
}

export interface SampleContext {
  readonly samples: ReadonlyMap<string, SampleDeclV1>;
  readonly banks: ReadonlyMap<string, readonly ResolvedZone[]>;
}

function resolveSingle(
  source: Exclude<InstrumentSourceV1, { kind: 'layer' }>,
  path: string,
  context: SampleContext,
): SingleSource {
  switch (source.kind) {
    case 'preset':
      return {
        kind: 'preset',
        preset: source.preset,
        typicalSeconds: PRESET_CATALOG[source.preset]?.typicalDuration ?? 1,
      };
    case 'sampler': {
      const zones = context.banks.get(source.bank);
      if (!zones) {
        throw new AudioParamError(
          `${path}.bank`,
          'unknown-id',
          'programın `banks` bildiriminde yok',
          source.bank,
        );
      }
      const names = [...new Set(zones.map((z) => z.sample))].sort();
      return {
        kind: 'sampler',
        bank: source.bank,
        zones,
        samples: Object.fromEntries(
          names.map((name) => [name, context.samples.get(name) as SampleDeclV1]),
        ),
      };
    }
    case 'drum-kit':
      return {
        kind: 'drum-kit',
        pieces: source.pieces.map((piece, i) => {
          const {
            velocity: _v,
            seed: _s,
            ...drum
          } = resolveDrum(
            { model: piece.model, ...(piece.macros ?? {}) },
            `${path}.pieces[${i}].macros`,
          );
          return {
            midi: noteToMidi(piece.note),
            drum,
            choke: piece.choke ?? null,
            gain: dbToGain(piece.gainDb ?? 0),
          };
        }),
      };
    case 'retro':
      return { kind: 'retro', ...resolveRetro(source.patch) };
  }
}

function kitRange(source: InstrumentSourceV1): { lowMidi: number; highMidi: number } | null {
  if (source.kind !== 'drum-kit') return null;
  const keys = source.pieces.map((p) => noteToMidi(p.note));
  return { lowMidi: Math.min(...keys), highMidi: Math.max(...keys) };
}

export function resolveDefinition(
  definition: InstrumentDefinitionV1,
  path: string,
  context: SampleContext,
): ResolvedInstrumentV1 {
  const { source } = definition;
  const range = kitRange(source) ?? {
    lowMidi: noteToMidi((definition.range as readonly [string, string])[0]),
    highMidi: noteToMidi((definition.range as readonly [string, string])[1]),
  };
  const preferred = definition.preferred
    ? {
        lowMidi: noteToMidi(definition.preferred[0]),
        highMidi: noteToMidi(definition.preferred[1]),
      }
    : range;
  return {
    id: `${LOCAL_INSTRUMENT_PREFIX}${definition.id}`,
    role: definition.role,
    pitched: source.kind !== 'drum-kit',
    range,
    preferred,
    transposition: definition.transposition ?? 0,
    polyphony: definition.polyphony,
    velocity: definition.velocity ?? { rangeDb: 0, brightness: 0 },
    releaseSeconds: definition.release?.seconds ?? 0,
    articulations: definition.articulations,
    source:
      source.kind === 'layer'
        ? {
            kind: 'layer',
            layers: source.layers.map((layer, i) => ({
              source: resolveSingle(layer.source, `${path}.source.layers[${i}].source`, context),
              gain: dbToGain(layer.gainDb ?? 0),
              velocityLow: layer.velocity?.[0] ?? 0,
              velocityHigh: layer.velocity?.[1] ?? 1,
            })),
          }
        : resolveSingle(source, `${path}.source`, context),
  };
}

/** Program tanımlarının tablosu; yerleşikler istendiğinde çözülür. */
export class InstrumentTable {
  private readonly builtins = new Map<string, ResolvedInstrumentV1>();

  constructor(readonly local: ReadonlyMap<string, ResolvedInstrumentV1>) {}

  get(id: string, path = 'instrument'): ResolvedInstrumentV1 {
    if (id.startsWith(LOCAL_INSTRUMENT_PREFIX)) {
      const found = this.local.get(id);
      if (!found) {
        throw new AudioParamError(path, 'unknown-id', 'programın `instruments` listesinde yok', id);
      }
      return found;
    }
    if (!id.startsWith(INSTRUMENT_PREFIX)) {
      throw new AudioParamError(
        path,
        'type',
        `${INSTRUMENT_PREFIX}<ad> ya da ${LOCAL_INSTRUMENT_PREFIX}<kimlik> olmalı`,
        id,
      );
    }
    let hit = this.builtins.get(id);
    if (!hit) {
      hit = builtinInstrument(id, path);
      this.builtins.set(id, hit);
    }
    return hit;
  }
}

const TABLES = new WeakMap<object, InstrumentTable>();

/**
 * Programın enstrüman tablosu (nesne başına bir kez kurulur). Program
 * doğrulanmış varsayılır; sampler bankaları programın bildirimlerinden çözülür.
 */
export function programInstruments(program: {
  readonly instruments?: readonly InstrumentDefinitionV1[];
  readonly samples?: unknown;
  readonly banks?: unknown;
}): InstrumentTable {
  const cached = TABLES.get(program);
  if (cached) return cached;
  const samples = resolveSampleDecls(program.samples);
  const banks = resolveBanks(program.banks, samples, new Set());
  const local = new Map(
    (program.instruments ?? []).map((definition, i) => {
      const resolved = resolveDefinition(definition, `instruments[${i}]`, { samples, banks });
      return [resolved.id, resolved] as const;
    }),
  );
  const table = new InstrumentTable(local);
  TABLES.set(program, table);
  return table;
}

/** Kaynak türlerinin render yüzeyi: tanım programın içindedir, sürüm kodun. */
export function backendSurface(kind: InstrumentSourceKind): { id: string; hash: Sha256 } {
  const version = INSTRUMENT_BACKEND_VERSIONS[kind];
  return { id: `backend:${kind}`, hash: hashCanonical({ backend: kind, version }) };
}

/**
 * Manifest'te kayıtlı bir enstrüman yüzeyinin bugünkü karşılığı:
 * `backend:<tür>` kaynak sürümü, diğerleri yerleşik preset beyanı.
 */
export function recordedInstrumentSurface(id: string): { id: string; hash: Sha256 } {
  if (id.startsWith('backend:')) {
    const kind = id.slice('backend:'.length) as InstrumentSourceKind;
    if (!(kind in INSTRUMENT_BACKEND_VERSIONS)) {
      throw new AudioParamError('instrument', 'unknown-id', 'bilinmeyen kaynak türü', id);
    }
    return backendSurface(kind);
  }
  return instrumentSurface(id);
}

/** Programın şeritlerinin render yüzeyi: yerleşik preset beyanları + yerel kaynak sürümleri. */
export function programInstrumentSurfaces(
  program: Parameters<typeof programInstruments>[0] & {
    readonly lanes: readonly LaneV1[];
    readonly palettes?: readonly PaletteV1[];
    readonly orchestration?: { readonly palette: string };
  },
): { id: string; hash: Sha256 }[] {
  const table = programInstruments(program);
  const ids = new Set<string>();
  for (const lane of program.lanes) {
    const id = laneInstrument(program, lane);
    if (id.startsWith(LOCAL_INSTRUMENT_PREFIX)) {
      for (const kind of sourceKinds(table.get(id).source)) ids.add(`backend:${kind}`);
    } else ids.add(id);
  }
  return [...ids].sort().map(recordedInstrumentSurface);
}

export function sourceKinds(source: ResolvedSourceV1): InstrumentSourceKind[] {
  return source.kind === 'layer'
    ? ['layer', ...source.layers.map((layer) => layer.source.kind)]
    : [source.kind];
}
