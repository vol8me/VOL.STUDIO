import { AudioParamError } from '../guard/errors';
import {
  checkArray,
  checkChoice,
  checkNumber,
  checkObject,
  readNumber,
  type ParamObject,
} from '../guard/read';
import { DRUM_MODELS, type DrumModel } from '../instruments/percussion/drum';
import { callablePresetNames } from '../presets';
import { RETRO_WAVEFORMS, type RetroWaveform } from '../synthesis/retro';
import { checkSupportedArticulations } from './articulation';
import { noteToMidi } from './tonal';
import {
  MUSIC_KEY,
  MUSIC_ROLES,
  checkPattern,
  checkText,
  type Articulation,
  type MusicRole,
} from './terms';

/**
 * Bestecinin gördüğü enstrüman sözleşmesi: aralık, tercih edilen register,
 * transpozisyon, polifoni, velocity tepkisi, bırakma, artikülasyon ve rol.
 * Kaynak (preset, sampler, davul kiti, retro, katman) bu sözleşmenin
 * ARKASINDADIR: aynı nota/olay verisi hangi kaynağa giderse gitsin aynı
 * anlamı taşır ve besteci kaynağı bilmek zorunda değildir.
 *
 * Aralıklar SESLENEN perdedir; yazılan nota + `transposition` = seslenen.
 */
export const LOCAL_INSTRUMENT_PREFIX = 'inst:';
export const INSTRUMENT_SOURCE_KINDS = ['preset', 'sampler', 'drum-kit', 'retro', 'layer'] as const;
export type InstrumentSourceKind = (typeof INSTRUMENT_SOURCE_KINDS)[number];

/** Kaynağın render'da gerçekten uyguladığı artikülasyonlar. */
export const SOURCE_ARTICULATIONS: Readonly<Record<InstrumentSourceKind, readonly Articulation[]>> =
  {
    preset: [
      'sustain',
      'staccato',
      'legato',
      'tie',
      'let-ring',
      'accent',
      'ghost',
      'mute',
      'slide',
    ],
    sampler: ['sustain', 'staccato', 'legato', 'tie', 'let-ring', 'accent', 'ghost'],
    'drum-kit': ['let-ring', 'accent', 'ghost', 'mute'],
    retro: ['sustain', 'staccato', 'legato', 'tie', 'accent', 'ghost', 'slide'],
    layer: [],
  };

/** Kaynak sürümü: DSP anlamı değişince artar; render yüzeyi kaydına girer. */
export const INSTRUMENT_BACKEND_VERSIONS: Readonly<Record<InstrumentSourceKind, number>> = {
  preset: 1,
  sampler: 1,
  'drum-kit': 1,
  retro: 1,
  layer: 1,
};

export const MAX_INSTRUMENTS = 16;
const MAX_KIT_PIECES = 32;
const MAX_LAYERS = 4;

export interface VelocityResponseV1 {
  /** Velocity 0 ile 1 arasındaki seviye farkı (dB); 0 → velocity seviyeyi değiştirmez. */
  readonly rangeDb: number;
  /** Velocity'nin tınıyı açma payı (0–1); yalnız alçak geçirenli preset kaynağında. */
  readonly brightness: number;
}

export interface DrumMacrosV1 {
  readonly tune?: number;
  readonly decay?: number;
  readonly tone?: number;
  readonly attack?: number;
  readonly noise?: number;
  readonly drive?: number;
  readonly open?: number;
  readonly level?: number;
}

export interface DrumPieceV1 {
  /** Bestecinin yazdığı tuş (ör. `C2`); kit perdesizdir, tuş parçayı seçer. */
  readonly note: string;
  readonly model: DrumModel;
  readonly macros?: DrumMacrosV1;
  /** Aynı gruptaki yeni vuruş öncekini keser (açık/kapalı hat). */
  readonly choke?: string;
  readonly gainDb?: number;
}

export interface RetroPatchV1 {
  readonly waveform: RetroWaveform | 'table-custom';
  readonly table?: readonly number[];
  readonly interpolate?: boolean;
  readonly duty?: number;
  readonly dutyTo?: number;
  readonly dutySeconds?: number;
  readonly noiseClockHz?: number;
  readonly sync?: number;
  readonly bits?: number;
  readonly rateHz?: number;
  readonly envelope?: {
    readonly attack?: number;
    readonly decay?: number;
    readonly sustain?: number;
    readonly release?: number;
    readonly steps?: number;
  };
  readonly arpeggio?: { readonly semitones: readonly number[]; readonly rateHz: number };
  readonly sweep?: { readonly semitones: number; readonly seconds: number };
  readonly vibrato?: {
    readonly depthCents: number;
    readonly rateHz: number;
    readonly delaySeconds?: number;
  };
  readonly gain?: number;
}

