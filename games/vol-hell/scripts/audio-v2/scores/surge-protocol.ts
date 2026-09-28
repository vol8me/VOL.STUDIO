import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * DALGA PROTOKOLÜ — aksiyon parçası.
 *
 * 144 BPM, D minör, 64 ölçü (~107 sn), dikişsiz loop. Karakter: yuvarlanan
 * 8'lik bas, tom ağırlıklı davul, iki ayrı hook. Yedi faz:
 *   0-4   ateşleme   — sub pedal + pad
 *   4-20  dalga 1    — hook A, tam davul
 *   20-24 nefes      — davulsuz kırılma
 *   24-44 dalga 2    — hook B, org stab + zil
 *   44-48 köprü      — bas yürüyüşü, zil
 *   48-60 doruk      — hook B gelişimi, en yoğun
 *   60-64 sönüm      — katmanlar iner
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
  Dm: { bass: ['D2', 'D2', 'A2', 'D2'], arp: ['D3', 'F3', 'A3', 'D4'], pad: ['D2', 'A2', 'F3'] },
  F: { bass: ['F2', 'F2', 'C3', 'F2'], arp: ['F3', 'A3', 'C4', 'F4'], pad: ['F2', 'C3', 'A3'] },
  Gm: { bass: ['G2', 'G2', 'D3', 'G2'], arp: ['G3', 'A#3', 'D4', 'G4'], pad: ['G2', 'D3', 'A#3'] },
  C: { bass: ['C3', 'C3', 'G3', 'C3'], arp: ['C3', 'E3', 'G3', 'C4'], pad: ['C3', 'G3', 'E4'] },
  Bb: {
    bass: ['A#1', 'F2', 'A#2', 'F2'],
    arp: ['A#3', 'D4', 'F4', 'A#4'],
    pad: ['A#2', 'F3', 'D4'],
  },
};

const ROOT1: Record<string, string> = { Dm: 'D1', F: 'F1', Gm: 'G1', C: 'C1', Bb: 'A#1' };

const plan = (bars: number[], chords: string[]) =>
  bars.map((bar, index) => ({ bar, chord: chords[index % chords.length] }));

const range = (from: number, bars: number) => Array.from({ length: bars }, (_, i) => from + i);

const eighths = (bar: number, cycle: string[], velocity: number, beats = 0.45) =>
  Array.from({ length: 8 }, (_, i) => n(bar, i * 0.5, beats, cycle[i % cycle.length], velocity));

const sixteenths = (bar: number, cycle: string[], velocity: number) =>
  Array.from({ length: 16 }, (_, i) => n(bar, i * 0.25, 0.2, cycle[i % cycle.length], velocity));

const eighthBeats = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
const sixteenthBeats = Array.from({ length: 16 }, (_, i) => i * 0.25);

const kick = (bar: number, beats: number[], velocity = 0.85) =>
  beats.map((beat) => n(bar, beat, 0.2, 'A1', velocity));

const snare = (bar: number, beats: number[], velocity = 0.7) =>
  beats.map((beat) => n(bar, beat, 0.2, 'E2', velocity));

const tom = (bar: number, beats: number[], velocity = 0.75) =>
  beats.map((beat) => n(bar, beat, 0.22, 'D2', velocity));

const hat = (bar: number, beats: number[], velocity = 0.3) =>
  beats.map((beat) => n(bar, beat, 0.15, 'F#2', velocity));

const up = (notes: string[]) =>
  notes.map((note) => note.replace(/(\d)$/, (_, d) => String(Number(d) + 1)));

const WAVE_ONE = [
  'Dm',
  'Dm',
  'Bb',
  'Bb',
  'F',
  'F',
  'C',
  'C',
  'Dm',
  'Dm',
  'Bb',
  'Bb',
  'Gm',
  'Gm',
  'C',
  'C',
];
const WAVE_TWO = [
  'Dm',
  'Dm',
  'Bb',
  'Bb',
  'F',
  'F',
  'C',
  'C',
  'Dm',
  'Dm',
  'Bb',
  'Bb',
  'Gm',
  'Gm',
  'C',
  'C',
  'Dm',
  'Bb',
  'C',
  'C',
];
const BRIDGE = ['F', 'Gm', 'Bb', 'C'];
const PEAK = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C', 'Gm', 'Gm', 'Bb', 'C'];

