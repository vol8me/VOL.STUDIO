import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * SIFIR SÜRÜKLENME — ambiyans yatağı, loop.
 *
 * 60 BPM zaman tabanı, 16 ölçü (~64 sn). Müzik değil: melodi ve ritim yok;
 * subBass tek pedal, detunedPad dört ölçü süren swell'ler, tüm parçada üç
 * seyrek zil ping'i. Dört faz:
 *   0-4   durgunluk  — A pedalı + Am swell
 *   4-8   salınım    — F swell, ilk ping
 *   8-12  derinlik   — Dm swell, ikinci ping
 *   12-16 geri dönüş — E swell, son ping, loop'a bağlanır
 */

const n = (bar: number, beat: number, beats: number, note: string, velocity = 0.7) => ({
  bar,
  beat,
  beats,
  note,
  velocity,
});

const part = (lane: string, notes: ReturnType<typeof n>[]) => ({ lane, source: 'notes', notes });

const within = (notes: ReturnType<typeof n>[], startBar: number) =>
  notes.map((note) => ({ ...note, bar: note.bar - startBar }));

const CH: Record<string, string[]> = {
  Am: ['A2', 'E3', 'C4'],
  F: ['F2', 'C3', 'A3'],
  Dm: ['D2', 'A2', 'F3'],
  E: ['E2', 'B2', 'G#3'],
};

const pedal = (bar: number, note: string) => n(bar, 0, 15.9, note, 0.26);

const swell = (bar: number, chord: string) =>
  CH[chord].map((note, index) => n(bar, 0, 15.9, note, 0.2 + index * 0.01));

export const nullDrift = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'null-drift',
  version: 1,
  title: 'Sıfır Sürüklenme',
  description:
    'Ambiyans: A pedalı, dört ölçülük pad swell’leri ve üç seyrek zil ping’i; melodi ve ritim yok, 64 sn loop.',
  seed: 202609306,
  playback: 'loop',
  tempo: { bpm: 60 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'A2' },
  bars: 16,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.3 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.32, pan: -0.08 },
    { id: 'ping', instrument: 'preset:bell', stem: 'main', gain: 0.2, pan: 0.2 },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-still',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.2,
      lanes: ['sub', 'pad'],
      parts: [part('sub', within([pedal(0, 'A1')], 0)), part('pad', within(swell(0, 'Am'), 0))],
    },
    {
      id: 'b-sway',
      role: 'body',
      bars: [4, 8],
      targetEnergy: 0.5,
      lanes: ['sub', 'pad', 'ping'],
      parts: [
        part('sub', within([pedal(4, 'A1')], 4)),
        part('pad', within(swell(4, 'F'), 4)),
        part('ping', within([n(5, 2, 3, 'A5', 0.22)], 4)),
      ],
    },
    {
      id: 'c-deepen',
      role: 'body',
      bars: [8, 12],
      targetEnergy: 0.5,
      lanes: ['sub', 'pad', 'ping'],
      parts: [
        part('sub', within([pedal(8, 'F1')], 8)),
        part('pad', within(swell(8, 'Dm'), 8)),
        part('ping', within([n(10, 1, 3, 'C6', 0.24)], 8)),
      ],
    },
    {
      id: 'd-return',
      role: 'release',
      bars: [12, 16],
      targetEnergy: 0.5,
      lanes: ['sub', 'pad', 'ping'],
      parts: [
        part('sub', within([pedal(12, 'G1')], 12)),
        part('pad', within(swell(12, 'E'), 12)),
        part('ping', within([n(14, 3, 2, 'E5', 0.2)], 12)),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetClass: 'ambience',
    assetDir: 'public/assets/audio/ambience/null-drift',
    files: { mix: 'public/assets/audio/ambience/null-drift.ogg' },
    runtimeKey: 'ambience-null-drift',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 16, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -24 },
});
