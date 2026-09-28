import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * DERİN AKINTI — ambiyans yatağı, loop.
 *
 * 60 BPM zaman tabanı, 16 ölçü (~64 sn). Sıfır Sürüklenme'den daha alçak ve
 * karanlık: D pedalı, pad yerine cello uzun tonları ve sub; tüm parçada üç
 * çok yumuşak kick. Dört faz:
 *   0-4   batış      — D pedalı, D2-A2 cello
 *   4-8   karanlık   — F pedalı, F2-C3 cello, ilk vuruş
 *   8-12  basınç     — C pedalı, üst üste Dm rengi
 *   12-16 yüzey      — D pedalı, G-D-E cello, loop'a bağlanır
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

const pedal = (bar: number, note: string) => n(bar, 0, 15.9, note, 0.3);

const tone = (bar: number, note: string, beats = 7.9, velocity = 0.26) =>
  n(bar, 0, beats, note, velocity);

const hit = (bar: number, beat: number, velocity: number) => n(bar, beat, 0.3, 'A1', velocity);

export const deepCurrent = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'deep-current',
  version: 1,
  title: 'Derin Akıntı',
  description:
    'Ambiyans: D pedalı, cello uzun tonları ve sub üzerinde üç yumuşak kick; pad yok, 64 sn loop.',
  seed: 202609307,
  playback: 'loop',
  tempo: { bpm: 60 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'D2' },
  bars: 16,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.32 },
    { id: 'cello', instrument: 'preset:cello', stem: 'main', gain: 0.34, pan: -0.08 },
    { id: 'drums', instrument: 'inst:abyss-kit', stem: 'main', gain: 0.3 },
  ],
  instruments: [
    {
      id: 'abyss-kit',
      role: 'percussion',
      polyphony: 4,
      velocity: { rangeDb: 6 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.2, attack: 0.3, decay: 0.55 } },
          { note: 'D2', model: 'tom', macros: { tune: -0.5, tone: 0.15, decay: 0.45 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.35, attack: 0.45, decay: 0.35 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.35, attack: 0.3, decay: 0.25 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-sink',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.2,
      lanes: ['sub', 'cello'],
      parts: [
        part('sub', within([pedal(0, 'D1')], 0)),
        part('cello', within([tone(0, 'D2'), tone(2, 'A2')], 0)),
      ],
    },
    {
      id: 'b-dark',
      role: 'body',
      bars: [4, 8],
      targetEnergy: 0.5,
      lanes: ['sub', 'cello', 'drums'],
      parts: [
        part('sub', within([pedal(4, 'F1')], 4)),
        part('cello', within([tone(4, 'F2'), tone(6, 'C3')], 4)),
        part('drums', within([hit(7, 3.5, 0.18)], 4)),
      ],
    },
    {
      id: 'c-pressure',
      role: 'body',
      bars: [8, 12],
      targetEnergy: 0.6,
      lanes: ['sub', 'cello', 'drums'],
      parts: [
        part('sub', within([pedal(8, 'C1')], 8)),
        part('cello', within([tone(8, 'D2'), tone(10, 'A2'), tone(10, 'F2', 7.9, 0.24)], 8)),
        part('drums', within([hit(11, 1, 0.2)], 8)),
      ],
    },
    {
      id: 'd-resurface',
      role: 'release',
      bars: [12, 16],
      targetEnergy: 0.6,
      lanes: ['sub', 'cello', 'drums'],
      parts: [
        part('sub', within([pedal(12, 'D1')], 12)),
        part('cello', within([tone(12, 'G2'), tone(14, 'D2'), tone(15, 'E2', 3.9, 0.22)], 12)),
        part('drums', within([hit(14, 3, 0.15)], 12)),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetClass: 'ambience',
    assetDir: 'public/assets/audio/ambience/deep-current',
    files: { mix: 'public/assets/audio/ambience/deep-current.ogg' },
    runtimeKey: 'ambience-deep-current',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 16, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -24 },
});