const melA = [
  n(4, 0, 1, 'A4', 0.7),
  n(4, 1, 1, 'D5', 0.74),
  n(4, 2, 1, 'F5', 0.76),
  n(4, 3, 1, 'E5', 0.72),
  n(5, 0, 2, 'D5', 0.74),
  n(5, 2, 2, 'A4', 0.7),
  n(6, 0, 1, 'F5', 0.76),
  n(6, 1, 1, 'A5', 0.8),
  n(6, 2, 1, 'G5', 0.76),
  n(6, 3, 1, 'F5', 0.74),
  n(7, 0, 4, 'D5', 0.74),
  n(8, 0, 1, 'C5', 0.72),
  n(8, 1, 1, 'F5', 0.76),
  n(8, 2, 1, 'A5', 0.8),
  n(8, 3, 1, 'G5', 0.76),
  n(9, 0, 2, 'F5', 0.74),
  n(9, 2, 2, 'E5', 0.72),
  n(10, 0, 1, 'G5', 0.76),
  n(10, 1, 1, 'E5', 0.74),
  n(10, 2, 1, 'C5', 0.72),
  n(10, 3, 1, 'E5', 0.74),
  n(11, 0, 4, 'G5', 0.78),
  n(12, 0, 1, 'D5', 0.74),
  n(12, 1, 1, 'F5', 0.76),
  n(12, 2, 1, 'A5', 0.8),
  n(12, 3, 1, 'D6', 0.82),
  n(13, 0, 2, 'C6', 0.8),
  n(13, 2, 2, 'A5', 0.78),
  n(14, 0, 1, 'A#5', 0.78),
  n(14, 1, 1, 'G5', 0.76),
  n(14, 2, 1, 'E5', 0.74),
  n(14, 3, 1, 'G5', 0.76),
  n(15, 0, 4, 'E6', 0.82),
  n(16, 0, 1, 'F5', 0.76),
  n(16, 1, 1, 'A5', 0.8),
  n(16, 2, 1, 'C6', 0.82),
  n(16, 3, 1, 'A5', 0.78),
  n(17, 0, 2, 'G5', 0.78),
  n(17, 2, 2, 'F5', 0.76),
  n(18, 0, 1, 'E5', 0.76),
  n(18, 1, 1, 'G5', 0.78),
  n(18, 2, 2, 'C6', 0.82),
  n(19, 0, 4, 'D6', 0.84),
];

const melB = [
  n(24, 0, 1.5, 'D5', 0.76),
  n(24, 1.5, 0.5, 'F5', 0.76),
  n(24, 2, 2, 'A5', 0.8),
  n(25, 0, 1, 'G5', 0.76),
  n(25, 1, 1, 'F5', 0.74),
  n(25, 2, 2, 'E5', 0.74),
  n(26, 0, 1.5, 'F5', 0.76),
  n(26, 1.5, 0.5, 'A5', 0.78),
  n(26, 2, 2, 'C6', 0.82),
  n(27, 0, 1, 'A#5', 0.8),
  n(27, 1, 1, 'A5', 0.78),
  n(27, 2, 2, 'F5', 0.76),
  n(28, 0, 1, 'C5', 0.74),
  n(28, 1, 1, 'E5', 0.76),
  n(28, 2, 2, 'G5', 0.78),
  n(29, 0, 1, 'F5', 0.76),
  n(29, 1, 1, 'E5', 0.74),
  n(29, 2, 2, 'D5', 0.74),
  n(30, 0, 1, 'E5', 0.74),
  n(30, 1, 1, 'G5', 0.76),
  n(30, 2, 2, 'C6', 0.82),
  n(31, 0, 4, 'D6', 0.86),
  n(32, 0, 1, 'D6', 0.84),
  n(32, 1, 1, 'C6', 0.8),
  n(32, 2, 1, 'A5', 0.78),
  n(32, 3, 1, 'F5', 0.76),
  n(33, 0, 2, 'A5', 0.8),
  n(33, 2, 2, 'C6', 0.82),
  n(34, 0, 1, 'A#5', 0.8),
  n(34, 1, 1, 'C6', 0.82),
  n(34, 2, 2, 'D6', 0.86),
  n(35, 0, 1, 'A5', 0.8),
  n(35, 1, 1, 'F5', 0.78),
  n(35, 2, 2, 'D5', 0.76),
  n(36, 0, 1, 'E5', 0.78),
  n(36, 1, 1, 'G5', 0.8),
  n(36, 2, 1, 'C6', 0.84),
  n(36, 3, 1, 'B5', 0.8),
  n(37, 0, 2, 'G5', 0.8),
  n(37, 2, 2, 'E5', 0.78),
  n(38, 0, 1, 'F5', 0.78),
  n(38, 1, 1, 'E5', 0.76),
  n(38, 2, 1, 'D5', 0.76),
  n(38, 3, 1, 'C5', 0.74),
  n(39, 0, 1, 'A#4', 0.74),
  n(39, 1, 1, 'D5', 0.76),
  n(39, 2, 2, 'G5', 0.8),
  n(40, 0, 1, 'D6', 0.84),
  n(40, 1, 1, 'A5', 0.8),
  n(40, 2, 1, 'F5', 0.78),
  n(40, 3, 1, 'D5', 0.76),
  n(41, 0, 2, 'F5', 0.78),
  n(41, 2, 2, 'A5', 0.8),
  n(42, 0, 1, 'G5', 0.8),
  n(42, 1, 1, 'E5', 0.78),
  n(42, 2, 2, 'C6', 0.84),
  n(43, 0, 4, 'C6', 0.82),
];

