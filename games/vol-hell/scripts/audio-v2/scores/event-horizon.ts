import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * OLAY UFKU — arcade hook'un karanlık ve hızlı varyantı.
 *
 * 138 BPM, A minör, 48 ölçü (~83 sn), dikişsiz loop. Karakter: olay ufkuna
 * sürüklenme; 16'lık bas itişi, metalik arp, iki ayrı hook (A alçak, B oktav
 * yukarı + org stab), ortada davulun yarıya indiği gerilim. Altı faz:
 *   0-4   giriş      — sub pedal + pad
 *   4-16  hook A     — 8'lik bas, 16'lık arp, alçak hook
 *   16-24 gerilim    — 8'lik ostinato, yüksek tremolo arp, davul yarıda
 *   24-28 kırılma    — inen hook, tom rulosu
 *   28-44 hook B     — 16'lık bas, oktav yukarı hook, org stab, zil
 *   44-48 sönüm      — katmanlar düşer
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
  Am: { bass: ['A2', 'A2', 'E3', 'A2'], arp: ['A3', 'C4', 'E4', 'A4'], pad: ['A2', 'E3', 'C4'] },
  F: { bass: ['F2', 'F2', 'C3', 'F2'], arp: ['F3', 'A3', 'C4', 'F4'], pad: ['F2', 'C3', 'A3'] },
  G: { bass: ['G2', 'G2', 'D3', 'G2'], arp: ['G3', 'B3', 'D4', 'G4'], pad: ['G2', 'D3', 'B3'] },
  E: { bass: ['E2', 'E2', 'B2', 'E2'], arp: ['E3', 'G#3', 'B3', 'E4'], pad: ['E2', 'B2', 'G#3'] },
  Dm: { bass: ['D2', 'D2', 'A2', 'D2'], arp: ['D3', 'F3', 'A3', 'D4'], pad: ['D2', 'A2', 'F3'] },
  Bb: {
    bass: ['A#1', 'F2', 'A#2', 'F2'],
    arp: ['A#3', 'D4', 'F4', 'A#4'],
    pad: ['A#2', 'F3', 'D4'],
  },
};

const ROOT1: Record<string, string> = { Am: 'A1', F: 'F1', G: 'G1', E: 'E1', Dm: 'D1', Bb: 'A#1' };

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

const HOOK_A = ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'E', 'E'];
const TENSION = ['Dm', 'Dm', 'E', 'E', 'Dm', 'Dm', 'E', 'E'];
const BREAK = ['Dm', 'Bb', 'Dm', 'E'];
const HOOK_B = [
  'Am',
  'Am',
  'F',
  'F',
  'G',
  'G',
  'E',
  'E',
  'Am',
  'Am',
  'F',
  'F',
  'Dm',
  'Dm',
  'E',
  'E',
];