export type InstrumentSourceV1 =
  | { readonly kind: 'preset'; readonly preset: string }
  | { readonly kind: 'sampler'; readonly bank: string }
  | { readonly kind: 'drum-kit'; readonly pieces: readonly DrumPieceV1[] }
  | { readonly kind: 'retro'; readonly patch: RetroPatchV1 }
  | {
      readonly kind: 'layer';
      readonly layers: readonly {
        readonly source: Exclude<InstrumentSourceV1, { kind: 'layer' }>;
        readonly gainDb?: number;
        readonly velocity?: readonly [number, number];
      }[];
    };

export interface InstrumentDefinitionV1 {
  readonly id: string;
  readonly description?: string;
  readonly role: MusicRole;
  /** Seslenen aralık `[en pes, en tiz]`; davul kitinde parçalardan türer. */
  readonly range?: readonly [string, string];
  readonly preferred?: readonly [string, string];
  readonly transposition?: number;
  readonly polyphony: number;
  readonly velocity?: VelocityResponseV1;
  /** Kapı kapandıktan sonraki bırakma (sampler; retro kendi zarfının `release`ini kullanır). */
  readonly release?: { readonly seconds: number };
  readonly articulations: readonly Articulation[];
  readonly source: InstrumentSourceV1;
}

const UNIT = { min: 0, max: 1 } as const;

function checkRange(value: unknown, path: string): [string, string] {
  const pair = checkArray(value, path);
  if (pair.length !== 2) throw new AudioParamError(path, 'type', '[en pes, en tiz]', pair.length);
  const low = checkText(pair[0], `${path}[0]`, 8);
  const high = checkText(pair[1], `${path}[1]`, 8);
  if (noteToMidi(high, `${path}[1]`) < noteToMidi(low, `${path}[0]`)) {
    throw new AudioParamError(path, 'range', 'tiz uç pes uçtan aşağıda olamaz', pair);
  }
  return [low, high];
}

function checkMacros(value: unknown, path: string, model: DrumModel): DrumMacrosV1 {
  const o = checkObject(value, path, [
    'tune',
    'decay',
    'tone',
    'attack',
    'noise',
    'drive',
    'open',
    'level',
  ]);
  if (o.open !== undefined && model !== 'hat') {
    throw new AudioParamError(`${path}.open`, 'combination', 'açıklık yalnız hat içindir', o.open);
  }
  const out: Record<string, number> = {};
  const rules: Record<string, { min?: number; max?: number; above?: number }> = {
    tune: { min: -24, max: 24 },
    noise: { min: 0, max: 2 },
    level: { above: 0, max: 1 },
  };
  for (const [key, raw] of Object.entries(o)) {
    if (raw === undefined) continue;
    out[key] = checkNumber(raw, `${path}.${key}`, rules[key] ?? UNIT);
  }
  return out as DrumMacrosV1;
}

function checkKit(o: ParamObject, path: string): InstrumentSourceV1 {
  const pieces = checkArray(o.pieces, `${path}.pieces`);
  if (pieces.length === 0 || pieces.length > MAX_KIT_PIECES) {
    throw new AudioParamError(
      `${path}.pieces`,
      'range',
      `1–${MAX_KIT_PIECES} parça`,
      pieces.length,
    );
  }
  const keys = new Set<number>();
  return {
    kind: 'drum-kit',
    pieces: pieces.map((raw, i): DrumPieceV1 => {
      const p = checkObject(raw, `${path}.pieces[${i}]`, [
        'note',
        'model',
        'macros',
        'choke',
        'gainDb',
      ]);
      const note = checkText(p.note, `${path}.pieces[${i}].note`, 8);
      const key = noteToMidi(note, `${path}.pieces[${i}].note`);
      if (keys.has(key)) {
        throw new AudioParamError(
          `${path}.pieces[${i}].note`,
          'combination',
          'tuş tekrar etti',
          note,
        );
      }
      keys.add(key);
      const model = checkChoice(p.model, `${path}.pieces[${i}].model`, DRUM_MODELS);
      return {
        note,
        model,
        ...(p.macros === undefined
          ? {}
          : { macros: checkMacros(p.macros, `${path}.pieces[${i}].macros`, model) }),
        ...(p.choke === undefined
          ? {}
          : { choke: checkPattern(p.choke, `${path}.pieces[${i}].choke`, MUSIC_KEY) }),
        ...(p.gainDb === undefined
          ? {}
          : {
              gainDb: checkNumber(p.gainDb, `${path}.pieces[${i}].gainDb`, { min: -48, max: 12 }),
            }),
      };
    }),
  };
}