const melPeak = [
  n(48, 0, 1, 'D5', 0.82),
  n(48, 1, 1, 'F5', 0.84),
  n(48, 2, 2, 'A5', 0.86),
  n(49, 0, 1, 'G5', 0.84),
  n(49, 1, 1, 'F5', 0.82),
  n(49, 2, 2, 'E5', 0.82),
  n(50, 0, 1.5, 'F5', 0.84),
  n(50, 1.5, 0.5, 'A5', 0.86),
  n(50, 2, 2, 'C6', 0.88),
  n(51, 0, 1, 'A#5', 0.86),
  n(51, 1, 1, 'A5', 0.84),
  n(51, 2, 2, 'F5', 0.82),
  n(52, 0, 1, 'C5', 0.82),
  n(52, 1, 1, 'E5', 0.84),
  n(52, 2, 2, 'G5', 0.86),
  n(53, 0, 1, 'F5', 0.84),
  n(53, 1, 1, 'E5', 0.82),
  n(53, 2, 2, 'D5', 0.82),
  n(54, 0, 1, 'E5', 0.82),
  n(54, 1, 1, 'G5', 0.84),
  n(54, 2, 2, 'C6', 0.88),
  n(55, 0, 4, 'D6', 0.9),
  n(56, 0, 1, 'D6', 0.88),
  n(56, 1, 1, 'C6', 0.86),
  n(56, 2, 1, 'A5', 0.84),
  n(56, 3, 1, 'G5', 0.82),
  n(57, 0, 2, 'F5', 0.84),
  n(57, 2, 2, 'A5', 0.86),
  n(58, 0, 1, 'G5', 0.86),
  n(58, 1, 1, 'E5', 0.84),
  n(58, 2, 2, 'C6', 0.88),
  n(59, 0, 4, 'D6', 0.9),
];

