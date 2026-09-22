import { AudioParamError } from '../guard/errors';
import { hashCanonical, type Sha256 } from '../protocol/canonical';
import { applyGroove, STRAIGHT_GROOVE, type GrooveProfileV1 } from './groove';
import { voiceChord, type VoicedChordV1 } from './harmony';
import { assertInRange, instrumentProfile } from './instruments';
import { applyTransforms, type MotifTransformV1 } from './motif';
import type { LaneV1, MusicProgramV1, PartV1, SectionV1 } from './program';
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
  | { readonly kind: 'explicit'; readonly noteIndex: number };

export interface ScoreEventV1 {
  readonly id: string;
  readonly lane: string;
  readonly stem: string;
  readonly section: string;
  readonly instrument: string;
  readonly midi: number;
  readonly note: string;
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
  readonly lanes: readonly ScoreLaneV1[];
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

function emit(
  input: EmitInput,
  midi: number,
  gridBeat: number,
  beats: number,
  gain: number,
  provenance: EventProvenanceV1,
): ScoreEventV1 {
  const { program, section, context } = input;
  const beatsPerBar = program.meter[0];
  const lane = context.lane;
  const profile = instrumentProfile(lane.instrument);
  const id = `${section.id}/${lane.id}/${input.counter.value++}`;
  assertInRange(profile, midi, `sections.${section.id}.parts.${lane.id}`);
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
  return {
    id,
    lane: lane.id,
    stem: lane.stem,
    section: section.id,
    instrument: lane.instrument,
    midi,
    note: midiToNote(midi),
    beat: Math.max(0, gridBeat + groove.beatOffset),
    gridBeat,
    beats,
    gain: gain * (lane.gain ?? 1) * groove.gainFactor * automation,
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
          emit(input, midi + octaveShift, sectionStart + relative, step.beats, step.gain ?? 1, {
            kind: 'chord',
            chordIndex: index,
            voice,
          }),
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
          ),
        );
      }
    }
    return events;
  }
  for (const [noteIndex, note] of part.notes.entries()) {
    const midi = noteToMidi(
      note.note,
      `sections.${section.id}.parts.${part.lane}.notes[${noteIndex}]`,
    );
    events.push(
      emit(
        input,
        midi,
        sectionStart + note.bar * beatsPerBar + note.beat,
        note.beats,
        note.gain ?? 1,
        {
          kind: 'explicit',
          noteIndex,
        },
      ),
    );
  }
  return events;
}

/** Şeridin aynı ANDA çalan nota sayısı enstrümanın önerdiği sınırı aşmamalı. */
function assertPolyphony(program: MusicProgramV1, events: readonly ScoreEventV1[]): void {
  for (const lane of program.lanes) {
    const laneEvents = events.filter((e) => e.lane === lane.id);
    const limit = instrumentProfile(lane.instrument).polyphony.recommendedMax;
    for (const event of laneEvents) {
      const overlapping = laneEvents.filter(
        (other) => other.beat <= event.beat + 1e-9 && event.beat < other.beat + other.beats - 1e-9,
      ).length;
      if (overlapping > limit) {
        throw new AudioParamError(
          `lanes.${lane.id}`,
          'combination',
          `${lane.instrument} için önerilen eşzamanlılık ${limit}`,
          overlapping,
        );
      }
    }
  }
}

/** Programı düz score'a açar: saf, deterministik, ses render etmez. */
export function expandProgram(program: MusicProgramV1): MusicScoreV1 {
  const beatsPerBar = program.meter[0];
  const scale = scaleSteps(program.tonal.system as ScaleName);
  const rootMidi = noteToMidi(program.tonal.root, 'tonal.root');
  const events: ScoreEventV1[] = [];
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
      const automation = program.automation?.find((a) => a.lane === lane.id)?.points ?? null;
      events.push(
        ...expandPart(
          {
            program,
            section,
            context: { lane, groove: grooveOf(program, lane), automation },
            counter,
            scale,
            rootMidi,
          },
          part,
        ),
      );
    }
  }
  assertPolyphony(program, events);
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
    lanes: program.lanes.map((lane) => ({
      id: lane.id,
      instrument: lane.instrument,
      role: instrumentProfile(lane.instrument).role,
      stem: lane.stem,
      ...(lane.pan === undefined ? {} : { pan: lane.pan }),
    })),
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
