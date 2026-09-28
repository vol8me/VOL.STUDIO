import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * HÜKÜMDAR — boss parçası.
 *
 * 120 BPM, F# minör, 64 ölçü (~128 sn), dikişsiz loop. Karakter: ağır,
 * yarı-zaman davul (kick 0 ve 2, tom dolgular), alçak sub + org. İki fazlı;
 * faz 2'de melodi büyür:
 *   0-4   eşik       — sub pedal + org akoru
 *   4-28  faz 1      — yarı-zaman davul, inen tema
 *   28-32 ara        — davulsuz swell
 *   32-60 faz 2      — yükselen yeni tema, org stab, zil
 *   60-64 taht       — sub + org sönümü
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

const CH: Record<string, { bass: string[]; arp: string[]; pad: string[] }> = {
  'F#m': {
    bass: ['F#2', 'F#2', 'C#3', 'F#2'],
    arp: ['F#3', 'A3', 'C#4', 'F#4'],
    pad: ['F#2', 'C#3', 'A3'],
  },
  D: { bass: ['D2', 'D2', 'A2', 'D2'], arp: ['D3', 'F#3', 'A3', 'D4'], pad: ['D2', 'A2', 'F#3'] },
  Bm: { bass: ['B2', 'B2', 'F#3', 'B2'], arp: ['B3', 'D4', 'F#4', 'B4'], pad: ['B2', 'F#3', 'D4'] },
  'C#m': {
    bass: ['C#3', 'C#3', 'G#3', 'C#3'],
    arp: ['G#3', 'C#4', 'E4', 'G#4'],
    pad: ['C#3', 'G#3', 'E4'],
  },
  E: { bass: ['E2', 'E2', 'B2', 'E2'], arp: ['E3', 'G#3', 'B3', 'E4'], pad: ['E2', 'B2', 'G#3'] },
};

const ROOT1: Record<string, string> = { 'F#m': 'F#1', D: 'D1', Bm: 'B1', 'C#m': 'C#1', E: 'E1' };

const plan = (bars: number[], chords: string[]) =>
  bars.map((bar, index) => ({ bar, chord: chords[index % chords.length] }));

const range = (from: number, bars: number) => Array.from({ length: bars }, (_, i) => from + i);

const eighths = (bar: number, cycle: string[], velocity: number, beats = 0.45) =>
  Array.from({ length: 8 }, (_, i) => n(bar, i * 0.5, beats, cycle[i % cycle.length], velocity));

const sixteenths = (bar: number, cycle: string[], velocity: number) =>
  Array.from({ length: 16 }, (_, i) => n(bar, i * 0.25, 0.2, cycle[i % cycle.length], velocity));

const eighthBeats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];

const kick = (bar: number, beats: number[], velocity = 0.9) =>
  beats.map((beat) => n(bar, beat, 0.22, 'A1', velocity));

const snare = (bar: number, beats: number[], velocity = 0.68) =>
  beats.map((beat) => n(bar, beat, 0.2, 'E2', velocity));

const tom = (bar: number, beats: number[], velocity = 0.72) =>
  beats.map((beat) => n(bar, beat, 0.24, 'D2', velocity));

const hat = (bar: number, beats: number[], velocity = 0.28) =>
  beats.map((beat) => n(bar, beat, 0.15, 'F#2', velocity));

const up = (notes: string[]) =>
  notes.map((note) => note.replace(/(\d)$/, (_, d) => String(Number(d) + 1)));

const PHASE_ONE = [
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'E',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'E',
  'F#m',
  'D',
  'Bm',
  'C#m',
];
const PHASE_TWO = [
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
  'F#m',
  'D',
  'Bm',
  'C#m',
];