export const surgeProtocol = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'surge-protocol',
  version: 1,
  title: 'Dalga Protokolü',
  description:
    'D minör aksiyon: yuvarlanan bas, tom ağırlıklı davul, iki hook ve org-zil doruk; 64 ölçü dikişsiz loop.',
  seed: 202609302,
  playback: 'loop',
  tempo: { bpm: 144 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'D2' },
  bars: 64,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'bass', instrument: 'preset:dubBass', stem: 'main', gain: 0.4 },
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.3 },
    { id: 'organ', instrument: 'preset:drawbarOrgan', stem: 'main', gain: 0.28, pan: -0.16 },
    { id: 'arp', instrument: 'preset:metalPluck', stem: 'main', gain: 0.4 },
    { id: 'hook', instrument: 'preset:softLead', stem: 'main', gain: 0.38 },
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.26, pan: 0.18 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.24, pan: -0.1 },
    { id: 'drums', instrument: 'inst:surge-kit', stem: 'main', gain: 0.3 },
  ],
  instruments: [
    {
      id: 'surge-kit',
      role: 'percussion',
      polyphony: 6,
      velocity: { rangeDb: 10 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.4, attack: 0.4, decay: 0.38 } },
          { note: 'D2', model: 'tom', macros: { tune: -0.15, tone: 0.32, decay: 0.3 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.58, attack: 0.5, decay: 0.26 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.6, attack: 0.3, decay: 0.18 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-ignition',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.35,
      lanes: ['sub', 'pad'],
      parts: [
        part(
          'sub',
          within(
            [0, 1, 2, 3].map((bar) => n(bar, 0, 3.9, 'D1', 0.34)),
            0,
          ),
        ),
        part(
          'pad',
          within(
            [
              ...CH.Dm.pad.map((note) => n(0, 0, 7.9, note, 0.26)),
              ...CH.Bb.pad.map((note) => n(2, 0, 7.9, note, 0.28)),
            ],
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-wave-one',
      role: 'body',
      bars: [4, 20],
      targetEnergy: 0.8,
      lanes: ['bass', 'sub', 'arp', 'hook', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(4, 16), WAVE_ONE).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.64),
            ),
            4,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(4, 16), WAVE_ONE).map(({ bar, chord }) =>
              n(bar, 0, 3.9, ROOT1[chord], 0.32),
            ),
            4,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(4, 16), WAVE_ONE).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].arp, 0.44),
            ),
            4,
          ),
        ),
        part('hook', within(melA, 4)),
        part(
          'pad',
          within(
            plan(range(4, 16), WAVE_ONE).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.32)),
            ),
            4,
          ),
        ),
        part(
          'drums',
          within(
            range(4, 16).flatMap((bar) => [
              ...kick(bar, [0, 2]),
              ...tom(bar, [1, 3], 0.72),
              ...hat(bar, eighthBeats, 0.26),
              ...(bar % 4 === 3 ? [...tom(bar, [2.5, 3, 3.5], 0.8), ...snare(bar, [3], 0.62)] : []),
            ]),
            4,
          ),
        ),
      ],
    },
    {
      id: 'c-breath',
      role: 'bridge',
      bars: [20, 24],
      targetEnergy: 0.5,
      lanes: ['sub', 'pad', 'hook', 'bell'],
      parts: [
        part(
          'sub',
          within(
            [
              n(20, 0, 3.9, 'F1', 0.34),
              n(21, 0, 3.9, 'F1', 0.32),
              n(22, 0, 3.9, 'G1', 0.34),
              n(23, 0, 3.9, 'G1', 0.32),
            ],
            20,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(20, 4), ['F', 'F', 'Gm', 'Gm']).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.3)),
            ),
            20,
          ),
        ),
        part('hook', within([n(20, 0, 3, 'A4', 0.62), n(22, 0, 3, 'A#4', 0.64)], 20)),
        part('bell', within([n(21, 2, 1.5, 'D6', 0.3), n(23, 2, 1.5, 'C6', 0.3)], 20)),
      ],
    },
    {
      id: 'd-wave-two',
      role: 'body',
      bars: [24, 44],
      targetEnergy: 0.95,
      lanes: ['bass', 'sub', 'arp', 'hook', 'organ', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(24, 20), WAVE_TWO).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.66),
            ),
            24,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(24, 20), WAVE_TWO).map(({ bar, chord }) =>
              n(bar, 0, 3.9, ROOT1[chord], 0.32),
            ),
            24,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(24, 20), WAVE_TWO).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].arp, 0.46),
            ),
            24,
          ),
        ),
        part('hook', within(melB, 24)),
        part(
          'organ',
          within(
            plan(range(24, 20), WAVE_TWO).flatMap(({ bar, chord }) =>
              [0, 2].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.24, note, 0.5)),
              ),
            ),
            24,
          ),
        ),
        part(
          'bell',
          within(
            range(36, 8).flatMap((bar) => eighths(bar, up(CH[WAVE_TWO[bar - 24]].arp), 0.26)),
            24,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(24, 20), WAVE_TWO).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.34)),
            ),
            24,
          ),
        ),
        part(
          'drums',
          within(
            range(24, 20).flatMap((bar) => [
              ...kick(bar, [0, 1.5, 2]),
              ...snare(bar, [1, 3], 0.66),
              ...tom(bar, [2.5, 3.5], 0.72),
              ...hat(bar, sixteenthBeats, 0.26),
              ...(bar % 4 === 3 ? tom(bar, [3.25, 3.75], 0.82) : []),
            ]),
            24,
          ),
        ),
      ],
    },
    {
      id: 'e-bridge',
      role: 'bridge',
      bars: [44, 48],
      targetEnergy: 0.65,
      lanes: ['bass', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(44, 4), BRIDGE).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.6),
            ),
            44,
          ),
        ),
        part(
          'bell',
          within(
            plan(range(44, 4), BRIDGE).flatMap(({ bar, chord }) =>
              eighths(bar, up(CH[chord].arp), 0.28),
            ),
            44,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(44, 4), BRIDGE).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.32)),
            ),
            44,
          ),
        ),
        part(
          'drums',
          within(
            range(44, 4).flatMap((bar) => [
              ...kick(bar, [0, 2], 0.8),
              ...snare(bar, [1, 3], 0.6),
              ...hat(bar, eighthBeats, 0.24),
            ]),
            44,
          ),
        ),
      ],
    },
    {
      id: 'f-peak',
      role: 'peak',
      bars: [48, 60],
      targetEnergy: 1,
      lanes: ['bass', 'sub', 'arp', 'hook', 'organ', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(48, 12), PEAK).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].bass, 0.6),
            ),
            48,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(48, 12), PEAK).map(({ bar, chord }) => n(bar, 0, 3.9, ROOT1[chord], 0.34)),
            48,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(48, 12), PEAK).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].arp, 0.5),
            ),
            48,
          ),
        ),
        part('hook', within(melPeak, 48)),
        part(
          'organ',
          within(
            plan(range(48, 12), PEAK).flatMap(({ bar, chord }) =>
              [1.5, 3.5].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.22, note, 0.54)),
              ),
            ),
            48,
          ),
        ),
        part(
          'bell',
          within(
            range(52, 8).flatMap((bar) => eighths(bar, up(CH[PEAK[bar - 48]].arp), 0.28)),
            48,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(48, 12), PEAK).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.38)),
            ),
            48,
          ),
        ),
        part(
          'drums',
          within(
            range(48, 12).flatMap((bar) => [
              ...kick(bar, [0, 1.5, 2, 3.5]),
              ...snare(bar, [1, 3]),
              ...tom(bar, [2.5], 0.76),
              ...hat(bar, sixteenthBeats, 0.3),
              ...(bar % 4 === 3 ? tom(bar, [3, 3.25, 3.5, 3.75], 0.84) : []),
            ]),
            48,
          ),
        ),
      ],
    },
    {
      id: 'g-fade',
      role: 'release',
      bars: [60, 64],
      targetEnergy: 0.3,
      lanes: ['sub', 'bass', 'pad', 'drums'],
      parts: [
        part(
          'sub',
          within(
            [n(60, 0, 3.9, 'D1', 0.3), n(61, 0, 3.9, 'D1', 0.28), n(62, 0, 3.9, 'D1', 0.26)],
            60,
          ),
        ),
        part(
          'bass',
          within(
            [60, 61, 62].flatMap((bar) => eighths(bar, CH.Dm.bass, 0.36)),
            60,
          ),
        ),
        part(
          'pad',
          within(
            [60, 61, 62, 63].flatMap((bar) => CH.Dm.pad.map((note) => n(bar, 0, 3.9, note, 0.26))),
            60,
          ),
        ),
        part(
          'drums',
          within([...kick(60, [0, 2], 0.5), ...kick(61, [0], 0.4), ...kick(62, [0], 0.32)], 60),
        ),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/surge-protocol',
    files: { mix: 'public/assets/audio/music/combat/surge-protocol.ogg' },
    runtimeKey: 'music-surge-protocol',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 64, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -17.5 },
});
