import type { MusicTrack } from '@volstudio/core/audio/music';

const musicBasePath = 'assets/audio/music';

// Bu değerler üretim script'leriyle (core/scripts/generate-*.ts) BİREBİR
// eşleşmek zorunda: `loopEnd` dosyanın gerçek uzunluğunu aşarsa Web Audio
// loop'u sessizce tüm buffer'a düşürür, kısa kalırsa parça erken başa sarar.

// Iron Vein — ana menü 1: D kökü, 62 BPM, 64 beat. Karakter: ağırlık.
const MENU_BPM = 62;
const MENU_BEAT = 60 / MENU_BPM;

// Black Tide — ana menü 2: A kökü, 74 BPM, 64 beat. Karakter: hareket.
const MENU2_BPM = 74;
const MENU2_BEAT = 60 / MENU2_BPM;

// Crimson Horizon — ana menü 3: E kökü, 52 BPM, 48 beat. Karakter: boşluk.
const MENU3_BPM = 52;
const MENU3_BEAT = 60 / MENU3_BPM;

// Ambiyans: void-whisper ve iron-tide crossfade ile geçtiği için AYNI tempo
// ve AYNI uzunlukta üretilir. Farklı tempoda olsalar geçiş ritmik çakışırdı.
const AMBIENT_BPM = 68;
const AMBIENT_BEAT = 60 / AMBIENT_BPM;
const AMBIENT_BEATS = 64;

// Last Ember — ölüm ekranı: 50 BPM, 26 beat. Loop yok, sonda fade-out var.
const DEATH_BPM = 50;
const DEATH_BEAT = 60 / DEATH_BPM;

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
    loopEnd: 64 * MENU_BEAT, // ~61.9s — Iron Vein
    stems: [
      {
        id: 'iron-vein',
        src: `${musicBasePath}/main-menu/iron-vein.ogg`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'main-menu-2': {
    id: 'main-menu-2',
    bpm: MENU2_BPM,
    loopStart: 0,
    loopEnd: 64 * MENU2_BEAT, // ~51.9s — Black Tide
    stems: [
      {
        id: 'black-tide',
        src: `${musicBasePath}/main-menu/black-tide.ogg`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'main-menu-3': {
    id: 'main-menu-3',
    bpm: MENU3_BPM,
    loopStart: 0,
    loopEnd: 48 * MENU3_BEAT, // ~55.4s — Crimson Horizon
    stems: [
      {
        id: 'crimson-horizon',
        src: `${musicBasePath}/main-menu/crimson-horizon.ogg`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'void-whisper': {
    id: 'void-whisper',
    bpm: AMBIENT_BPM,
    loopStart: 0,
    loopEnd: AMBIENT_BEATS * AMBIENT_BEAT, // ~56.5s — düşman az/yok
    stems: [
      {
        id: 'void-whisper',
        src: `${musicBasePath}/gameplay/void-whisper.ogg`,
        gain: 0.7,
        loop: true,
      },
    ],
  },

  'iron-tide': {
    id: 'iron-tide',
    bpm: AMBIENT_BPM,
    loopStart: 0,
    loopEnd: AMBIENT_BEATS * AMBIENT_BEAT, // ~56.5s — düşman çok
    stems: [
      {
        id: 'iron-tide',
        src: `${musicBasePath}/gameplay/iron-tide.ogg`,
        gain: 0.7,
        loop: true,
      },
    ],
  },

  'last-ember': {
    id: 'last-ember',
    bpm: DEATH_BPM,
    loopStart: 0,
    loopEnd: 26 * DEATH_BEAT, // ~31.2s — inen sinyal motifi
    stems: [
      {
        id: 'last-ember',
        src: `${musicBasePath}/death/last-ember.ogg`,
        gain: 0.75,
        loop: false,
      },
    ],
  },
};

/** Oyun içi ambiyans track'leri — Void Whisper ve Iron Tide, ambient engine'de crossfade ile geçer. */
export const ambientTrackKeys = ['void-whisper', 'iron-tide'] as const;
export type AmbientTrackKey = (typeof ambientTrackKeys)[number];

/**
 * Müzik/ambiyans geçiş parametreleri. Eşikler ve süreler burada tek kaynaktan
 * gelir; sahne kodunda track id'si veya süre yazılmaz.
 */
export const musicConfig = {
  ambient: {
    /** Bu sayı ve üzeri düşmanda gergin ambiyansa geçilir. */
    tenseEnemyThreshold: 8,
    /** Calm -> tense için gereken kararlılık süresi (ms). Tehlikeye hızlı tepki. */
    tenseHoldMs: 1000,
    /** Tense -> calm için gereken kararlılık süresi (ms). Temkinli, sık geçiş yapmaz. */
    calmHoldMs: 5000,
    /** Düşman az/yok iken çalan ambiyans. */
    calmTrackId: 'void-whisper' satisfies AmbientTrackKey,
    /** Düşman yoğunken çalan ambiyans. */
    tenseTrackId: 'iron-tide' satisfies AmbientTrackKey,
    /** Ambiyans giriş fade süresi (saniye). */
    fadeInSec: 2,
    /** Oyuna girerken menü müziğinin kapanma süresi (saniye). */
    menuStopFadeSec: 2,
    /** Ölüm anında ambiyansın kapanma süresi (saniye). */
    deathStopFadeSec: 1,
  },
  /** Ölüm ekranı müziği. */
  death: {
    fadeInSec: 1,
  },
  /** Ana menü müziği. */
  menu: {
    fadeInSec: 2,
    /** Menüden çıkarken müziğin kapanma süresi (saniye). */
    stopFadeSec: 1,
  },
} as const;

export type MusicConfig = typeof musicConfig;

/** Death ekranı rastgele seçenekleri — tek track. */
export const deathTrackKeys: readonly MusicTrackId[] = ['last-ember'];

/** Ana menü rastgele seçenekleri — Iron Vein, Black Tide, Crimson Horizon. */
export const menuTrackKeys: readonly MusicTrackId[] = ['main-menu', 'main-menu-2', 'main-menu-3'];
