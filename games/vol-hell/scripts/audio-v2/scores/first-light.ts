import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * İLK IŞIK — zafer cue'su, tek seferlik.
 *
 * 96 BPM, A majör, 16 ölçü (~40 sn + kuyruk). Bell arpeji tırmanır, org
 * swell'leri altında yumuşak kick yükselir; doruk sondan önce kurulur ve
 * son iki ölçü söner. Beş faz:
 *   0-4   şafak      — zil tırmanışı + org pedalı
 *   4-8   yükseliş   — lead fanfarı, kick belirir
 *   8-12  toplanma   — bas girer, zil yükselir
 *   12-14 doruk      — C7 zirvesi
 *   14-16 sönüm      — uzun A akoru
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

const CH: Record<string, { bass: string[]; pad: string[] }> = {
  A: { bass: ['A2', 'A2', 'E3', 'A2'], pad: ['A2', 'E3', 'C#4'] },
  D: { bass: ['D2', 'D2', 'A2', 'D2'], pad: ['D2', 'A2', 'F#3'] },
  E: { bass: ['E2', 'E2', 'B2', 'E2'], pad: ['E2', 'B2', 'G#3'] },
  'F#m': { bass: ['F#2', 'F#2', 'C#3', 'F#2'], pad: ['F#2', 'C#3', 'A3'] },
};

const range = (from: number, bars: number) => Array.from({ length: bars }, (_, i) => from + i);

const eighths = (bar: number, cycle: string[], velocity: number) =>
  Array.from({ length: 8 }, (_, i) => n(bar, i * 0.5, 0.45, cycle[i % cycle.length], velocity));

const kick = (bar: number, beats: number[], velocity = 0.5) =>
  beats.map((beat) => n(bar, beat, 0.2, 'A1', velocity));

const tom = (bar: number, beats: number[], velocity = 0.5) =>
  beats.map((beat) => n(bar, beat, 0.22, 'D2', velocity));

const bellClimb = [
  n(0, 0, 2, 'A4', 0.4),
  n(0, 2, 2, 'C#5', 0.42),
  n(1, 0, 2, 'E5', 0.44),
  n(1, 2, 2, 'A5', 0.46),
  n(2, 0, 2, 'B5', 0.48),
  n(2, 2, 2, 'C#6', 0.5),
  n(3, 0, 4, 'E6', 0.54),
  n(4, 0, 2, 'E5', 0.5),
  n(4, 2, 2, 'F#5', 0.52),
  n(5, 0, 2, 'A5', 0.54),
  n(5, 2, 2, 'B5', 0.56),
  n(6, 0, 2, 'C#6', 0.58),
  n(6, 2, 2, 'E6', 0.6),
  n(7, 0, 4, 'F#6', 0.62),
  n(8, 0, 2, 'A5', 0.6),
  n(8, 2, 2, 'C#6', 0.62),
  n(9, 0, 2, 'E6', 0.64),
  n(9, 2, 2, 'F#6', 0.66),
  n(10, 0, 2, 'G#6', 0.68),
  n(10, 2, 2, 'A6', 0.7),
  n(11, 0, 2, 'B6', 0.72),
  n(11, 2, 2, 'C7', 0.74),
  n(12, 0, 1, 'C7', 0.8),
  n(12, 1, 1, 'A6', 0.78),
  n(12, 2, 2, 'E6', 0.76),
  n(13, 0, 4, 'A6', 0.82),
  n(14, 0, 2, 'E6', 0.5),
  n(14, 2, 2, 'C#6', 0.46),
  n(15, 0, 8, 'A5', 0.4),
];

const leadFanfare = [
  n(4, 0, 2, 'E4', 0.6),
  n(4, 2, 2, 'A4', 0.62),
  n(5, 0, 2, 'C#5', 0.64),
  n(5, 2, 2, 'B4', 0.62),
  n(6, 0, 2, 'A4', 0.62),
  n(6, 2, 2, 'G#4', 0.6),
  n(7, 0, 4, 'A4', 0.64),
  n(8, 0, 2, 'B4', 0.64),
  n(8, 2, 2, 'C#5', 0.66),
  n(9, 0, 2, 'D5', 0.68),
  n(9, 2, 2, 'E5', 0.7),
  n(10, 0, 2, 'F#5', 0.72),
  n(10, 2, 2, 'E5', 0.7),
  n(11, 0, 4, 'F#5', 0.74),
  n(12, 0, 2, 'E5', 0.76),
  n(12, 2, 2, 'F#5', 0.78),
  n(13, 0, 4, 'A5', 0.84),
];

const swell = (plan: { bar: number; chord: string }[]) =>
  plan.flatMap(({ bar, chord }) => CH[chord].pad.map((note) => n(bar, 0, 7.9, note, 0.3)));