const hookA = [
  n(4, 0, 0.5, 'E5', 0.72),
  n(4, 0.5, 0.5, 'A5', 0.74),
  n(4, 1, 0.5, 'G5', 0.72),
  n(4, 1.5, 0.5, 'E5', 0.7),
  n(4, 2, 1, 'F5', 0.72),
  n(4, 3, 1, 'E5', 0.7),
  n(5, 0, 1, 'D5', 0.7),
  n(5, 1, 1, 'C5', 0.68),
  n(5, 2, 2, 'E5', 0.7),
  n(6, 0, 0.5, 'F5', 0.7),
  n(6, 0.5, 0.5, 'A5', 0.72),
  n(6, 1, 1, 'G5', 0.7),
  n(6, 2, 2, 'F5', 0.7),
  n(7, 0, 4, 'C5', 0.68),
  n(8, 0, 0.5, 'D5', 0.7),
  n(8, 0.5, 0.5, 'G5', 0.74),
  n(8, 1, 0.5, 'F5', 0.72),
  n(8, 1.5, 0.5, 'D5', 0.7),
  n(8, 2, 2, 'E5', 0.72),
  n(9, 0, 1, 'B4', 0.66),
  n(9, 1, 1, 'D5', 0.68),
  n(9, 2, 2, 'G5', 0.72),
  n(10, 0, 0.5, 'G#5', 0.74),
  n(10, 0.5, 0.5, 'B5', 0.76),
  n(10, 1, 1, 'A5', 0.74),
  n(10, 2, 2, 'G#5', 0.72),
  n(11, 0, 4, 'E5', 0.74),
  n(12, 0, 0.5, 'A5', 0.76),
  n(12, 0.5, 0.5, 'C6', 0.78),
  n(12, 1, 0.5, 'B5', 0.76),
  n(12, 1.5, 0.5, 'A5', 0.74),
  n(12, 2, 2, 'E5', 0.74),
  n(13, 0, 1, 'G5', 0.72),
  n(13, 1, 1, 'E5', 0.7),
  n(13, 2, 2, 'D5', 0.7),
  n(14, 0, 0.5, 'E5', 0.72),
  n(14, 0.5, 0.5, 'G#5', 0.74),
  n(14, 1, 1, 'B5', 0.76),
  n(14, 2, 2, 'E6', 0.8),
  n(15, 0, 4, 'B5', 0.78),
];

const hookB = [
  n(28, 0, 1, 'A5', 0.76),
  n(28, 1, 1, 'E5', 0.72),
  n(28, 2, 1, 'G5', 0.74),
  n(28, 3, 1, 'A5', 0.76),
  n(29, 0, 2, 'C6', 0.8),
  n(29, 2, 2, 'B5', 0.76),
  n(30, 0, 1, 'A5', 0.76),
  n(30, 1, 1, 'G5', 0.74),
  n(30, 2, 2, 'F5', 0.74),
  n(31, 0, 4, 'C6', 0.78),
  n(32, 0, 1, 'B5', 0.76),
  n(32, 1, 1, 'D6', 0.78),
  n(32, 2, 1, 'B5', 0.74),
  n(32, 3, 1, 'G5', 0.72),
  n(33, 0, 2, 'D6', 0.8),
  n(33, 2, 2, 'B5', 0.76),
  n(34, 0, 1, 'G#5', 0.76),
  n(34, 1, 1, 'B5', 0.78),
  n(34, 2, 2, 'E6', 0.8),
  n(35, 0, 4, 'B5', 0.78),
  n(36, 0, 1, 'A5', 0.78),
  n(36, 1, 1, 'C6', 0.8),
  n(36, 2, 1, 'E6', 0.82),
  n(36, 3, 1, 'D6', 0.8),
  n(37, 0, 2, 'C6', 0.8),
  n(37, 2, 2, 'A5', 0.78),
  n(38, 0, 1, 'F5', 0.76),
  n(38, 1, 1, 'A5', 0.78),
  n(38, 2, 1, 'C6', 0.8),
  n(38, 3, 1, 'D6', 0.82),
  n(39, 0, 4, 'E6', 0.84),
  n(40, 0, 1, 'D6', 0.8),
  n(40, 1, 1, 'A5', 0.78),
  n(40, 2, 1, 'F5', 0.76),
  n(40, 3, 1, 'D5', 0.74),
  n(41, 0, 2, 'F5', 0.76),
  n(41, 2, 2, 'A5', 0.78),
  n(42, 0, 1, 'G#5', 0.78),
  n(42, 1, 1, 'B5', 0.8),
  n(42, 2, 2, 'E6', 0.82),
  n(43, 0, 2, 'A5', 0.8),
  n(43, 2, 2, 'B5', 0.82),
];

