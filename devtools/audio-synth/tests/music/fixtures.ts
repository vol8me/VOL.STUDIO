import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MusicProgramV1 } from '../../src/music/program';

/**
 * Testlerin ortak müzik belgeleri. Küçük ve HIZLI bir program (iki şerit,
 * iki ölçü) birim testler içindir; depo fixture'ları (referans loop/cue/
 * adaptive) gerçek yayın yolunu sınayan testlerde okunur.
 */
export const REPO_ROOT = join(import.meta.dirname, '../../../..');
export const MUSIC_ROOT = 'devtools/audio-synth/audio-music';
export const THEMEBOOKS_ROOT = 'devtools/audio-synth/audio-themebooks';

export function readRepoJson(relative: string): unknown {
  return JSON.parse(readFileSync(join(REPO_ROOT, relative), 'utf8'));
}

export function referenceProgram(musicId: string): MusicProgramV1 {
  return readRepoJson(`${MUSIC_ROOT}/${musicId}/music.json`) as MusicProgramV1;
}

export function referenceBrief(musicId: string): Record<string, unknown> {
  return readRepoJson(`${MUSIC_ROOT}/${musicId}/brief.json`) as Record<string, unknown>;
}

export function referenceThemeBook(): Record<string, unknown> {
  return readRepoJson(`${THEMEBOOKS_ROOT}/reference-theme.json`) as Record<string, unknown>;
}

export function musicBrief(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AudioBriefV1',
    kind: 'music',
    id: 'unit-loop',
    title: 'Birim testi loop',
    intent: 'Birim testleri için kısa, dönen bir yatak.',
    provenance: { author: 'agent' },
    assetClass: 'music',
    usage: 'bed',
    playback: 'loop',
    affect: { valence: 0, arousal: 0.4 },
    tempo: { bpm: { min: 100, max: 140 } },
    meter: [4, 4],
    tonal: { systems: ['minor'] },
    melodicSalience: 0.3,
    rhythmicDensity: 'moderate',
    form: { sections: ['body'] },
    length: { bars: { min: 1, max: 8 } },
    channels: 2,
    ...overrides,
  };
}

/**
 * Üç şeritli, iki ölçülük loop programı; testler bunu kopyalayıp bozar.
 * Kısa tutulur: her test GERÇEK ses render eder ve kapsam ölçümü altında
 * her ölçü saniyelere mal olur.
 */
export function unitProgram(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'MusicProgramV1',
    musicId: 'unit-loop',
    version: 1,
    title: 'Birim testi loop',
    description: 'Testlerin ortak küçük programı.',
    seed: 7,
    playback: 'loop',
    tempo: { bpm: 120 },
    meter: [4, 4],
    tonal: { system: 'minor', root: 'A2' },
    bars: 2,
    sampleRate: 44100,
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: 'reference/production/assets/music/unit-loop',
    },
    grooves: [
      { id: 'flat', swing: 0, timingJitter: 0, velocityJitter: 0, accents: [1] },
      { id: 'human', swing: 0.2, timingJitter: 0.02, velocityJitter: 0.3, accents: [1, 0.8] },
    ],
    motifs: [
      {
        id: 'seed',
        notes: [
          { degree: 0, beat: 0, beats: 0.5 },
          { degree: 2, beat: 0.5, beats: 0.5 },
          { degree: 4, beat: 1, beats: 1 },
        ],
      },
    ],
    stems: [{ id: 'main' }],
    lanes: [
      { id: 'bass', instrument: 'preset:subBass', stem: 'main', gain: 0.8, groove: 'flat' },
      { id: 'keys', instrument: 'preset:warmKeys', stem: 'main', gain: 0.5, pan: -0.1 },
      { id: 'lead', instrument: 'preset:harp', stem: 'main', gain: 0.4, octave: 2, groove: 'flat' },
    ],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 2],
        targetEnergy: 0.6,
        lanes: ['bass', 'keys', 'lead'],
        harmony: {
          voicing: { voices: 3, spread: 'close', register: [52, 76], maxMovement: 7 },
          chords: [
            { bar: 0, beat: 0, beats: 4, degree: 1, quality: 'triad' },
            { bar: 1, beat: 0, beats: 4, degree: 6, quality: 'triad' },
          ],
        },
        parts: [
          {
            lane: 'keys',
            source: 'chord',
            rhythm: [
              { bar: 0, beat: 0, beats: 3.5 },
              { bar: 1, beat: 0, beats: 3.5 },
            ],
          },
          {
            lane: 'bass',
            source: 'notes',
            notes: [
              { bar: 0, beat: 0, beats: 1, note: 'A2' },
              { bar: 1, beat: 0, beats: 1, note: 'F2' },
            ],
          },
          {
            lane: 'lead',
            source: 'motif',
            motif: 'seed',
            transforms: [],
            beats: 1,
            placements: [{ bar: 0, beat: 2 }],
          },
        ],
      },
    ],
    markers: [{ bar: 0, kind: 'loop-start' }],
    mastering: { integratedLufs: -16 },
    ...overrides,
  };
}

/** Üç stemli adaptive varyant; stem paritesi ve state QA testleri bunu kullanır. */
export function unitAdaptiveProgram(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = unitProgram();
  return {
    ...base,
    musicId: 'unit-adaptive',
    playback: 'adaptiveLoop',
    stems: [{ id: 'bed' }, { id: 'pulse' }, { id: 'lead' }],
    lanes: [
      { id: 'bass', instrument: 'preset:subBass', stem: 'bed', gain: 0.8, groove: 'flat' },
      { id: 'keys', instrument: 'preset:warmKeys', stem: 'pulse', gain: 0.5 },
      { id: 'lead', instrument: 'preset:harp', stem: 'lead', gain: 0.4, octave: 2, groove: 'flat' },
    ],
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: 'reference/production/assets/music/unit-adaptive',
    },
    adaptive: {
      states: [
        { id: 'calm', intensity: 0 },
        { id: 'peak', intensity: 1 },
      ],
      stems: [
        {
          stem: 'bed',
          gainMap: {
            intensity: [
              { threshold: 0, gain: 0.9 },
              { threshold: 1, gain: 1 },
            ],
          },
        },
        {
          stem: 'pulse',
          gainMap: {
            intensity: [
              { threshold: 0, gain: 0 },
              { threshold: 0.6, gain: 0.9 },
              { threshold: 1, gain: 1 },
            ],
          },
        },
        {
          stem: 'lead',
          gainMap: {
            intensity: [
              { threshold: 0, gain: 0 },
              { threshold: 0.8, gain: 0.8 },
              { threshold: 1, gain: 1 },
            ],
          },
        },
      ],
    },
    ...overrides,
  };
}

/** Derin kopya: testler belgeleri bozarken birbirini etkilemesin. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Bir belgenin iç alanını değiştirir (test tablolarında kullanılır). */
export function edited(
  document: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const copy = clone(document);
  let cursor = copy;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  if (value === undefined) delete cursor[path[path.length - 1]];
  else cursor[path[path.length - 1]] = value;
  return copy;
}