const leadPhaseOne = [
  n(4, 0, 2, 'F#4', 0.7),
  n(4, 2, 2, 'A4', 0.72),
  n(5, 0, 3, 'C#5', 0.74),
  n(5, 3, 1, 'B4', 0.68),
  n(6, 0, 2, 'A4', 0.7),
  n(6, 2, 2, 'F#4', 0.68),
  n(7, 0, 4, 'E4', 0.66),
  n(8, 0, 2, 'F#4', 0.7),
  n(8, 2, 2, 'B4', 0.72),
  n(9, 0, 3, 'D5', 0.74),
  n(9, 3, 1, 'C#5', 0.7),
  n(10, 0, 2, 'B4', 0.7),
  n(10, 2, 2, 'A4', 0.68),
  n(11, 0, 2, 'G#4', 0.68),
  n(11, 2, 2, 'F#4', 0.66),
  n(12, 0, 2, 'C#5', 0.74),
  n(12, 2, 2, 'B4', 0.72),
  n(13, 0, 3, 'A4', 0.7),
  n(13, 3, 1, 'F#4', 0.68),
  n(14, 0, 2, 'E4', 0.68),
  n(14, 2, 2, 'F#4', 0.7),
  n(15, 0, 4, 'A4', 0.72),
  n(16, 0, 2, 'B4', 0.72),
  n(16, 2, 2, 'C#5', 0.74),
  n(17, 0, 3, 'E5', 0.78),
  n(17, 3, 1, 'D5', 0.74),
  n(18, 0, 2, 'C#5', 0.74),
  n(18, 2, 2, 'B4', 0.72),
  n(19, 0, 4, 'C#5', 0.76),
  n(20, 0, 2, 'F#4', 0.72),
  n(20, 2, 2, 'C#5', 0.76),
  n(21, 0, 3, 'B4', 0.74),
  n(21, 3, 1, 'A4', 0.7),
  n(22, 0, 1, 'G#4', 0.7),
  n(22, 1, 1, 'A4', 0.7),
  n(22, 2, 2, 'B4', 0.72),
  n(23, 0, 4, 'C#5', 0.76),
  n(24, 0, 1, 'D5', 0.76),
  n(24, 1, 1, 'C#5', 0.74),
  n(24, 2, 1, 'B4', 0.72),
  n(24, 3, 1, 'A4', 0.7),
  n(25, 0, 2, 'G#4', 0.72),
  n(25, 2, 2, 'F#4', 0.7),
  n(26, 0, 2, 'E4', 0.7),
  n(26, 2, 2, 'F#4', 0.72),
  n(27, 0, 1, 'G#4', 0.74),
  n(27, 1, 1, 'B4', 0.76),
  n(27, 2, 2, 'C#5', 0.78),
];