export const firstLight = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'first-light',
  version: 1,
  title: 'İlk Işık',
  description:
    'A majör zafer cue’su: tırmanan zil arpeji, org swell ve yumuşak kick build; doruk son iki ölçüde söner.',
  seed: 202609305,
  playback: 'playlistOneShot',
  tempo: { bpm: 96 },
  meter: [4, 4],
  tonal: { system: 'major', root: 'A2' },
  bars: 16,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.34 },
    { id: 'lead', instrument: 'preset:softLead', stem: 'main', gain: 0.34, pan: 0.08 },
    { id: 'organ', instrument: 'preset:drawbarOrgan', stem: 'main', gain: 0.28, pan: -0.12 },
    { id: 'bass', instrument: 'preset:dubBass', stem: 'main', gain: 0.34 },
    { id: 'drums', instrument: 'inst:dawn-kit', stem: 'main', gain: 0.36 },
  ],
  instruments: [
    {
      id: 'dawn-kit',
      role: 'percussion',
      polyphony: 6,
      velocity: { rangeDb: 8 },
      articulations: ['accent', 'ghost'],
      source: {
        kind: 'drum-kit',
        pieces: [
          { note: 'A1', model: 'kick', macros: { tone: 0.45, attack: 0.45, decay: 0.34 } },
          { note: 'D2', model: 'tom', macros: { tune: 0.1, tone: 0.4, decay: 0.28 } },
          { note: 'E2', model: 'snare', macros: { tone: 0.65, attack: 0.55, decay: 0.24 } },
          { note: 'F#2', model: 'hat', macros: { tone: 0.7, attack: 0.35, decay: 0.16 } },
        ],
      },
    },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-dawn',
      role: 'intro',
      bars: [0, 4],
      targetEnergy: 0.3,
      lanes: ['bell', 'organ'],
      parts: [
        part(
          'bell',
          within(
            [
              bellClimb[0],
              bellClimb[1],
              bellClimb[2],
              bellClimb[3],
              bellClimb[4],
              bellClimb[5],
              bellClimb[6],
            ],
            0,
          ),
        ),
        part(
          'organ',
          within(
            swell([
              { bar: 0, chord: 'A' },
              { bar: 2, chord: 'D' },
            ]),
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-rise',
      role: 'build',
      bars: [4, 8],
      targetEnergy: 0.55,
      lanes: ['bell', 'lead', 'organ', 'drums'],
      parts: [
        part(
          'bell',
          within(
            [
              bellClimb[7],
              bellClimb[8],
              bellClimb[9],
              bellClimb[10],
              bellClimb[11],
              bellClimb[12],
              bellClimb[13],
            ],
            4,
          ),
        ),
        part('lead', within(leadFanfare.slice(0, 7), 4)),
        part(
          'organ',
          within(
            swell([
              { bar: 4, chord: 'A' },
              { bar: 5, chord: 'D' },
              { bar: 6, chord: 'E' },
              { bar: 7, chord: 'F#m' },
            ]),
            4,
          ),
        ),
        part(
          'drums',
          within(
            [
              ...kick(4, [0], 0.28),
              ...kick(5, [0, 2], 0.3),
              ...kick(6, [0, 2], 0.32),
              ...kick(7, [0, 1.5, 2], 0.34),
            ],
            4,
          ),
        ),
      ],
    },
    {
      id: 'c-gather',
      role: 'build',
      bars: [8, 12],
      targetEnergy: 0.7,
      lanes: ['bell', 'lead', 'organ', 'bass', 'drums'],
      parts: [
        part(
          'bell',
          within(
            [
              bellClimb[14],
              bellClimb[15],
              bellClimb[16],
              bellClimb[17],
              bellClimb[18],
              bellClimb[19],
              bellClimb[20],
              bellClimb[21],
            ],
            8,
          ),
        ),
        part('lead', within(leadFanfare.slice(7, 14), 8)),
        part(
          'organ',
          within(
            swell([
              { bar: 8, chord: 'A' },
              { bar: 9, chord: 'D' },
              { bar: 10, chord: 'E' },
              { bar: 11, chord: 'F#m' },
            ]),
            8,
          ),
        ),
        part(
          'bass',
          within(
            range(8, 4).flatMap((bar) =>
              eighths(bar, CH[['A', 'D', 'E', 'F#m'][bar - 8]].bass, 0.5),
            ),
            8,
          ),
        ),
        part(
          'drums',
          within(
            range(8, 4).flatMap((bar, i) => [
              ...kick(bar, [0, 2], 0.36 + i * 0.02),
              ...tom(bar, i === 3 ? [3.5] : [], 0.4),
            ]),
            8,
          ),
        ),
      ],
    },
    {
      id: 'd-climb',
      role: 'peak',
      bars: [12, 14],
      targetEnergy: 0.9,
      lanes: ['bell', 'lead', 'organ', 'bass', 'drums'],
      parts: [
        part('bell', within([bellClimb[22], bellClimb[23], bellClimb[24], bellClimb[25]], 12)),
        part('lead', within(leadFanfare.slice(14), 12)),
        part('organ', within(swell([{ bar: 12, chord: 'A' }]), 12)),
        part(
          'bass',
          within(
            range(12, 2).flatMap((bar) => eighths(bar, CH.A.bass, 0.56)),
            12,
          ),
        ),
        part(
          'drums',
          within([...kick(12, [0, 1, 2, 3], 0.44), ...tom(13, [2.5, 3, 3.5], 0.52)], 12),
        ),
      ],
    },
    {
      id: 'e-glow',
      role: 'release',
      bars: [14, 16],
      targetEnergy: 0.35,
      lanes: ['bell', 'organ', 'bass'],
      parts: [
        part('bell', within([bellClimb[26], bellClimb[27], bellClimb[28]], 14)),
        part('organ', within(swell([{ bar: 14, chord: 'A' }]), 14)),
        part('bass', within([n(14, 0, 7.9, 'A2', 0.4)], 14)),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/first-light',
    files: { mix: 'public/assets/audio/music/end/first-light.ogg' },
    runtimeKey: 'music-first-light',
  },
  mastering: { integratedLufs: -19 },
});
