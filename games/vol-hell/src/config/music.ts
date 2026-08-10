import type { MusicTrack } from '@volstudio/core/audio/music';

const musicBasePath = 'assets/audio/music';
const BPM = 72;
const BEAT = 60 / BPM;
const TAIL = 5;

// Iron Vein — ana menü teması 1: C minor, 85 BPM, 64 beat loop
const MENU_BPM = 85;
const MENU_BEAT = 60 / MENU_BPM;

// Black Tide — ana menü teması 2: D minor, 90 BPM, 96 beat loop
const MENU2_BPM = 90;
const MENU2_BEAT = 60 / MENU2_BPM;

// Crimson Horizon — ana menü teması 3: A minor, 85 BPM, 64 beat loop
const MENU3_BPM = 85;
const MENU3_BEAT = 60 / MENU3_BPM;

export const musicTrackIds = [
  'main-menu',
  'main-menu-2',
  'main-menu-3',
  'void-whisper',
  'iron-tide',
  'last-ember',
] as const;
export type MusicTrackId = (typeof musicTrackIds)[number];

/** Vol-Hell müzik track'leri.
 *  3 ana menü, 2 oyun içi ambiyans (Void Whisper / Iron Tide), 1 ölüm (Last Ember).
 *  Düşman 0-7 → Void Whisper, 8+ → Iron Tide. Iron Tide, combat'ın yerini tutar —
 *  ritmik değil ama gerilimli, düşman yoğunluğunu yansıtır. */
export const musicTracks: Record<MusicTrackId, MusicTrack> = {
  'main-menu': {
    id: 'main-menu',
    bpm: MENU_BPM,
    loopStart: 0,
    loopEnd: 64 * MENU_BEAT, // ~45.2s — Iron Vein
    stems: [
      {
        id: 'iron-vein',
        src: `${musicBasePath}/main-menu/iron-vein.wav`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'main-menu-2': {
    id: 'main-menu-2',
    bpm: MENU2_BPM,
    loopStart: 0,
    loopEnd: 96 * MENU2_BEAT, // ~64s — Black Tide
    stems: [
      {
        id: 'black-tide',
        src: `${musicBasePath}/main-menu/black-tide.wav`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'main-menu-3': {
    id: 'main-menu-3',
    bpm: MENU3_BPM,
    loopStart: 0,
    loopEnd: 64 * MENU3_BEAT, // ~45.2s — Crimson Horizon
    stems: [
      {
        id: 'crimson-horizon',
        src: `${musicBasePath}/main-menu/crimson-horizon.wav`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'void-whisper': {
    id: 'void-whisper',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 64 * BEAT + TAIL, // ~58s — düşman az/yok
    stems: [
      {
        id: 'void-whisper',
        src: `${musicBasePath}/gameplay/void-whisper.wav`,
        gain: 0.7,
        loop: true,
      },
    ],
  },

  'iron-tide': {
    id: 'iron-tide',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 64 * BEAT + TAIL, // ~58s — düşman çok
    stems: [
      {
        id: 'iron-tide',
        src: `${musicBasePath}/gameplay/iron-tide.wav`,
        gain: 0.7,
        loop: true,
      },
    ],
  },

  'last-ember': {
    id: 'last-ember',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 32 * BEAT + TAIL, // ~32s — inen piyano
    stems: [
      {
        id: 'last-ember',
        src: `${musicBasePath}/death/last-ember.wav`,
        gain: 0.75,
        loop: false,
      },
    ],
  },
};

/** Oyun içi ambiyans track'leri — Void Whisper ve Iron Tide, ambient engine'de crossfade ile geçer. */
export const ambientTrackKeys = ['void-whisper', 'iron-tide'] as const;
export type AmbientTrackKey = (typeof ambientTrackKeys)[number];

/** Death ekranı rastgele seçenekleri — tek track. */
export const deathTrackKeys: readonly MusicTrackId[] = ['last-ember'];

/** Ana menü rastgele seçenekleri — Iron Vein, Black Tide, Crimson Horizon. */
export const menuTrackKeys: readonly MusicTrackId[] = ['main-menu', 'main-menu-2', 'main-menu-3'];