function checkRetro(value: unknown, path: string): RetroPatchV1 {
  const o = checkObject(value, path, [
    'waveform',
    'table',
    'interpolate',
    'duty',
    'dutyTo',
    'dutySeconds',
    'noiseClockHz',
    'sync',
    'bits',
    'rateHz',
    'envelope',
    'arpeggio',
    'sweep',
    'vibrato',
    'gain',
  ]);
  const waveform = checkChoice(o.waveform, `${path}.waveform`, [
    ...RETRO_WAVEFORMS,
    'table-custom',
  ] as const);
  if ((waveform === 'table-custom') !== (o.table !== undefined)) {
    throw new AudioParamError(
      `${path}.table`,
      'combination',
      'tablo yalnız table-custom ile yazılır',
      o.table,
    );
  }
  const patch: Record<string, unknown> = { waveform };
  if (o.table !== undefined) {
    const table = checkArray(o.table, `${path}.table`);
    if (table.length < 4 || table.length > 64) {
      throw new AudioParamError(`${path}.table`, 'range', '4–64 değer', table.length);
    }
    patch.table = table.map((v, i) => checkNumber(v, `${path}.table[${i}]`, { min: -1, max: 1 }));
  }
  if (o.interpolate !== undefined) {
    if (typeof o.interpolate !== 'boolean') {
      throw new AudioParamError(`${path}.interpolate`, 'type', 'boolean', o.interpolate);
    }
    patch.interpolate = o.interpolate;
  }
  const numbers: Record<string, { min?: number; max?: number; above?: number; integer?: boolean }> =
    {
      duty: { min: 0.05, max: 0.95 },
      dutyTo: { min: 0.05, max: 0.95 },
      dutySeconds: { min: 0, max: 10 },
      noiseClockHz: { min: 50, max: 2_000_000 },
      sync: { min: 1, max: 8 },
      bits: { min: 2, max: 24, integer: true },
      rateHz: { min: 1000, max: 96000 },
      gain: { above: 0, max: 1 },
    };
  for (const [key, rule] of Object.entries(numbers)) {
    if (o[key] !== undefined) patch[key] = checkNumber(o[key], `${path}.${key}`, rule);
  }
  if (o.envelope !== undefined) {
    const e = checkObject(o.envelope, `${path}.envelope`, [
      'attack',
      'decay',
      'sustain',
      'release',
      'steps',
    ]);
    patch.envelope = {
      attack: readNumber(e, 'attack', `${path}.envelope`, { min: 0, max: 10 }, 0.002),
      decay: readNumber(e, 'decay', `${path}.envelope`, { min: 0, max: 10 }, 0.08),
      sustain: readNumber(e, 'sustain', `${path}.envelope`, UNIT, 0.7),
      release: readNumber(e, 'release', `${path}.envelope`, { min: 0, max: 10 }, 0.05),
      steps: readNumber(e, 'steps', `${path}.envelope`, { min: 0, max: 256, integer: true }, 0),
    };
  }
  if (o.arpeggio !== undefined) {
    const a = checkObject(o.arpeggio, `${path}.arpeggio`, ['semitones', 'rateHz']);
    const semitones = checkArray(a.semitones, `${path}.arpeggio.semitones`);
    if (semitones.length < 2 || semitones.length > 8) {
      throw new AudioParamError(
        `${path}.arpeggio.semitones`,
        'range',
        '2–8 adım',
        semitones.length,
      );
    }
    patch.arpeggio = {
      semitones: semitones.map((s, i) =>
        checkNumber(s, `${path}.arpeggio.semitones[${i}]`, { min: -24, max: 24, integer: true }),
      ),
      rateHz: checkNumber(a.rateHz, `${path}.arpeggio.rateHz`, { min: 1, max: 120 }),
    };
  }
  if (o.sweep !== undefined) {
    const s = checkObject(o.sweep, `${path}.sweep`, ['semitones', 'seconds']);
    patch.sweep = {
      semitones: checkNumber(s.semitones, `${path}.sweep.semitones`, { min: -48, max: 48 }),
      seconds: checkNumber(s.seconds, `${path}.sweep.seconds`, { above: 0, max: 10 }),
    };
  }
  if (o.vibrato !== undefined) {
    const v = checkObject(o.vibrato, `${path}.vibrato`, ['depthCents', 'rateHz', 'delaySeconds']);
    patch.vibrato = {
      depthCents: checkNumber(v.depthCents, `${path}.vibrato.depthCents`, { min: 0, max: 200 }),
      rateHz: checkNumber(v.rateHz, `${path}.vibrato.rateHz`, { above: 0, max: 20 }),
      delaySeconds: readNumber(v, 'delaySeconds', `${path}.vibrato`, { min: 0, max: 10 }, 0),
    };
  }
  return patch as unknown as RetroPatchV1;
}

