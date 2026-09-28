import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * ARCADE DENEMESİ — aynı slot (ana menü A), tema tamamen arcade.
 *
 * 150 BPM, A minör, 48 ölçü (~77 sn), dikişsiz loop. Karakter: hızlı 16'lık
 * pluck dokusu, sürekli hareket eden bas, FM zil ile parlak hook, davul
 * aksanlı. Beş faz: giriş → hook → kırılma → hook varyasyonu → dönüş.
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
};

const plan = (bars: number[], chords: string[]) =>
  bars.map((bar, index) => ({ bar, chord: chords[index % chords.length] }));

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

export const arcadeSignal = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'arcade-signal',
  version: 1,
  title: 'Arcade Sinyal',
  description: 'Hızlı arcade denemesi: 16’lık pluck, FM zil hook, sürekli bas, davul aksanlı.',
  seed: 202609292,
  playback: 'loop',
  tempo: { bpm: 132 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'A2' },
  bars: 48,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'bass', instrument: 'preset:dubBass', stem: 'main', gain: 0.4 },
    { id: 'sub', instrument: 'preset:subBass', stem: 'main', gain: 0.3 },
    { id: 'organ', instrument: 'preset:drawbarOrgan', stem: 'main', gain: 0.3, pan: -0.18 },
    { id: 'arp', instrument: 'preset:metalPluck', stem: 'main', gain: 0.4 },
    { id: 'hook', instrument: 'preset:softLead', stem: 'main', gain: 0.36 },
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.26, pan: 0.18 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.26, pan: -0.1 },
    { id: 'drums', instrument: 'inst:arcade-kit', stem: 'main', gain: 0.3 },
  ],
  instruments: [
    {
      id: 'arcade-kit',
      role: 'percussion',
      polyphony: 6,
      velocity: { rangeDb: 10 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.4, attack: 0.4, decay: 0.4 } },
          { note: 'D2', model: 'tom', macros: { tune: -0.2, tone: 0.3, decay: 0.3 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.55, attack: 0.5, decay: 0.28 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.6, attack: 0.3, decay: 0.18 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-intro',
      role: 'intro',
      bars: [0, 8],
      targetEnergy: 0.45,
      lanes: ['bass', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan([0, 1, 2, 3, 4, 5, 6, 7], ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E']).flatMap(
              ({ bar, chord }) => eighths(bar, CH[chord].bass, 0.6),
            ),
            0,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => [
                ...hat(bar, eighthBeats, 0.24),
                ...kick(bar, [0, 2]),
              ]),
              ...tom(7, [2.5, 3, 3.5], 0.7),
              ...snare(7, [3], 0.6),
            ],
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-hook',
      role: 'body',
      bars: [8, 24],
      targetEnergy: 0.9,
      lanes: ['bass', 'arp', 'hook', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 8),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => sixteenths(bar, CH[chord].bass, 0.5)),
            8,
          ),
        ),
        part(
          'arp',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 8),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => sixteenths(bar, CH[chord].arp, 0.42)),
            8,
          ),
        ),
        part(
          'hook',
          within(
            [
              n(8, 0, 0.5, 'E5', 0.7),
              n(8, 0.5, 0.5, 'A5', 0.72),
              n(8, 1, 0.5, 'G5', 0.7),
              n(8, 1.5, 0.5, 'E5', 0.68),
              n(8, 2, 2, 'F5', 0.7),
              n(9, 0, 1, 'E5', 0.68),
              n(9, 1, 1, 'D5', 0.66),
              n(9, 2, 2, 'C5', 0.68),
              n(10, 0, 0.5, 'C5', 0.68),
              n(10, 0.5, 0.5, 'D5', 0.68),
              n(10, 1, 2, 'E5', 0.7),
              n(11, 0, 4, 'A4', 0.66),
              n(12, 0, 1, 'C5', 0.68),
              n(12, 1, 1, 'B4', 0.64),
              n(12, 2, 2, 'A4', 0.64),
              n(13, 0, 1, 'G4', 0.64),
              n(13, 1, 1, 'E4', 0.62),
              n(13, 2, 2, 'F4', 0.64),
              n(14, 0, 0.5, 'F4', 0.64),
              n(14, 0.5, 0.5, 'G4', 0.66),
              n(14, 1, 1, 'A4', 0.68),
              n(14, 2, 2, 'B4', 0.7),
              n(15, 0, 4, 'E5', 0.72),
              n(16, 0, 0.5, 'E5', 0.74),
              n(16, 0.5, 0.5, 'A5', 0.76),
              n(16, 1, 0.5, 'B5', 0.74),
              n(16, 1.5, 0.5, 'C6', 0.76),
              n(16, 2, 2, 'A5', 0.74),
              n(17, 0, 1, 'G5', 0.72),
              n(17, 1, 1, 'E5', 0.7),
              n(17, 2, 2, 'F5', 0.72),
              n(18, 0, 0.5, 'E5', 0.72),
              n(18, 0.5, 0.5, 'D5', 0.7),
              n(18, 1, 1, 'C5', 0.7),
              n(18, 2, 2, 'D5', 0.72),
              n(19, 0, 4, 'E5', 0.74),
              n(20, 0, 1, 'C5', 0.72),
              n(20, 1, 1, 'B4', 0.7),
              n(20, 2, 2, 'A4', 0.68),
              n(21, 0, 1, 'G4', 0.68),
              n(21, 1, 1, 'B4', 0.7),
              n(21, 2, 2, 'D5', 0.72),
              n(22, 0, 0.5, 'C5', 0.72),
              n(22, 0.5, 0.5, 'B4', 0.7),
              n(22, 1, 1, 'A4', 0.7),
              n(22, 2, 2, 'G#4', 0.72),
              n(23, 0, 2, 'A4', 0.72),
              n(23, 2, 2, 'B4', 0.74),
            ],
            8,
          ),
        ),
        part(
          'bell',
          within(
            [16, 17, 18, 19, 20, 21, 22, 23].flatMap((bar) =>
              eighths(bar, up(CH[['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'][bar - 16]].arp), 0.3),
            ),
            8,
          ),
        ),
        part(
          'pad',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 8),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.34))),
            8,
          ),
        ),
        part(
          'drums',
          within(
            Array.from({ length: 16 }, (_, i) => i + 8).flatMap((bar) => [
              ...kick(bar, [0, 1.5, 2]),
              ...snare(bar, [1, 3]),
              ...hat(bar, sixteenthBeats, 0.26),
              ...tom(bar, bar % 8 === 7 ? [2.5, 3, 3.5] : [], 0.7),
            ]),
            8,
          ),
        ),
      ],
    },
    {
      id: 'c-break',
      role: 'bridge',
      bars: [24, 28],
      targetEnergy: 0.6,
      lanes: ['bass', 'hook', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan([24, 25, 26, 27], ['Dm', 'Dm', 'E', 'E']).flatMap(({ bar }) =>
              bar < 26 ? eighths(bar, CH.F.bass, 0.54) : sixteenths(bar, CH.E.bass, 0.5),
            ),
            24,
          ),
        ),
        part(
          'hook',
          within(
            [
              n(24, 0, 2, 'D5', 0.68),
              n(24, 2, 2, 'C5', 0.66),
              n(25, 0, 2, 'B4', 0.66),
              n(25, 2, 2, 'A4', 0.64),
              n(26, 0, 2, 'G#4', 0.68),
              n(26, 2, 2, 'B4', 0.7),
              n(27, 0, 3.5, 'E5', 0.72),
            ],
            24,
          ),
        ),
        part(
          'pad',
          within(
            [24, 25, 26, 27]
              .map((bar) => CH.E.pad.map((note) => n(bar, 0, 3.9, note, 0.32)))
              .flat(),
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
                ...hat(bar, eighthBeats, 0.22),
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
      id: 'd-action',
      role: 'peak',
      bars: [28, 44],
      targetEnergy: 0.95,
      lanes: ['bass', 'sub', 'arp', 'hook', 'organ', 'bell', 'pad', 'drums'],
      parts: [
        part(
          'bass',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 28),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => sixteenths(bar, CH[chord].bass, 0.54)),
            28,
          ),
        ),
        part(
          'sub',
          within(
            Array.from({ length: 16 }, (_, i) => i + 28).map((bar) => n(bar, 0, 3.9, 'A2', 0.3)),
            28,
          ),
        ),
        part(
          'arp',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 28),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => sixteenths(bar, CH[chord].arp, 0.46)),
            28,
          ),
        ),
        part(
          'hook',
          within(
            [
              n(28, 0, 0.5, 'A4', 0.74),
              n(28, 0.5, 0.5, 'A4', 0.7),
              n(28, 1, 0.5, 'C5', 0.72),
              n(28, 1.5, 0.5, 'E5', 0.74),
              n(28, 2, 1, 'D5', 0.72),
              n(28, 3, 1, 'C5', 0.7),
              n(29, 0, 0.5, 'B4', 0.72),
              n(29, 0.5, 0.5, 'C5', 0.72),
              n(29, 1, 0.5, 'B4', 0.7),
              n(29, 1.5, 0.5, 'A4', 0.7),
              n(29, 2, 1, 'G#4', 0.72),
              n(29, 3, 1, 'E4', 0.7),
              n(30, 0, 0.5, 'A4', 0.74),
              n(30, 0.5, 0.5, 'C5', 0.76),
              n(30, 1, 0.5, 'D5', 0.76),
              n(30, 1.5, 0.5, 'E5', 0.78),
              n(30, 2, 1, 'F5', 0.78),
              n(30, 3, 1, 'E5', 0.74),
              n(31, 0, 0.5, 'D5', 0.74),
              n(31, 0.5, 0.5, 'C5', 0.72),
              n(31, 1, 0.5, 'B4', 0.72),
              n(31, 1.5, 0.5, 'A4', 0.7),
              n(31, 2, 2, 'A4', 0.72),
              n(32, 0, 0.5, 'E5', 0.76),
              n(32, 0.5, 0.5, 'E5', 0.72),
              n(32, 1, 0.5, 'G5', 0.76),
              n(32, 1.5, 0.5, 'A5', 0.78),
              n(32, 2, 1, 'G5', 0.74),
              n(32, 3, 1, 'E5', 0.72),
              n(33, 0, 0.5, 'F5', 0.74),
              n(33, 0.5, 0.5, 'E5', 0.72),
              n(33, 1, 0.5, 'D5', 0.72),
              n(33, 1.5, 0.5, 'C5', 0.7),
              n(33, 2, 2, 'B4', 0.7),
              n(34, 0, 0.5, 'C5', 0.74),
              n(34, 0.5, 0.5, 'D5', 0.74),
              n(34, 1, 0.5, 'E5', 0.76),
              n(34, 1.5, 0.5, 'F5', 0.76),
              n(34, 2, 1, 'G5', 0.78),
              n(34, 3, 1, 'A5', 0.8),
              n(35, 0, 2, 'G#5', 0.78),
              n(35, 2, 2, 'B5', 0.78),
              n(36, 0, 0.5, 'A5', 0.8),
              n(36, 0.5, 0.5, 'A5', 0.76),
              n(36, 1, 0.5, 'C6', 0.8),
              n(36, 1.5, 0.5, 'E6', 0.82),
              n(36, 2, 1, 'D6', 0.78),
              n(36, 3, 1, 'C6', 0.76),
              n(37, 0, 0.5, 'B5', 0.76),
              n(37, 0.5, 0.5, 'C6', 0.76),
              n(37, 1, 0.5, 'B5', 0.74),
              n(37, 1.5, 0.5, 'A5', 0.74),
              n(37, 2, 1, 'G#5', 0.76),
              n(37, 3, 1, 'E5', 0.74),
              n(38, 0, 0.5, 'A5', 0.78),
              n(38, 0.5, 0.5, 'C6', 0.8),
              n(38, 1, 0.5, 'D6', 0.8),
              n(38, 1.5, 0.5, 'E6', 0.82),
              n(38, 2, 1, 'F6', 0.82),
              n(38, 3, 1, 'E6', 0.78),
              n(39, 0, 0.5, 'D6', 0.78),
              n(39, 0.5, 0.5, 'C6', 0.76),
              n(39, 1, 0.5, 'B5', 0.76),
              n(39, 1.5, 0.5, 'A5', 0.74),
              n(39, 2, 2, 'A5', 0.76),
              n(40, 0, 0.5, 'E5', 0.78),
              n(40, 0.5, 0.5, 'G5', 0.78),
              n(40, 1, 0.5, 'A5', 0.8),
              n(40, 1.5, 0.5, 'B5', 0.8),
              n(40, 2, 1, 'C6', 0.82),
              n(40, 3, 1, 'B5', 0.78),
              n(41, 0, 0.5, 'A5', 0.78),
              n(41, 0.5, 0.5, 'G5', 0.76),
              n(41, 1, 0.5, 'F5', 0.76),
              n(41, 1.5, 0.5, 'E5', 0.74),
              n(41, 2, 2, 'D5', 0.74),
              n(42, 0, 0.5, 'E5', 0.8),
              n(42, 0.5, 0.5, 'F5', 0.8),
              n(42, 1, 0.5, 'G5', 0.82),
              n(42, 1.5, 0.5, 'A5', 0.82),
              n(42, 2, 2, 'B5', 0.84),
              n(43, 0, 4, 'E6', 0.86),
            ],
            28,
          ),
        ),
        part(
          'organ',
          within(
            Array.from({ length: 16 }, (_, i) => i + 28).flatMap((bar) => {
              const chord = [
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
                'G',
                'G',
                'E',
                'E',
              ][bar - 28];
              return [1.5, 3.5].flatMap((beat) =>
                CH[chord].pad.slice(1).map((note) => n(bar, beat, 0.22, note, 0.5)),
              );
            }),
            28,
          ),
        ),
        part(
          'bell',
          within(
            Array.from({ length: 16 }, (_, i) => i + 28).flatMap((bar) =>
              eighths(
                bar,
                up(
                  CH[
                    [
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
                      'G',
                      'G',
                      'E',
                      'E',
                    ][bar - 28]
                  ].arp,
                ),
                0.28,
              ),
            ),
            28,
          ),
        ),
        part(
          'pad',
          within(
            plan(
              Array.from({ length: 16 }, (_, i) => i + 28),
              ['Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E', 'Am', 'Am', 'F', 'F', 'G', 'G', 'E', 'E'],
            ).flatMap(({ bar, chord }) => CH[chord].pad.map((note) => n(bar, 0, 3.9, note, 0.36))),
            28,
          ),
        ),
        part(
          'drums',
          within(
            Array.from({ length: 16 }, (_, i) => i + 28).flatMap((bar) => [
              ...kick(bar, [0, 1, 2, 3]),
              ...snare(bar, [1, 3]),
              ...hat(bar, sixteenthBeats, 0.3),
              ...tom(bar, [2.5, 3.5], 0.72),
            ]),
            28,
          ),
        ),
      ],
    },
    {
      id: 'e-outro',
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
              ...[n(47, 0, 0.4, 'A1', 0.26)],
            ],
            44,
          ),
        ),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/arcade-signal',
    files: { mix: 'public/assets/audio/music/main-menu/hollow-signal.ogg' },
    runtimeKey: 'music-hollow-signal',
  },
  markers: [
    { bar: 0, kind: 'loop-start' },
    { bar: 48, kind: 'loop-end' },
  ],
  mastering: { integratedLufs: -16 },
});
