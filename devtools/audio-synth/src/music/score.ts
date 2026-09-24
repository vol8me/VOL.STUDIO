import { AudioParamError } from '../guard/errors';
import { deriveSeed } from '../program/random';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { applyTies, assertSupported, mergeArticulations } from './articulation';
import { applyGroove, STRAIGHT_GROOVE, type GrooveProfileV1 } from './groove';
import { voiceChord, type VoicedChordV1 } from './harmony';
import { LOCAL_INSTRUMENT_PREFIX } from './instrumentDefinition';
import {
  programInstruments,
  type InstrumentTable,
  type ResolvedInstrumentV1,
} from './instrumentResolve';
import { applyTransforms, type MotifTransformV1 } from './motif';
import { expandPatternPart, type PatternHitV1 } from './pattern';
import { parseNote, type TuningV1 } from './tuning';
import { autoShift, laneInstrument, paletteSlot, type OrchestrationRole } from './orchestration';
import type { LaneV1, MusicProgramV1, NoteExpressionV1, PartV1, SectionV1 } from './program';
import type { Articulation } from './terms';
import { degreeToMidi, midiToNote, noteToMidi, scaleSteps, type ScaleName } from './tonal';

/**
 * Genişletilmiş score: programın TEK düzleştirilmiş gerçeği. Hem sembolik
 * analiz hem render yalnız bunu okur — "render etmeden analiz edilebilir"
 * sözü böylece yapının kendisiyle garanti edilir, iyi niyetle değil.
 *
 * İnsanlaştırma burada uygulanmıştır: analizin gördüğü zamanlama, kulağın
 * duyacağı zamanlamadır.
 */
export const MUSIC_SCORE_SCHEMA = 'MusicScoreV1';

export type EventProvenanceV1 =
  | { readonly kind: 'chord'; readonly chordIndex: number; readonly voice: number }
  | {
      readonly kind: 'motif';
      readonly motif: string;
      readonly variationId: string;
      readonly chain: readonly MotifTransformV1[];
      readonly noteIndex: number;
    }
  | { readonly kind: 'explicit'; readonly noteIndex: number }
  | PatternHitV1['provenance'];

export interface ScoreEventV1 {
  readonly id: string;
  readonly lane: string;
  readonly stem: string;
  readonly section: string;
  readonly instrument: string;
  /** SESLENEN perde (yazılan + transpozisyon); kitte parçayı seçen tuş. */
  readonly midi: number;
  readonly note: string;
  /** Yazılan perde; yalnız transpozisyon onu seslenenden ayırdığında. */
  readonly written?: number;
  /** Yazıldıysa velocity (0–1) ve artikülasyonlar (şerit varsayılanı dahil). */
  readonly velocity?: number;
  readonly articulations?: readonly Articulation[];
  /** Olay başına rastgelelik isteyen kaynağın (davul gürültüsü) tohumu. */
  readonly seed?: number;
  /** Mikrotonal sapma (cent); yalnız notada yazıldığında. */
  readonly cents?: number;
  /** İnsanlaştırılmış mutlak vuruş. */
  readonly beat: number;
  /** İnsanlaştırma öncesi ızgara konumu. */
  readonly gridBeat: number;
  readonly beats: number;
  readonly gain: number;
  readonly pan?: number;
  readonly provenance: EventProvenanceV1;
}

export interface ScoreLaneV1 {
  readonly id: string;
  readonly instrument: string;
  readonly role: string;
  readonly stem: string;
  readonly pan?: number;
  /** Perdesiz enstrüman (davul kiti): tuş perde değil parçadır; perde analizine girmez. */
  readonly pitched?: false;
  /** Şeridin müzikal görevi (yazıldıysa). */
  readonly orchestration?: OrchestrationRole;
}

export interface MusicScoreV1 {
  readonly schema: typeof MUSIC_SCORE_SCHEMA;
  readonly musicId: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly bars: number;
  readonly totalBeats: number;
  readonly sampleRate: number;
  readonly system: string;
  readonly rootMidi: number;
  /** Programın özel ayarı (yazıldıysa); frekans çözücü onu okur. */
  readonly tuning?: TuningV1;
  readonly lanes: readonly ScoreLaneV1[];
  /** Programa özgü (`inst:`) enstrümanların çözülmüş sözleşmesi; render yalnız score okur. */
  readonly instruments?: Readonly<Record<string, ResolvedInstrumentV1>>;
  readonly stems: readonly string[];
  readonly sections: readonly {
    readonly id: string;
    readonly role: string;
    readonly bars: readonly [number, number];
    readonly targetEnergy: number;
    readonly lanes: readonly string[];
  }[];
  readonly events: readonly ScoreEventV1[];
}