function checkSource(value: unknown, path: string, nested: boolean): InstrumentSourceV1 {
  const head = checkObject(value, path, ['kind', 'preset', 'bank', 'pieces', 'patch', 'layers']);
  const kind = checkChoice(head.kind, `${path}.kind`, INSTRUMENT_SOURCE_KINDS);
  switch (kind) {
    case 'preset': {
      const o = checkObject(value, path, ['kind', 'preset']);
      const preset = checkText(o.preset, `${path}.preset`, 80);
      if (!callablePresetNames().includes(preset)) {
        throw new AudioParamError(
          `${path}.preset`,
          'unknown-id',
          'çağrılabilir bir preset olmalı',
          preset,
        );
      }
      return { kind, preset };
    }
    case 'sampler': {
      const o = checkObject(value, path, ['kind', 'bank']);
      return { kind, bank: checkText(o.bank, `${path}.bank`, 64) };
    }
    case 'drum-kit':
      return checkKit(checkObject(value, path, ['kind', 'pieces']), path);
    case 'retro':
      return {
        kind,
        patch: checkRetro(checkObject(value, path, ['kind', 'patch']).patch, `${path}.patch`),
      };
    case 'layer': {
      if (nested)
        throw new AudioParamError(`${path}.kind`, 'combination', 'katman iç içe olamaz', kind);
      const o = checkObject(value, path, ['kind', 'layers']);
      const layers = checkArray(o.layers, `${path}.layers`);
      if (layers.length < 2 || layers.length > MAX_LAYERS) {
        throw new AudioParamError(
          `${path}.layers`,
          'range',
          `2–${MAX_LAYERS} katman`,
          layers.length,
        );
      }
      return {
        kind,
        layers: layers.map((raw, i) => {
          const l = checkObject(raw, `${path}.layers[${i}]`, ['source', 'gainDb', 'velocity']);
          const source = checkSource(l.source, `${path}.layers[${i}].source`, true);
          if (source.kind === 'drum-kit') {
            throw new AudioParamError(
              `${path}.layers[${i}].source.kind`,
              'combination',
              'davul kiti katmana girmez (tuş parçayı seçer, perde değil)',
              source.kind,
            );
          }
          let velocity: [number, number] | undefined;
          if (l.velocity !== undefined) {
            const pair = checkArray(l.velocity, `${path}.layers[${i}].velocity`);
            if (pair.length !== 2) {
              throw new AudioParamError(
                `${path}.layers[${i}].velocity`,
                'type',
                '[alt, üst]',
                pair.length,
              );
            }
            const lo = checkNumber(pair[0], `${path}.layers[${i}].velocity[0]`, UNIT);
            velocity = [
              lo,
              checkNumber(pair[1], `${path}.layers[${i}].velocity[1]`, { min: lo, max: 1 }),
            ];
          }
          return {
            source: source as Exclude<InstrumentSourceV1, { kind: 'layer' }>,
            ...(l.gainDb === undefined
              ? {}
              : {
                  gainDb: checkNumber(l.gainDb, `${path}.layers[${i}].gainDb`, {
                    min: -48,
                    max: 12,
                  }),
                }),
            ...(velocity ? { velocity } : {}),
          };
        }),
      };
    }
  }
}

/** Kaynağın çalabildiği artikülasyonlar (katmanda kesişim). */
export function sourceArticulations(source: InstrumentSourceV1): readonly Articulation[] {
  if (source.kind !== 'layer') return SOURCE_ARTICULATIONS[source.kind];
  const sets = source.layers.map((layer) => SOURCE_ARTICULATIONS[layer.source.kind]);
  return sets[0].filter((a) => sets.every((set) => set.includes(a)));
}

