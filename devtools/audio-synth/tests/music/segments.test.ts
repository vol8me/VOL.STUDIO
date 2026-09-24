import { barsToFrames } from '@volstudio/core/audio/music';
import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { planMastering } from '../../src/music/mastering';
import { validateMusicProgram } from '../../src/music/program';
import { expandProgram } from '../../src/music/score';
import {
  cueSegments,
  musicView,
  segmentMastering,
  segmentQa,
  segmentScore,
} from '../../src/music/segments';
import { renderMusicStem, validateMusicStemProgram } from '../../src/music/stem';
import { RENDER_BLOCK } from '../support/timeouts';
import { unitProgram } from './fixtures';

/**
 * Bundle segmentleri: giriş (0–2), loop (2–6), bitiş (6–8), stinger (8–9).
 * 120 bpm 4/4 → ölçü 2 sn.
 */
const SEGMENTS = [
  { id: 'intro', kind: 'intro', bars: [0, 2] },
  { id: 'body', kind: 'loop', bars: [2, 6] },
  { id: 'ending', kind: 'outro', bars: [6, 8] },
  { id: 'hit', kind: 'stinger', bars: [8, 9], align: 'beat', gainDb: -3 },
];

function program(extra: Record<string, unknown> = {}) {
  const notes = Array.from({ length: 9 }, (_, bar) => ({
    bar,
    beat: 0,
    beats: bar === 8 ? 1 : 2,
    note: ['C4', 'E4', 'G4', 'A4', 'C4', 'E4', 'G4', 'C5', 'G4'][bar],
  }));
  return validateMusicProgram({
    ...unitProgram(),
    bars: 9,
    lanes: [{ id: 'keys', instrument: 'preset:warmKeys', stem: 'main' }],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 9],
        targetEnergy: 0.5,
        lanes: ['keys'],
        parts: [{ lane: 'keys', source: 'notes', notes }],
      },
    ],
    markers: undefined,
    segments: SEGMENTS,
    ...extra,
  });
}

const rejects = (fn: () => unknown, fragment: RegExp) => {
  expect(fn).toThrow(AudioParamError);
  expect(fn).toThrow(fragment);
};

describe('bundle segmentleri: sözleşme', () => {
  it('tek loop, loop’a bitişen giriş, örtüşmesiz aralık ve çakışmayan ad ister', () => {
    rejects(() => program({ segments: SEGMENTS.filter((s) => s.kind !== 'loop') }), /tam bir loop/);
    rejects(
      () => program({ segments: [{ ...SEGMENTS[0], bars: [0, 1] }, ...SEGMENTS.slice(1)] }),
      /loop’un başladığı ölçüde/,
    );
    rejects(
      () => program({ segments: [...SEGMENTS, { id: 'hit2', kind: 'stinger', bars: [5, 7] }] }),
      /örtüşüyor/,
    );
    rejects(
      () => program({ segments: [...SEGMENTS.slice(0, 3), { ...SEGMENTS[3], id: 'mix' }] }),
      /çakışır/,
    );
    rejects(
      () => program({ segments: [{ ...SEGMENTS[0], gainDb: -2 }, ...SEGMENTS.slice(1)] }),
      /yalnız stinger\/geçişte/,
    );
    rejects(() => program({ playback: 'playlistOneShot' }), /loop çalma modelindedir/);
    rejects(
      () => program({ markers: [{ bar: 0, kind: 'loop-start' }] }),
      /loop-start loop segmentiyle uyuşmuyor/,
    );
  });

  it('stinger geçişi cue’suna segment üzerinden bağlanır', () => {
    const transition = { id: 'boss', kind: 'stinger', seconds: 0.1, to: 'boss-theme', cue: 'hit' };
    expect(program({ transitions: [transition] }).transitions?.[0].cue).toBe('hit');
    rejects(() => program({ transitions: [{ ...transition, cue: 'body' }] }), /geçiş segmenti/);
    rejects(
      () => program({ transitions: [{ id: 'x', kind: 'stinger', seconds: 0.1 }] }),
      /cue yalnız stinger/,
    );
  });

  it('segment görünümü aralığı kaydırır; loop başa sarar, cue tek seferliktir', () => {
    const music = program();
    const score = expandProgram(music);
    const loop = musicView(music, score, undefined);
    expect(loop.playback).toBe('loop');
    expect(loop.score.bars).toBe(4);
    expect(loop.score.events.map((e) => e.gridBeat)).toEqual([0, 4, 8, 12]);
    const hit = musicView(music, score, 'hit');
    expect(hit.playback).toBe('playlistOneShot');
    expect(hit.score.events).toHaveLength(1);
    const early = segmentScore(
      { ...score, events: [{ ...score.events[2], beat: 7.9 }] },
      SEGMENTS[1] as never,
    );
    expect(early.events[0].beat).toBeCloseTo(15.9, 9);
    expect(cueSegments(music).map((s) => s.id)).toEqual(['intro', 'ending', 'hit']);
  });
});

describe('bundle segmentleri: render ve QA', RENDER_BLOCK, () => {
  const music = program();
  const loopPlan = planMastering({ playback: 'loop', targetLufs: -16, measuredLufs: -20 });
  const doc = (stem: string) => {
    const cue = cueSegments(music).find((s) => s.id === stem);
    return {
      schema: 'MusicStemProgramV1',
      stem,
      mastering: cue ? segmentMastering(loopPlan, cue) : loopPlan,
      music,
    };
  };

  it('loop gövdesi tam ölçü, cue’lar kuyruklu; cue ortak kazancı (+ farkı) taşır', () => {
    const loop = renderMusicStem(doc('mix'));
    expect(loop.channels[0].length).toBe(barsToFrames(4, 120, 4, 44100));
    const intro = renderMusicStem(doc('intro'));
    const lastNoteEnd = 3 * 44100;
    expect(intro.channels[0].length).toBeGreaterThan(lastNoteEnd);
    expect(intro.channels[0].length).toBeLessThan(barsToFrames(2, 120, 4, 44100));
    const hitPlan = segmentMastering(loopPlan, cueSegments(music)[2]);
    expect(hitPlan).toMatchObject({ path: 'one-shot-limited', gainDb: loopPlan.gainDb - 3 });
    rejects(
      () => validateMusicStemProgram({ ...doc('hit'), mastering: loopPlan }),
      /one-shot-limited/,
    );
  });

  it('stinger loop’un her vuruşunda loop ile birlikte ölçülür; taşarsa QA düşer', () => {
    const loop = [new Float32Array(8000).fill(0.5), new Float32Array(8000).fill(0.5)];
    const quiet = [new Float32Array(500).fill(0.2), new Float32Array(500).fill(0.2)];
    const loud = [new Float32Array(500).fill(0.6), new Float32Array(500).fill(0.6)];
    const stinger = cueSegments(music)[2];
    const qa = (channels: Float32Array[]) =>
      segmentQa({
        loop,
        sampleRate: 8000,
        beatFrames: 1000,
        barFrames: 4000,
        introFrames: () => 4000,
        segments: [{ segment: stinger, channels }],
      })[0];
    const ok = qa(quiet);
    expect(ok.overlay?.positions).toBe(8);
    expect(ok.overlay?.worstTruePeakDbtp).toBeLessThan(-1);
    const bad = qa(loud);
    expect(bad.ok).toBe(false);
    expect(bad.problems.join()).toMatch(/loop ile birlikte/);
  });
});