const leadPhaseTwo = [
  n(32, 0, 1, 'F#4', 0.76),
  n(32, 1, 1, 'A4', 0.78),
  n(32, 2, 2, 'C#5', 0.82),
  n(33, 0, 1, 'B4', 0.78),
  n(33, 1, 1, 'C#5', 0.8),
  n(33, 2, 2, 'D5', 0.84),
  n(34, 0, 1, 'A4', 0.78),
  n(34, 1, 1, 'B4', 0.8),
  n(34, 2, 2, 'F#5', 0.86),
  n(35, 0, 2, 'E5', 0.82),
  n(35, 2, 2, 'D5', 0.8),
  n(36, 0, 1, 'C#5', 0.8),
  n(36, 1, 1, 'D5', 0.82),
  n(36, 2, 2, 'F#5', 0.86),
  n(37, 0, 1, 'E5', 0.82),
  n(37, 1, 1, 'D5', 0.8),
  n(37, 2, 2, 'C#5', 0.8),
  n(38, 0, 1, 'B4', 0.8),
  n(38, 1, 1, 'C#5', 0.82),
  n(38, 2, 2, 'E5', 0.86),
  n(39, 0, 4, 'C#5', 0.84),
  n(40, 0, 1, 'A4', 0.78),
  n(40, 1, 1, 'C#5', 0.8),
  n(40, 2, 2, 'F#5', 0.88),
  n(41, 0, 2, 'E5', 0.84),
  n(41, 2, 2, 'C#5', 0.8),
  n(42, 0, 1, 'D5', 0.82),
  n(42, 1, 1, 'F#5', 0.86),
  n(42, 2, 2, 'A5', 0.9),
  n(43, 0, 2, 'G#5', 0.88),
  n(43, 2, 2, 'F#5', 0.86),
  n(44, 0, 1, 'E5', 0.84),
  n(44, 1, 1, 'D5', 0.82),
  n(44, 2, 2, 'B4', 0.8),
  n(45, 0, 1, 'C#5', 0.82),
  n(45, 1, 1, 'B4', 0.8),
  n(45, 2, 2, 'A4', 0.78),
  n(46, 0, 1, 'G#4', 0.78),
  n(46, 1, 1, 'A4', 0.8),
  n(46, 2, 2, 'B4', 0.82),
  n(47, 0, 4, 'C#5', 0.84),
  n(48, 0, 2, 'F#5', 0.86),
  n(48, 2, 2, 'E5', 0.84),
  n(49, 0, 2, 'D5', 0.84),
  n(49, 2, 2, 'C#5', 0.82),
  n(50, 0, 2, 'B4', 0.82),
  n(50, 2, 2, 'D5', 0.84),
  n(51, 0, 4, 'F#5', 0.88),
  n(52, 0, 2, 'E5', 0.84),
  n(52, 2, 2, 'D5', 0.82),
  n(53, 0, 2, 'C#5', 0.82),
  n(53, 2, 2, 'B4', 0.8),
  n(54, 0, 2, 'A4', 0.8),
  n(54, 2, 2, 'C#5', 0.84),
  n(55, 0, 4, 'E5', 0.86),
  n(56, 0, 1, 'F#5', 0.88),
  n(56, 1, 1, 'G#5', 0.9),
  n(56, 2, 2, 'A5', 0.92),
  n(57, 0, 2, 'G#5', 0.9),
  n(57, 2, 2, 'F#5', 0.88),
  n(58, 0, 1, 'E5', 0.86),
  n(58, 1, 1, 'D5', 0.84),
  n(58, 2, 2, 'C#5', 0.86),
  n(59, 0, 4, 'F#5', 0.9),
];

