import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram, type ScoreEventV1 } from '../../src/music/score';
import { unitProgram } from './fixtures';

/**
 * Tracker desenleri: satır dizgisi, melodik adım, zincir, tekrar, varyasyon,
 * dolgu ve olay kimliğine bağlı olasılık. 4/4, 16 adımlık desen = 1 ölçü.
 */
const KIT = {
  id: 'kit',
  role: 'percussion',
  polyphony: 8,
  velocity: { rangeDb: 12 },
  articulations: ['accent', 'ghost', 'mute', 'let-ring'],
  source: {
    kind: 'drum-kit',
    pieces: [
      { note: 'C2', model: 'kick' },
      { note: 'D2', model: 'snare' },
      { note: 'F#2', model: 'hat' },
    ],
  },
};

const BEAT = {
  id: 'beat',
  steps: 16,
  stepBeats: 0.25,
  rows: [
    { note: 'C2', steps: 'x... .... x... ....' },
    { note: 'D2', steps: '.... X... .... X..o' },
    { note: 'F#2', steps: 'x.x. x.x. x.x. x.x.', probability: 0.5 },
  ],
  variations: [{ id: 'busy', rows: [{ row: 0, steps: 'x... ..x. x.x. ....' }] }],
};
const FILL = {
  id: 'fill',
  steps: 16,
  stepBeats: 0.25,
  rows: [{ note: 'D2', steps: '.... .... xxxx XXXX' }],
};
const BASS = {
  id: 'bassline',
  steps: 16,
  stepBeats: 0.25,
  events: [
    { step: 0, degree: 0, length: 3 },
    { step: 4, degree: 4, length: 2, articulations: ['staccato'] },
    { step: 8, note: 'C3', length: 4, velocity: 0.9 },
  ],
};

function program(parts: Record<string, unknown>[], bars = 8, extra: Record<string, unknown> = {}) {
  return validateMusicProgram({
    ...unitProgram(),
    bars,
    instruments: [KIT],
    patterns: [BEAT, FILL, BASS],
    lanes: [
      { id: 'drums', instrument: 'inst:kit', stem: 'main' },
      { id: 'bass', instrument: 'preset:subBass', stem: 'main' },
    ],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, bars],
        targetEnergy: 0.6,
        lanes: ['drums', 'bass'],
        parts,
      },
    ],
    markers: [{ bar: 0, kind: 'loop-start' }],
    ...extra,
  });
}

const drums = (chain: Record<string, unknown>) => ({ lane: 'drums', source: 'pattern', ...chain });
const onLane = (events: readonly ScoreEventV1[], midi: number) =>
  events.filter((e) => e.midi === midi).map((e) => e.gridBeat);

describe('tracker desenleri', () => {
  it('satır dizgisi: x vuruş, X accent, o ghost; olasılık kimliğe bağlı ve kararlı', () => {
    const score = expandProgram(program([drums({ chain: [{ pattern: 'beat' }] })], 1));
    expect(onLane(score.events, 36)).toEqual([0, 2]);
    const snares = score.events.filter((e) => e.midi === 38);
    expect(snares.map((e) => [e.gridBeat, e.articulations])).toEqual([
      [1, ['accent']],
      [3, ['accent']],
      [3.75, ['ghost']],
    ]);
    const hats = onLane(score.events, 42);
    expect(hats.length).toBeGreaterThan(0);
    expect(hats.length).toBeLessThan(8);
    const again = expandProgram(program([drums({ chain: [{ pattern: 'beat' }] })], 1));
    expect(onLane(again.events, 42)).toEqual(hats);
  });

  it('düşen vuruş kimlik sayacını ilerletir: diğer olayların kimliği kaymaz', () => {
    const base = expandProgram(program([drums({ chain: [{ pattern: 'beat' }] })], 1));
    const kickIds = base.events.filter((e) => e.midi === 36).map((e) => e.id);
    const certain = {
      ...BEAT,
      rows: BEAT.rows.map((row) => ({ ...row, probability: undefined })),
    };
    const full = expandProgram(
      validateMusicProgram({
        ...program([drums({ chain: [{ pattern: 'beat' }] })], 1),
        patterns: [certain, FILL, BASS],
      }),
    );
    expect(full.events.filter((e) => e.midi === 36).map((e) => e.id)).toEqual(kickIds);
    expect(onLane(full.events, 42)).toHaveLength(8);
  });

  it('zincir: tekrar, varyasyon, döngü ve her 4. örnekte dolgu', () => {
    const score = expandProgram(
      program([
        drums({
          chain: [
            { pattern: 'beat', repeat: 2 },
            { pattern: 'beat', variation: 'busy' },
          ],
          loop: true,
          fill: { pattern: 'fill', every: 4 },
        }),
      ]),
    );
    const kicks = onLane(score.events, 36);
    expect(kicks.filter((b) => b < 4)).toEqual([0, 2]);
    expect(kicks.filter((b) => b >= 8 && b < 12)).toEqual([8, 9.5, 10, 10.5]);
    const snaresInBar = (bar: number) =>
      score.events.filter((e) => e.midi === 38 && Math.floor(e.gridBeat / 4) === bar).length;
    expect(snaresInBar(3)).toBe(8);
    expect(snaresInBar(7)).toBe(8);
    expect(onLane(score.events, 36).filter((b) => b >= 12 && b < 16)).toEqual([]);
    const pattern = score.events.find((e) => e.provenance.kind === 'pattern');
    expect(pattern?.provenance).toMatchObject({ kind: 'pattern', pattern: 'beat', instance: 1 });
  });

  it('melodik adım olayları dereceyi dizide çözer, uzunluk ve artikülasyon taşır', () => {
    const score = expandProgram(
      program([{ lane: 'bass', source: 'pattern', chain: [{ pattern: 'bassline' }] }], 1),
    );
    const bass = score.events.filter((e) => e.lane === 'bass');
    expect(bass.map((e) => [e.note, e.beats, e.articulations])).toEqual([
      ['A2', 0.75, undefined],
      ['E3', 0.5, ['staccato']],
      ['C3', 1, undefined],
    ]);
    expect(bass[2].velocity).toBe(0.9);
  });

  it('bölüm sonunu aşan desen ve geçersiz dizgi adıyla reddedilir', () => {
    const rejects = (fn: () => unknown, fragment: RegExp) => {
      expect(fn).toThrow(AudioParamError);
      expect(fn).toThrow(fragment);
    };
    rejects(
      () => expandProgram(program([drums({ chain: [{ pattern: 'beat', repeat: 3 }] })], 2)),
      /bölüm sonunu aşıyor/,
    );
    rejects(
      () =>
        validateMusicProgram({
          ...program([drums({ chain: [{ pattern: 'beat' }] })], 1),
          patterns: [{ ...FILL, rows: [{ note: 'D2', steps: 'x..' }] }],
        }),
      /16 adım/,
    );
    rejects(
      () =>
        validateMusicProgram({
          ...program([drums({ chain: [{ pattern: 'beat' }] })], 1),
          patterns: [{ ...FILL, rows: [{ note: 'D2', steps: '_... .... .... ....' }] }],
        }),
      /uzatacak bir vuruş/,
    );
    rejects(
      () => program([drums({ chain: [{ pattern: 'beat', variation: 'yok' }] })], 1),
      /varyasyonu değil/,
    );
  });
});
