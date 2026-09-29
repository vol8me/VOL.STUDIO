import { analyzeAudio } from '../analysis/report';
import { synthesize } from '../engine';
import { AudioParamError } from '../guard/errors';
import { getPreset, PRESET_CATALOG } from '../presets';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { midiToHz, MIDI_MAX, MIDI_MIN } from './tonal';
import type { Articulation, MusicRole } from './terms';

/**
 * Bestecilik için enstrüman kaydı. Kimlik `preset:<ad>`dır: MusicProgram
 * fonksiyon referansı taşıyamaz, JSON yalnız adı taşır. Aralık ve rol
 * katalogdan gelir (beyan); zarf ve spektral doluluk ÖLÇÜLÜR — elle yazılan
 * bir "parlaklık" değeri ilk preset değişikliğinde yalan olurdu.
 */
export const INSTRUMENT_PREFIX = 'preset:';

export interface InstrumentMeasurementV1 {
  readonly midi: number;
  readonly centroidHz: number | null;
  readonly rolloff85Hz: number | null;
  readonly rmsDbfs: number | null;
}

export interface InstrumentProfileV1 {
  readonly id: string;
  readonly preset: string;
  readonly role: MusicRole;
  readonly range: {
    readonly lowMidi: number;
    readonly highMidi: number;
    readonly lowHz: number;
    readonly highHz: number;
  };
  readonly typical: { readonly midi: number; readonly durationSeconds: number };
  readonly articulations: readonly Articulation[];
  readonly polyphony: { readonly recommendedMax: number };
  readonly envelope: {
    readonly attackMs: number | null;
    readonly decay40Ms: number | null;
    readonly kind: 'transient' | 'sustained';
  };
  readonly spectral: readonly InstrumentMeasurementV1[];
}

/** Rol başına eşzamanlı ses önerisi; şerit bunu aşarsa program reddedilir. */
const ROLE_POLYPHONY: Readonly<Record<MusicRole, number>> = {
  bass: 2,
  pad: 6,
  lead: 2,
  pluck: 6,
  keys: 8,
  bell: 4,
  texture: 4,
  percussion: 4,
};

/** Spektral ölçüm süresi: uzun kuyruk profil için gerekmez, ilk saniye karakteri taşır. */
const PROBE_SECONDS = 1;
/**
 * "Nota tutulabiliyor mu" sorusu presetin TİPİK nota süresinde (en çok 4 sn)
 * sorulur: notanın başındaki ve ortasındaki seviye karşılaştırılır. Sönüm
 * süresine bakmak yanıltıyordu — yavaş ataklı pad'in tepesi geç gelir,
 * süreye ölçeklenen piyano zarfı ise yoklamanın sonuna kadar uzanır.
 */
const MAX_ENVELOPE_PROBE_SECONDS = 4;
/** Başlangıç ile orta arasında bundan fazla düşen ses notayı tutamaz (vurgusal). */
const TRANSIENT_DROP_DB = 6;
const PROBE_POINTS = [0.25, 0.5, 0.75];

/**
 * Ölçülen zarftan türeyen artikülasyon desteği. Vurgusal bir enstrüman
 * (marimba, piyano) notayı TUTAMAZ: `sustain` ve `legato` onda yalan olurdu;
 * `let-ring` ise doğal sönümüne bırakır. Kısa sönümlü telli ve bas presetleri
 * `mute` (avuç içi) çalabilir: kısa kapı + kararmış süzgeç.
 */
function builtinArticulations(kind: 'transient' | 'sustained', role: MusicRole): Articulation[] {
  if (kind === 'sustained') {
    return ['sustain', 'staccato', 'legato', 'tie', 'accent', 'ghost', 'slide'];
  }
  const base: Articulation[] = ['staccato', 'let-ring', 'accent', 'ghost'];
  return role === 'pluck' || role === 'bass' ? [...base, 'mute'] : base;
}

/** Notanın [%15, %25] ile [%45, %55] dilimleri arasındaki seviye düşüşü (dB). */
function holdDropDb(x: Float32Array): number {
  const level = (from: number, to: number) => {
    const a = Math.round(from * x.length);
    const b = Math.round(to * x.length);
    let energy = 0;
    for (let i = a; i < b; i++) energy += x[i] * x[i];
    return Math.sqrt(energy / Math.max(1, b - a));
  };
  const middle = level(0.45, 0.55);
  return middle > 0 ? 20 * Math.log10(level(0.15, 0.25) / middle) : Number.POSITIVE_INFINITY;
}