interface LaneContext {
  readonly lane: LaneV1;
  /** Seslendiren enstrüman: şeridin kendi ya da etkin paletteki görevin. */
  readonly instrumentId: string;
  readonly instrument: ResolvedInstrumentV1;
  /** Palet yuvasının sabit kaydırması (`auto` genişletmeden sonra hesaplanır). */
  readonly shift: number;
  readonly auto: boolean;
  readonly gainScale: number | undefined;
  readonly groove: GrooveProfileV1;
  readonly automation: readonly (readonly [number, number])[] | null;
}

function grooveOf(program: MusicProgramV1, lane: LaneV1): GrooveProfileV1 {
  if (!lane.groove) return STRAIGHT_GROOVE;
  const found = program.grooves.find((g) => g.id === lane.groove);
  if (!found)
    throw new AudioParamError(`lanes.${lane.id}.groove`, 'unknown-id', 'groove yok', lane.groove);
  return found;
}

/** Otomasyon eğrisini ölçü konumunda okur (doğrusal ara değer, uçlarda sabit). */
function automationGain(points: readonly (readonly [number, number])[], bar: number): number {
  if (bar <= points[0][0]) return dbToGain(points[0][1]);
  const last = points[points.length - 1];
  if (bar >= last[0]) return dbToGain(last[1]);
  for (let i = 0; i < points.length - 1; i++) {
    const [barA, dbA] = points[i];
    const [barB, dbB] = points[i + 1];
    if (bar >= barA && bar <= barB) {
      const t = barB === barA ? 0 : (bar - barA) / (barB - barA);
      return dbToGain(dbA + t * (dbB - dbA));
    }
  }
  return dbToGain(last[1]);
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function voiceSection(
  section: SectionV1,
  rootMidi: number,
  scale: readonly number[],
): VoicedChordV1[] {
  if (!section.harmony) return [];
  let previous: readonly number[] | null = null;
  return section.harmony.chords.map((chord, i) => {
    const voiced = voiceChord(
      chord,
      { rootMidi, scale },
      section.harmony!.voicing,
      previous,
      `sections.${section.id}.harmony.chords[${i}]`,
    );
    previous = voiced.midis;
    return voiced;
  });
}

function chordAt(
  voiced: readonly VoicedChordV1[],
  beatsPerBar: number,
  relativeBeat: number,
  path: string,
): { chord: VoicedChordV1; index: number } {
  for (const [index, entry] of voiced.entries()) {
    const start = entry.chord.bar * beatsPerBar + entry.chord.beat;
    if (relativeBeat >= start - 1e-9 && relativeBeat < start + entry.chord.beats - 1e-9) {
      return { chord: entry, index };
    }
  }
  throw new AudioParamError(path, 'combination', 'bu konumda akor yok', relativeBeat);
}

interface EmitInput {
  readonly program: MusicProgramV1;
  readonly section: SectionV1;
  readonly context: LaneContext;
  readonly counter: { value: number };
  readonly scale: readonly number[];
  readonly rootMidi: number;
}

/** Seslenen perde aralıkta mı; kitte tuşun bir parçaya karşılık gelip gelmediği. */
function assertPlayable(instrument: ResolvedInstrumentV1, midi: number, path: string): void {
  if (instrument.source.kind === 'drum-kit') {
    if (!instrument.source.pieces.some((piece) => piece.midi === midi)) {
      const keys = instrument.source.pieces.map((piece) => piece.midi).join(', ');
      throw new AudioParamError(
        path,
        'range',
        `${instrument.id} kitinde bu tuşa parça yok (tuşlar: ${keys})`,
        midi,
      );
    }
    return;
  }
  if (midi < instrument.range.lowMidi || midi > instrument.range.highMidi) {
    throw new AudioParamError(
      path,
      'range',
      `${instrument.id} aralığı MIDI ${instrument.range.lowMidi}–${instrument.range.highMidi}`,
      midi,
    );
  }
}

function emit(
  input: EmitInput,
  written: number,
  gridBeat: number,
  beats: number,
  gain: number,
  provenance: EventProvenanceV1,
  expression: NoteExpressionV1 & { readonly cents?: number } = {},
): ScoreEventV1 {
  const { program, section, context } = input;
  const beatsPerBar = program.meter[0];
  const lane = context.lane;
  const instrument = context.instrument;
  const id = `${section.id}/${lane.id}/${input.counter.value++}`;
  const path = `sections.${section.id}.parts.${lane.id}`;
  const midi = instrument.pitched ? written + instrument.transposition + context.shift : written;
  const articulations = mergeArticulations(lane.articulation, expression.articulations);
  assertSupported(instrument.articulations, articulations, instrument.id, path);
  if (gridBeat < 0 || gridBeat >= program.bars * beatsPerBar) {
    throw new AudioParamError(
      `sections.${section.id}.parts.${lane.id}`,
      'range',
      `olay parçanın dışında (0–${program.bars * beatsPerBar} vuruş)`,
      gridBeat,
    );
  }
  const groove = applyGroove(context.groove, {
    seed: program.seed,
    musicId: program.musicId,
    eventId: id,
    beatInBar: gridBeat % beatsPerBar,
    beatsPerBar,
  });
  const automation = context.automation
    ? automationGain(context.automation, gridBeat / beatsPerBar)
    : 1;
  const level = gain * (lane.gain ?? 1) * groove.gainFactor * automation;
  return {
    id,
    lane: lane.id,
    stem: lane.stem,
    section: section.id,
    instrument: context.instrumentId,
    midi,
    note: midiToNote(midi),
    ...(midi === written ? {} : { written }),
    ...(expression.cents === undefined ? {} : { cents: expression.cents }),
    ...(expression.velocity === undefined ? {} : { velocity: expression.velocity }),
    ...(articulations.length === 0 ? {} : { articulations }),
    ...(instrument.source.kind === 'drum-kit'
      ? { seed: deriveSeed(program.seed, `music:${program.musicId}/voice/${id}`) }
      : {}),
    beat: Math.max(0, gridBeat + groove.beatOffset),
    gridBeat,
    beats,
    gain: context.gainScale === undefined ? level : level * context.gainScale,
    ...(lane.pan === undefined ? {} : { pan: lane.pan }),
    provenance,
  };
}

function expandPart(input: EmitInput, part: PartV1): ScoreEventV1[] {
  const { program, section } = input;
  const beatsPerBar = program.meter[0];
  const sectionStart = section.bars[0] * beatsPerBar;
  const octaveShift = (input.context.lane.octave ?? 0) * 12;
  const events: ScoreEventV1[] = [];
  if (part.source === 'chord') {
    const voiced = voiceSection(section, input.rootMidi, input.scale);
    for (const step of part.rhythm) {
      const relative = step.bar * beatsPerBar + step.beat;
      const { chord, index } = chordAt(
        voiced,
        beatsPerBar,
        relative,
        `sections.${section.id}.parts.${part.lane}`,
      );
      const voices = part.voices ?? chord.midis.map((_, i) => i);
      for (const voice of voices) {
        const midi = chord.midis[voice];
        if (midi === undefined) {
          throw new AudioParamError(
            `sections.${section.id}.parts.${part.lane}.voices`,
            'range',
            `akorun ${chord.midis.length} sesi var`,
            voice,
          );
        }
        events.push(
          emit(
            input,
            midi + octaveShift,
            sectionStart + relative,
            step.beats,
            step.gain ?? 1,
            { kind: 'chord', chordIndex: index, voice },
            step,
          ),
        );
      }
    }
    return events;
  }
  if (part.source === 'motif') {
    const motif = program.motifs.find((m) => m.id === part.motif);
    if (!motif) {
      throw new AudioParamError(
        `sections.${section.id}.parts.${part.lane}.motif`,
        'unknown-id',
        'motif yok',
        part.motif,
      );
    }
    const instance = applyTransforms(motif, part.transforms, input.scale.length);
    for (const placement of part.placements) {
      const origin = sectionStart + placement.bar * beatsPerBar + placement.beat;
      const shift = octaveShift + (placement.octave ?? 0) * 12;
      for (const [noteIndex, note] of instance.notes.entries()) {
        const midi = degreeToMidi(input.rootMidi, input.scale, note.degree) + shift;
        events.push(
          emit(
            input,
            midi,
            origin + note.beat * part.beats,
            note.beats * part.beats,
            note.gain ?? 1,
            {
              kind: 'motif',
              motif: motif.id,
              variationId: instance.variationId,
              chain: instance.chain,
              noteIndex,
            },
            note,
          ),
        );
      }
    }
    return events;
  }
  if (part.source === 'pattern') {
    const hits = expandPatternPart(
      part,
      program.patterns ?? [],
      {
        start: sectionStart,
        end: section.bars[1] * beatsPerBar,
        beatsPerBar,
        rootMidi: input.rootMidi,
        scale: input.scale,
        seed: program.seed,
        stream: `music:${program.musicId}/pattern/${section.id}/${part.lane}`,
      },
      `sections.${section.id}.parts.${part.lane}`,
    );
    for (const hit of hits) {
      if (hit.dropped) {
        input.counter.value++;
        continue;
      }
      events.push(
        emit(input, hit.written + octaveShift, hit.gridBeat, hit.beats, 1, hit.provenance, {
          ...(hit.cents === undefined ? {} : { cents: hit.cents }),
          ...(hit.velocity === undefined ? {} : { velocity: hit.velocity }),
          ...(hit.articulations ? { articulations: hit.articulations } : {}),
        }),
      );
    }
    return events;
  }
  for (const [noteIndex, note] of part.notes.entries()) {
    const pitch = parseNote(
      note.note,
      `sections.${section.id}.parts.${part.lane}.notes[${noteIndex}]`,
    );
    events.push(
      emit(
        input,
        pitch.midi,
        sectionStart + note.bar * beatsPerBar + note.beat,
        note.beats,
        note.gain ?? 1,
        {
          kind: 'explicit',
          noteIndex,
        },
        pitch.cents === undefined ? note : { ...note, cents: pitch.cents },
      ),
    );
  }
  return events;
}

/** Şeridin aynı ANDA çalan nota sayısı enstrümanın önerdiği sınırı aşmamalı. */
function assertPolyphony(
  program: MusicProgramV1,
  events: readonly ScoreEventV1[],
  contexts: ReadonlyMap<string, LaneContext>,
): void {
  for (const lane of program.lanes) {
    const laneEvents = events.filter((e) => e.lane === lane.id);
    const context = contexts.get(lane.id) as LaneContext;
    const limit = context.instrument.polyphony;
    for (const event of laneEvents) {
      const overlapping = laneEvents.filter(
        (other) => other.beat <= event.beat + 1e-9 && event.beat < other.beat + other.beats - 1e-9,
      ).length;
      if (overlapping > limit) {
        throw new AudioParamError(
          `lanes.${lane.id}`,
          'combination',
          `${context.instrumentId} için önerilen eşzamanlılık ${limit}`,
          overlapping,
        );
      }
    }
  }
}

function laneContexts(program: MusicProgramV1, table: InstrumentTable): Map<string, LaneContext> {
  return new Map(
    program.lanes.map((lane) => {
      const instrumentId = laneInstrument(program, lane);
      const slot = lane.instrument ? null : paletteSlot(program, lane.role);
      return [
        lane.id,
        {
          lane,
          instrumentId,
          instrument: table.get(instrumentId, `lanes.${lane.id}.instrument`),
          shift: typeof slot?.transposition === 'number' ? slot.transposition : 0,
          auto: slot?.transposition === 'auto',
          gainScale: slot?.gainDb === undefined ? undefined : dbToGain(slot.gainDb),
          groove: grooveOf(program, lane),
          automation: program.automation?.find((a) => a.lane === lane.id)?.points ?? null,
        },
      ];
    }),
  );
}

/**
 * Palet `auto` kaydırması şeridin BÜTÜN yazılan notalarına bakılarak seçilir
 * (bkz. `autoShift`); ardından her olay seslenen perdesinde aralık/parça
 * denetiminden geçer.
 */
function placeRegisters(
  events: readonly ScoreEventV1[],
  contexts: ReadonlyMap<string, LaneContext>,
): ScoreEventV1[] {
  const shifts = new Map<string, number>();
  for (const context of contexts.values()) {
    if (!context.auto) continue;
    const written = events
      .filter((e) => e.lane === context.lane.id)
      .map((e) => e.written ?? e.midi - context.instrument.transposition);
    shifts.set(context.lane.id, autoShift(written, context.instrument));
  }
  return events.map((event) => {
    const context = contexts.get(event.lane) as LaneContext;
    const shift = shifts.get(event.lane) ?? 0;
    const placed = shift === 0 ? event : relocated(event, event.midi + shift);
    assertPlayable(
      context.instrument,
      placed.midi,
      `sections.${event.section}.parts.${event.lane}`,
    );
    return placed;
  });
}

function relocated(event: ScoreEventV1, midi: number): ScoreEventV1 {
  const written = event.written ?? event.midi;
  const { written: _w, ...rest } = event;
  return { ...rest, midi, note: midiToNote(midi), ...(midi === written ? {} : { written }) };
}

/** Programı düz score'a açar: saf, deterministik, ses render etmez. */
export function expandProgram(program: MusicProgramV1): MusicScoreV1 {
  const beatsPerBar = program.meter[0];
  const scale = scaleSteps(program.tonal.system as ScaleName);
  const rootMidi = noteToMidi(program.tonal.root, 'tonal.root');
  const table = programInstruments(program);
  const contexts = laneContexts(program, table);
  const expanded: ScoreEventV1[] = [];
  for (const section of [...program.sections].sort((a, b) => a.bars[0] - b.bars[0])) {
    const counters = new Map<string, { value: number }>();
    for (const part of section.parts) {
      const lane = program.lanes.find((l) => l.id === part.lane);
      if (!lane) {
        throw new AudioParamError(
          `sections.${section.id}.parts`,
          'unknown-id',
          'şerit yok',
          part.lane,
        );
      }
      let counter = counters.get(lane.id);
      if (!counter) {
        counter = { value: 0 };
        counters.set(lane.id, counter);
      }
      expanded.push(
        ...expandPart(
          {
            program,
            section,
            context: contexts.get(lane.id) as LaneContext,
            counter,
            scale,
            rootMidi,
          },
          part,
        ),
      );
    }
  }
  const events = applyTies(placeRegisters(expanded, contexts));
  assertPolyphony(program, events, contexts);
  const local = [...new Set([...contexts.values()].map((c) => c.instrumentId))]
    .filter((id) => id.startsWith(LOCAL_INSTRUMENT_PREFIX))
    .sort();
  return {
    schema: MUSIC_SCORE_SCHEMA,
    musicId: program.musicId,
    bpm: program.tempo.bpm,
    beatsPerBar,
    bars: program.bars,
    totalBeats: program.bars * beatsPerBar,
    sampleRate: program.sampleRate,
    system: program.tonal.system,
    rootMidi,
    ...(program.tuning ? { tuning: program.tuning } : {}),
    lanes: program.lanes.map((lane) => {
      const { instrument, instrumentId } = contexts.get(lane.id) as LaneContext;
      return {
        id: lane.id,
        instrument: instrumentId,
        role: instrument.role,
        stem: lane.stem,
        ...(lane.pan === undefined ? {} : { pan: lane.pan }),
        ...(instrument.pitched ? {} : { pitched: false as const }),
        ...(lane.role === undefined ? {} : { orchestration: lane.role }),
      };
    }),
    ...(local.length === 0
      ? {}
      : { instruments: Object.fromEntries(local.map((id) => [id, table.get(id)])) }),
    stems: program.stems.map((s) => s.id),
    sections: program.sections.map((s) => ({
      id: s.id,
      role: s.role,
      bars: s.bars,
      targetEnergy: s.targetEnergy,
      lanes: s.lanes,
    })),
    events: [...events].sort(
      (a, b) =>
        a.beat - b.beat || (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : 0) || a.midi - b.midi,
    ),
  };
}

export function scoreHash(score: MusicScoreV1): Sha256 {
  return hashCanonical(score);
}

export function eventsOfStem(score: MusicScoreV1, stem: string): ScoreEventV1[] {
  return score.events.filter((event) => event.stem === stem);
}
