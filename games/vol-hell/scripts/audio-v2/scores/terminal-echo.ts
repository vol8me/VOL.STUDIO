import { validateMusicProgram } from '@volstudio/audio-synth/music/program';

/**
 * TERMİNAL YANKISI — ölüm cue'su, tek seferlik.
 *
 * 60 BPM, A minör, 8 ölçü (~32 sn + kuyruk). Davul yok; seyrek FM zil ve
 * alçalan softLead motif, uzun pad çarşafları. Dört faz:
 *   0-2 son vuruş   — inen motif başlar
 *   2-4 yankı       — zil cevapları
 *   4-6 düşüş       — Dm üzerinde ağır iniş
 *   6-8 sessizlik   — uzun A düşüşü, kuyruk
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

const lead = [
  n(0, 0, 3, 'E5', 0.6),
  n(1, 0, 3, 'D5', 0.58),
  n(1, 3, 1, 'C5', 0.56),
  n(2, 0, 2, 'B4', 0.56),
  n(2, 2, 2, 'A4', 0.54),
  n(3, 0, 4, 'G4', 0.54),
  n(4, 0, 2, 'F4', 0.56),
  n(4, 2, 2, 'E4', 0.54),
  n(5, 0, 4, 'D4', 0.52),
  n(6, 0, 2, 'E4', 0.54),
  n(6, 2, 2, 'C4', 0.52),
  n(7, 0, 8, 'A3', 0.5),
];

export const terminalEcho = validateMusicProgram({
  schema: 'MusicProgramV1',
  musicId: 'terminal-echo',
  version: 1,
  title: 'Terminal Yankısı',
  description:
    'A minör ölüm cue’su: davulsuz, seyrek zil ve alçalan lead motif; uzun kuyrukla sönümlenen 8 ölçü.',
  seed: 202609304,
  playback: 'playlistOneShot',
  tempo: { bpm: 60 },
  meter: [4, 4],
  tonal: { system: 'minor', root: 'A2' },
  bars: 8,
  sampleRate: 44100,
  grooves: [],
  motifs: [],
  lanes: [
    { id: 'lead', instrument: 'preset:softLead', stem: 'main', gain: 0.4 },
    { id: 'bell', instrument: 'preset:bell', stem: 'main', gain: 0.3, pan: 0.16 },
    { id: 'pad', instrument: 'preset:detunedPad', stem: 'main', gain: 0.3, pan: -0.1 },
  ],
  stems: [{ id: 'main', title: 'Ana mix' }],
  sections: [
    {
      id: 'a-last-breath',
      role: 'intro',
      bars: [0, 2],
      targetEnergy: 0.2,
      lanes: ['lead', 'pad'],
      parts: [
        part('lead', within([lead[0], lead[1], lead[2]], 0)),
        part(
          'pad',
          within(
            CH.Am.map((note) => n(0, 0, 7.9, note, 0.26)),
            0,
          ),
        ),
      ],
    },
    {
      id: 'b-echo',
      role: 'body',
      bars: [2, 4],
      targetEnergy: 0.55,
      lanes: ['lead', 'bell', 'pad'],
      parts: [
        part('lead', within([lead[3], lead[4], lead[5]], 2)),
        part('bell', within([n(2, 1, 2, 'A5', 0.26), n(3, 2, 1.5, 'E5', 0.24)], 2)),
        part(
          'pad',
          within(
            CH.F.map((note) => n(2, 0, 7.9, note, 0.28)),
            2,
          ),
        ),
      ],
    },
    {
      id: 'c-fall',
      role: 'bridge',
      bars: [4, 6],
      targetEnergy: 0.55,
      lanes: ['lead', 'bell', 'pad'],
      parts: [
        part('lead', within([lead[6], lead[7], lead[8]], 4)),
        part('bell', within([n(5, 1, 2, 'C6', 0.28), n(5, 3, 1, 'A5', 0.24)], 4)),
        part(
          'pad',
          within(
            CH.Dm.map((note) => n(4, 0, 7.9, note, 0.28)),
            4,
          ),
        ),
      ],
    },
    {
      id: 'd-vacuum',
      role: 'outro',
      bars: [6, 8],
      targetEnergy: 0.2,
      lanes: ['lead', 'pad'],
      parts: [
        part('lead', within([lead[9], lead[10], lead[11]], 6)),
        part(
          'pad',
          within(
            CH.Am.map((note) => n(6, 0, 7.9, note, 0.26)),
            6,
          ),
        ),
      ],
    },
  ],
  delivery: {
    package: '@volstudio/vol-hell',
    assetDir: 'public/assets/audio/music/terminal-echo',
    files: { mix: 'public/assets/audio/music/end/terminal-echo.ogg' },
    runtimeKey: 'music-terminal-echo',
  },
  mastering: { integratedLufs: -19 },
});