function hzToMidi(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

function isMusicRole(role: string | undefined): role is MusicRole {
  return role !== undefined && role in ROLE_POLYPHONY;
}

/** Katalogda `category: 'instrument'` olan ve aralık beyan eden presetler. */
export function instrumentIds(): string[] {
  return Object.entries(PRESET_CATALOG)
    .filter(([, meta]) => meta.category === 'instrument' && meta.range && isMusicRole(meta.role))
    .map(([name]) => `${INSTRUMENT_PREFIX}${name}`)
    .sort();
}

export function presetOf(id: string, path = 'instrument'): string {
  if (!id.startsWith(INSTRUMENT_PREFIX)) {
    throw new AudioParamError(path, 'type', `${INSTRUMENT_PREFIX}<ad> olmalı`, id);
  }
  const preset = id.slice(INSTRUMENT_PREFIX.length);
  const meta = PRESET_CATALOG[preset];
  if (!meta || meta.category !== 'instrument' || !meta.range || !isMusicRole(meta.role)) {
    throw new AudioParamError(path, 'unknown-id', 'müzik enstrümanı değil', id);
  }
  return preset;
}

function measure(preset: string, midi: number): InstrumentMeasurementV1 {
  const params = { ...getPreset(preset, midiToHz(midi), PROBE_SECONDS), sampleRate: 44100 };
  const result = synthesize(params);
  const report = analyzeAudio(result.channels, result.sampleRate, 'source-pcm');
  return {
    midi,
    centroidHz: report.spectral.centroidHz,
    rolloff85Hz: report.spectral.rolloff85Hz,
    rmsDbfs: report.level.rmsDbfs,
  };
}

type InstrumentBasics = Omit<InstrumentProfileV1, 'spectral'>;

/** Aralık, rol, zarf türü ve eklemleme: tek zarf probuyla ölçülür. */
function buildBasics(id: string): InstrumentBasics {
  const preset = presetOf(id);
  const meta = PRESET_CATALOG[preset];
  const [lowHz, highHz] = meta.range as [number, number];
  const lowMidi = Math.max(MIDI_MIN, hzToMidi(lowHz));
  const highMidi = Math.min(MIDI_MAX, hzToMidi(highHz));
  const role = meta.role as MusicRole;
  const probeSeconds = Math.min(MAX_ENVELOPE_PROBE_SECONDS, meta.typicalDuration);
  const probe = { ...getPreset(preset, meta.typicalFrequency, probeSeconds), sampleRate: 44100 };
  const rendered = synthesize(probe);
  const report = analyzeAudio(rendered.channels, rendered.sampleRate, 'source-pcm');
  const attack = report.temporal.attackSeconds;
  const decay = report.temporal.decay40Seconds;
  const kind = holdDropDb(rendered.channels[0]) > TRANSIENT_DROP_DB ? 'transient' : 'sustained';
  return {
    id,
    preset,
    role,
    range: { lowMidi, highMidi, lowHz, highHz },
    typical: { midi: hzToMidi(meta.typicalFrequency), durationSeconds: meta.typicalDuration },
    articulations: builtinArticulations(kind, role),
    polyphony: { recommendedMax: ROLE_POLYPHONY[role] },
    envelope: {
      attackMs: attack === null ? null : Number((attack * 1000).toFixed(3)),
      decay40Ms: decay === null ? null : Number((decay * 1000).toFixed(3)),
      kind,
    },
  };
}

function build(id: string): InstrumentProfileV1 {
  const basics = instrumentBasics(id);
  const spectral = PROBE_POINTS.map((t) =>
    measure(
      basics.preset,
      Math.round(basics.range.lowMidi + (basics.range.highMidi - basics.range.lowMidi) * t),
    ),
  );
  return {
    ...basics,
    spectral: spectral.map((m) => ({
      midi: m.midi,
      centroidHz: m.centroidHz === null ? null : Number(m.centroidHz.toFixed(2)),
      rolloff85Hz: m.rolloff85Hz === null ? null : Number(m.rolloff85Hz.toFixed(2)),
      rmsDbfs: m.rmsDbfs === null ? null : Number(m.rmsDbfs.toFixed(3)),
    })),
  };
}

const basicsCache = new Map<string, InstrumentBasics>();
const cache = new Map<string, InstrumentProfileV1>();

/**
 * Doğrulama ve çözümlemenin ihtiyacı olan kısım; spektral ölçüm istemez.
 * Ölçüm deterministiktir ve süreç boyunca saklanır.
 */
export function instrumentBasics(id: string): InstrumentBasics {
  const cached = basicsCache.get(id);
  if (cached) return cached;
  const basics = buildBasics(id);
  basicsCache.set(id, basics);
  return basics;
}

/** Tam profil (spektral ölçüm dahil) ilk istendiğinde ölçülür ve saklanır. */
export function instrumentProfile(id: string): InstrumentProfileV1 {
  const cached = cache.get(id);
  if (cached) return cached;
  const profile = build(id);
  cache.set(id, profile);
  return profile;
}

function declarationOf(id: string): Record<string, unknown> {
  const meta = PRESET_CATALOG[presetOf(id)];
  return {
    id,
    role: meta.role,
    genre: meta.genre ?? null,
    range: meta.range,
    typicalFrequency: meta.typicalFrequency,
    typicalDuration: meta.typicalDuration,
  };
}

/** Ölçüm İÇERMEYEN beyan yüzeyi: registry özeti bunun üstünden alınır. */
function instrumentDeclaration(): unknown {
  return instrumentIds().map(declarationOf);
}

export function instrumentRegistryHash(): Sha256 {
  return hashCanonical(instrumentDeclaration());
}

/**
 * Tek enstrümanın render yüzeyi kaydı. Preset'lerin sürümü yoktur: bu özet
 * beyanı (rol, aralık, tipik değerler) izler; preset DSP'sindeki bir
 * değişikliği yalnız PCM kimliği yakalar.
 */
export function instrumentSurface(id: string): { id: string; hash: Sha256 } {
  return { id, hash: hashCanonical(declarationOf(id)) };
}

export function assertInRange(profile: InstrumentProfileV1, midi: number, path: string): number {
  if (midi < profile.range.lowMidi || midi > profile.range.highMidi) {
    throw new AudioParamError(
      path,
      'range',
      `${profile.id} aralığı MIDI ${profile.range.lowMidi}–${profile.range.highMidi}`,
      midi,
    );
  }
  return midi;
}

export function assertArticulation(
  profile: InstrumentProfileV1,
  articulation: Articulation,
  path: string,
): Articulation {
  if (!profile.articulations.includes(articulation)) {
    throw new AudioParamError(
      path,
      'unsupported',
      `${profile.id} yalnız ${profile.articulations.join(', ')} taşır (ölçülen zarf: ${
        profile.envelope.kind
      })`,
      articulation,
    );
  }
  return articulation;
}