export const eventHorizon = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'event-horizon',
  version: 1,
  title: 'Olay Ufku',
  description:
    'A minör karanlık arcade: 16’lık bas itişi, yüksek tremolo arp, iki hook ve org stab; yavaşça sönümlenen 48 ölçü loop.',
  seed: 202609301,
  playback: 'loop',
  tempo: { bpm: 138 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'A2' },
  bars: 48,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'bass', instrument: 'preset:dubBass', stem: 'main', gain: 0.4 },
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.3 },
    { id: 'organ', instrument: 'preset:drawbarOrgan', stem: 'main', gain: 0.28, pan: -0.18 },
    { id: 'arp', instrument: 'preset:metalPluck', stem: 'main', gain: 0.4 },
    { id: 'hook', instrument: 'preset:softLead', stem: 'main', gain: 0.38 },
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.26, pan: 0.18 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.26, pan: -0.1 },
    { id: 'drums', instrument: 'inst:horizon-kit', stem: 'main', gain: 0.42 },
  ],
  instruments: [
    {
      id: 'horizon-kit',
      role: 'percussion',
      polyphony: 6,
      velocity: { rangeDb: 10 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.35, attack: 0.4, decay: 0.42 } },
          { note: 'D2', model: 'tom', macros: { tune: -0.25, tone: 0.25, decay: 0.34 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.55, attack: 0.5, decay: 0.28 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.62, attack: 0.3, decay: 0.18 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-drift',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.35,
      lanes: ['sub', 'pad'],
      parts: [
        part(
          'sub',
          within(
            [
              n(0, 0, 3.9, 'A1', 0.32),
              n(1, 0, 3.9, 'A1', 0.32),
              n(2, 0, 3.9, 'F1', 0.34),
              n(3, 0, 3.9, 'F1', 0.34),
            ],
            0,
          ),
        ),
        part(
          'pad',
          within(
            [
              ...CH.Am.pad.map((note) => n(0, 0, 7.9, note, 0.26)),
              ...CH.F.pad.map((note) => n(2, 0, 7.9, note, 0.28)),
            ],
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-hook-a',
      role: 'body',
      bars: [4, 16],
      targetEnergy: 0.85,
      lanes: ['bass', 'arp', 'hook', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(4, 12), HOOK_A).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.62),
            ),
            4,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(4, 12), HOOK_A).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].arp, 0.42),
            ),
            4,
          ),
        ),
        part('hook', within(hookA, 4)),
        part(
          'pad',
          within(
            plan(range(4, 12), HOOK_A).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.32)),
            ),
            4,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...range(4, 12).flatMap((bar) => [
                ...kick(bar, [0, 2]),
                ...snare(bar, [1, 3]),
                ...hat(bar, eighthBeats, 0.26),
              ]),
              ...tom(7, [2.5, 3, 3.5], 0.7),
              ...snare(7, [3], 0.6),
              ...tom(11, [3.5], 0.68),
            ],
            4,
          ),
        ),
      ],
    },
    {
      id: 'c-tension',
      role: 'bridge',
      bars: [16, 24],
      targetEnergy: 0.7,
      lanes: ['bass', 'arp', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(16, 8), TENSION).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.66),
            ),
            16,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(16, 8), TENSION).flatMap(({ bar, chord }) =>
              sixteenths(bar, up(CH[chord].arp), 0.44),
            ),
            16,
          ),
        ),
        part(
          'bell',
          within(
            [
              n(16, 0, 2, 'A5', 0.3),
              n(18, 0, 2, 'C6', 0.32),
              n(20, 0, 2, 'B5', 0.3),
              n(22, 0, 2, 'G#5', 0.32),
            ],
            16,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(16, 8), TENSION).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.34)),
            ),
            16,
          ),
        ),
        part(
          'drums',
          within(
            range(16, 8).flatMap((bar) => [
              ...kick(bar, [0], 0.78),
              ...snare(bar, [2], 0.6),
              ...hat(bar, eighthBeats, 0.22),
            ]),
            16,
          ),
        ),
      ],
    },
    {
      id: 'd-break',
      role: 'bridge',
      bars: [24, 28],
      targetEnergy: 0.5,
      lanes: ['bass', 'hook', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(24, 4), BREAK).flatMap(({ bar, chord }) =>
              eighths(bar, CH[chord].bass, 0.56),
            ),
            24,
          ),
        ),
        part(
          'hook',
          within(
            [
              n(24, 0, 2, 'D5', 0.7),
              n(24, 2, 2, 'C5', 0.68),
              n(25, 0, 2, 'A#4', 0.66),
              n(25, 2, 2, 'A4', 0.64),
              n(26, 0, 2, 'F4', 0.62),
              n(26, 2, 2, 'A4', 0.66),
              n(27, 0, 1, 'G#4', 0.68),
              n(27, 1, 1, 'B4', 0.7),
              n(27, 2, 2, 'E5', 0.74),
            ],
            24,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(24, 4), BREAK).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.34)),
            ),
            24,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...[24, 25].flatMap((bar) => [
                ...kick(bar, [0, 2]),
                ...snare(bar, [1, 3]),
                ...hat(bar, eighthBeats, 0.24),
              ]),
              ...hat(26, sixteenthBeats, 0.32),
              ...kick(26, [0]),
              ...tom(27, [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 0.8),
            ],
            24,
          ),
        ),
      ],
    },
    {
      id: 'e-hook-b',
      role: 'peak',
      bars: [28, 44],
      targetEnergy: 0.95,
      lanes: ['bass', 'sub', 'arp', 'hook', 'organ', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(range(28, 16), HOOK_B).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].bass, 0.56),
            ),
            28,
          ),
        ),
        part(
          'sub',
          within(
            plan(range(28, 16), HOOK_B).map(({ bar, chord }) => n(bar, 0, 3.9, ROOT1[chord], 0.32)),
            28,
          ),
        ),
        part(
          'arp',
          within(
            plan(range(28, 16), HOOK_B).flatMap(({ bar, chord }) =>
              sixteenths(bar, CH[chord].arp, 0.46),
            ),
            28,
          ),
        ),
        part('hook', within(hookB, 28)),
        part(
          'organ',
          within(
            plan(range(28, 16), HOOK_B).flatMap(({ bar, chord }) =>
              [1.5, 3.5].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.22, note, 0.5)),
              ),
            ),
            28,
          ),
        ),
        part(
          'bell',
          within(
            range(36, 8).flatMap((bar) => eighths(bar, up(CH[HOOK_B[bar - 28]].arp), 0.28)),
            28,
          ),
        ),
        part(
          'pad',
          within(
            plan(range(28, 16), HOOK_B).flatMap(({ bar, chord }) =>
              CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.36)),
            ),
            28,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...range(28, 16).flatMap((bar) => [
                ...kick(bar, [0, 2]),
                ...snare(bar, [1, 3]),
                ...hat(bar, sixteenthBeats, 0.28),
                ...tom(bar, bar % 4 === 3 ? [2.5, 3, 3.5] : [], 0.74),
              ]),
            ],
            28,
          ),
        ),
      ],
    },
    {
      id: 'f-sink',
      role: 'release',
      bars: [44, 48],
      targetEnergy: 0.35,
      lanes: ['bass', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            [44, 45, 46].flatMap((bar) => eighths(bar, CH.Am.bass, 0.36)),
            44,
          ),
        ),
        part(
          'pad',
          within(
            [44, 45, 46, 47].flatMap((bar) => CH.Am.pad.map((note) => n(bar, 0, 3.9, note, 0.28))),
            44,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...kick(44, [0, 2], 0.5),
              ...kick(45, [0, 2], 0.42),
              ...kick(46, [0], 0.34),
              n(47, 0, 0.4, 'A1', 0.26),
            ],
            44,
          ),
        ),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/event-horizon',
    files: { mix: 'public/assets/audio/music/main-menu/event-horizon.ogg' },
    runtimeKey: 'music-event-horizon',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 48, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -17 },
});