export const sovereign = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'sovereign',
  version: 1,
  title: 'Hükümdar',
  description:
    'F# minör boss: yarı-zaman davul, alçak sub ve org üstünde iki fazlı melodi; ağır 64 ölçü loop.',
  seed: 202609303,
  playback: 'loop',
  tempo: { bpm: 120 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'F#2' },
  bars: 64,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'bass', instrument: 'preset:dubBass', stem: 'main', gain: 0.4 },
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.34 },
    { id: 'organ', instrument: 'preset:drawbarOrgan', stem: 'main', gain: 0.3, pan: -0.15 },
    { id: 'lead', instrument: 'preset:softLead', stem: 'main', gain: 0.4 },
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.24, pan: 0.18 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.24, pan: -0.1 },
    { id: 'drums', instrument: 'inst:throne-kit', stem: 'main', gain: 0.44 },
  ],
  instruments: [
    {
      id: 'throne-kit',
      role: 'percussion',
      polyphony: 6,
      velocity: { rangeDb: 12 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.3, attack: 0.35, decay: 0.48 } },
          { note: 'D2', model: 'tom', macros: { tune: -0.35, tone: 0.22, decay: 0.38 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.45, attack: 0.5, decay: 0.3 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.5, attack: 0.32, decay: 0.2 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-threshold',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.35,
      lanes: ['sub', 'organ'],
      parts: [
        part('sub', within([n(0, 0, 7.9, 'F#1', 0.34), n(2, 0, 7.9, 'C#1', 0.32)], 0)),
        part(
          'organ',
          within(
            [
              ...CH['F#m'].pad.map((note) => n(0, 0, 7.9, note, 0.3)),
              ...CH.D.pad.map((note) => n(2, 0, 7.9, note, 0.32)),
            ],
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-phase-one',
      role: 'body',
      bars: [4, 28],
      targetEnergy: 0.75,
      lanes: ['bass', 'sub', 'organ', 'lead', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(4, 24), PHASE_ONE).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.66),
            ),
            4,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(4, 24), PHASE_ONE).map(({ bar, chord }) =>
              n(bar, 0, 3.9, ROOT1[chord], 0.34),
            ),
            4,
          ),
        ),
        part(
          'organ',
          within(
            plan(range(4, 24), PHASE_ONE).flatMap(({ bar, chord }) =>
              [1.5, 3.5].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.3, note, 0.48)),
              ),
            ),
            4,
          ),
        ),
        part('lead', within(leadPhaseOne, 4)),
        part(
          'pad',
          within(
            plan(range(4, 24), PHASE_ONE).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.3)),
            ),
            4,
          ),
        ),
        part(
          'drums',
          within(
            range(4, 24).flatMap((bar, i) => [
              ...kick(bar, [0, 2]),
              ...snare(bar, [2], 0.62),
              ...hat(bar, eighthBeats, 0.24),
              ...(i % 4 === 3 ? [...tom(bar, [3, 3.25, 3.5, 3.75], 0.78)] : []),
            ]),
            4,
          ),
        ),
      ],
    },
    {
      id: 'c-interlude',
      role: 'bridge',
      bars: [28, 32],
      targetEnergy: 0.45,
      lanes: ['sub', 'pad', 'lead', 'bell'],
      parts: [
        part('sub', within([n(28, 0, 7.9, 'D1', 0.32), n(30, 0, 7.9, 'C#1', 0.34)], 28)),
        part(
          'pad',
          within(
            [
              ...CH.Bm.pad.map((note) => n(28, 0, 7.9, note, 0.32)),
              ...CH['C#m'].pad.map((note) => n(30, 0, 7.9, note, 0.34)),
            ],
            28,
          ),
        ),
        part('lead', within([n(28, 0, 3, 'F#4', 0.6), n(30, 0, 3, 'C#5', 0.64)], 28)),
        part('bell', within([n(29, 2, 1.5, 'F#5', 0.28), n(31, 2, 1.5, 'E5', 0.3)], 28)),
      ],
    },
    {
      id: 'd-phase-two',
      role: 'peak',
      bars: [32, 60],
      targetEnergy: 0.9,
      lanes: ['bass', 'sub', 'organ', 'lead', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(32, 28), PHASE_TWO).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.68),
            ),
            32,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(32, 28), PHASE_TWO).map(({ bar, chord }) =>
              n(bar, 0, 3.9, ROOT1[chord], 0.36),
            ),
            32,
          ),
        ),
        part(
          'organ',
          within(
            plan(range(32, 28), PHASE_TWO).flatMap(({ bar, chord }) =>
              [1.5, 3.5].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.3, note, 0.52)),
              ),
            ),
            32,
          ),
        ),
        part('lead', within(leadPhaseTwo, 32)),
        part(
          'bell',
          within(
            range(48, 12).flatMap((bar) => eighths(bar, up(CH[PHASE_TWO[bar - 32]].arp), 0.26)),
            32,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(32, 28), PHASE_TWO).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.34)),
            ),
            32,
          ),
        ),
        part(
          'drums',
          within(
            range(32, 28).flatMap((bar, i) => [
              ...kick(bar, [0, 2]),
              ...tom(bar, [1, 3], 0.72),
              ...snare(bar, [2], 0.66),
              ...hat(bar, eighthBeats, 0.26),
              ...(i % 4 === 3 ? [...tom(bar, [3, 3.25, 3.5, 3.75], 0.84)] : []),
            ]),
            32,
          ),
        ),
      ],
    },
    {
      id: 'e-throne',
      role: 'release',
      bars: [60, 64],
      targetEnergy: 0.3,
      lanes: ['sub', 'organ', 'bell'],
      parts: [
        part('sub', within([n(60, 0, 7.9, 'F#1', 0.3), n(62, 0, 7.9, 'F#1', 0.26)], 60)),
        part(
          'organ',
          within(
            CH['F#m'].pad.map((note) => n(60, 0, 15.9, note, 0.24)),
            60,
          ),
        ),
        part('bell', within([n(62, 2, 1.5, 'F#5', 0.24), n(63, 2, 1.5, 'C#6', 0.22)], 60)),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/sovereign',
    files: { mix: 'public/assets/audio/music/boss/sovereign.ogg' },
    runtimeKey: 'music-sovereign',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 64, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -18 },
});