function assertContract(definition: InstrumentDefinitionV1, path: string): void {
  const { source } = definition;
  const supported = sourceArticulations(source);
  for (const [i, articulation] of definition.articulations.entries()) {
    if (!supported.includes(articulation)) {
      throw new AudioParamError(
        `${path}.articulations[${i}]`,
        'unsupported',
        `${source.kind} kaynağı yalnız ${supported.join(', ')} çalar`,
        articulation,
      );
    }
  }
  const dynamic = definition.articulations.some((a) => a === 'accent' || a === 'ghost');
  if (dynamic && (definition.velocity?.rangeDb ?? 0) <= 0 && source.kind !== 'drum-kit') {
    throw new AudioParamError(
      `${path}.velocity.rangeDb`,
      'combination',
      'accent/ghost velocity tepkisi ister (rangeDb > 0)',
      definition.velocity?.rangeDb ?? 0,
    );
  }
  if ((definition.velocity?.brightness ?? 0) > 0 && source.kind !== 'preset') {
    throw new AudioParamError(
      `${path}.velocity.brightness`,
      'unsupported',
      'parlaklık tepkisi yalnız preset kaynağındadır (kit ve sampler velocity’yi kendisi yorumlar)',
      definition.velocity?.brightness,
    );
  }
  const sampled =
    source.kind === 'sampler' ||
    (source.kind === 'layer' && source.layers.some((layer) => layer.source.kind === 'sampler'));
  if (definition.release !== undefined && !sampled) {
    throw new AudioParamError(
      `${path}.release`,
      'combination',
      `${source.kind} kaynağı kendi zarfını kullanır; bırakma yalnız sampler içindir`,
      definition.release,
    );
  }
  if (source.kind === 'drum-kit' && (definition.range || definition.transposition)) {
    throw new AudioParamError(
      `${path}.range`,
      'combination',
      'davul kiti perdesizdir: aralık parçalardan türer, transpozisyon yoktur',
      definition.range,
    );
  }
  if (source.kind !== 'drum-kit' && !definition.range) {
    throw new AudioParamError(
      `${path}.range`,
      'required',
      'perdeli enstrüman aralık ister',
      undefined,
    );
  }
}

export function validateInstrumentDefinition(value: unknown, path: string): InstrumentDefinitionV1 {
  const o = checkObject(value, path, [
    'id',
    'description',
    'role',
    'range',
    'preferred',
    'transposition',
    'polyphony',
    'velocity',
    'release',
    'articulations',
    'source',
  ]);
  const velocity =
    o.velocity === undefined
      ? undefined
      : (() => {
          const v = checkObject(o.velocity, `${path}.velocity`, ['rangeDb', 'brightness']);
          return {
            rangeDb: readNumber(v, 'rangeDb', `${path}.velocity`, { min: 0, max: 48 }, 0),
            brightness: readNumber(v, 'brightness', `${path}.velocity`, UNIT, 0),
          };
        })();
  const definition: InstrumentDefinitionV1 = {
    id: checkPattern(o.id, `${path}.id`, MUSIC_KEY),
    ...(o.description === undefined
      ? {}
      : { description: checkText(o.description, `${path}.description`, 400) }),
    role: checkChoice(o.role, `${path}.role`, MUSIC_ROLES),
    ...(o.range === undefined ? {} : { range: checkRange(o.range, `${path}.range`) }),
    ...(o.preferred === undefined
      ? {}
      : { preferred: checkRange(o.preferred, `${path}.preferred`) }),
    ...(o.transposition === undefined
      ? {}
      : {
          transposition: checkNumber(o.transposition, `${path}.transposition`, {
            min: -36,
            max: 36,
            integer: true,
          }),
        }),
    polyphony: checkNumber(o.polyphony, `${path}.polyphony`, { min: 1, max: 32, integer: true }),
    ...(velocity ? { velocity } : {}),
    ...(o.release === undefined
      ? {}
      : {
          release: {
            seconds: checkNumber(
              checkObject(o.release, `${path}.release`, ['seconds']).seconds,
              `${path}.release.seconds`,
              { min: 0, max: 10 },
            ),
          },
        }),
    articulations: checkSupportedArticulations(o.articulations, `${path}.articulations`),
    source: checkSource(o.source, `${path}.source`, false),
  };
  if (definition.range && definition.preferred) {
    const [low, high] = definition.range.map((n) => noteToMidi(n));
    const [pLow, pHigh] = definition.preferred.map((n) => noteToMidi(n));
    if (pLow < low || pHigh > high) {
      throw new AudioParamError(
        `${path}.preferred`,
        'range',
        'tercih edilen register aralığın içinde olmalı',
        definition.preferred,
      );
    }
  }
  assertContract(definition, path);
  return definition;
}
