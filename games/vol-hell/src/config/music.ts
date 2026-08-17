import type { MusicTrack } from '@volstudio/core/audio/music';

const musicBasePath = 'assets/audio/music';
const ambienceBasePath = 'assets/audio/ambience';

// Bu değerler üretim script'leriyle (scripts/audio/music/*.ts,
// scripts/audio/ambience/*.ts) BİREBİR eşleşmek zorunda: `loopEnd`
// dosyanın gerçek uzunluğunu aşarsa Web Audio loop'u sessizce tüm buffer'a
// düşürür, kısa kalırsa parça erken başa sarar.

// HOLLOW SIGNAL — ana menü 1: Dm, 84 BPM, 128 vuruş (~91.43 s).
const HOLLOW_BPM = 84;
const HOLLOW_BEAT = 60 / HOLLOW_BPM; // ~0.714 s
const HOLLOW_BEATS = 128;

// EVENT HORIZON — ana menü 2: Am, 100 BPM, 128 vuruş (~76.80 s).
const EVENT_BPM = 100;
const EVENT_BEAT = 60 / EVENT_BPM; // 0.60 s
const EVENT_BEATS = 128;

// SURGE PROTOCOL — savaş müziği: Em, 132 BPM, 128 vuruş (~58.18 s).
const SURGE_BPM = 132;
const SURGE_BEAT = 60 / SURGE_BPM; // ~0.4545 s
const SURGE_BEATS = 128;

// SOVEREIGN — boss müziği: Cm, 140 BPM, 128 vuruş (~54.86 s).
const SOVEREIGN_BPM = 140;
const SOVEREIGN_BEAT = 60 / SOVEREIGN_BPM; // ~0.4286 s
const SOVEREIGN_BEATS = 128;

// TERMINAL ECHO — ölüm ekranı: Dm, 56 BPM, 24 vuruş (~25.71 s). Loop yok.
const DEATH_BPM = 56;
const DEATH_BEAT = 60 / DEATH_BPM; // ~1.071 s
const DEATH_BEATS = 24;

// FIRST LIGHT — zafer ekranı: D, 92 BPM, 32 vuruş (~20.87 s). Loop yok.
const VICTORY_BPM = 92;
const VICTORY_BEAT = 60 / VICTORY_BPM; // ~0.652 s
const VICTORY_BEATS = 32;

// Ambiyans: 64.0 s, BPM tanımlı değil (ritimsiz, TextSound'u yok).
// MusicEngine crossfade için bir tempo verilir; loop başı/sonu kesin.
const AMBIENCE_BPM = 60;
const AMBIENCE_BEAT = 1; // 1 sn / beat
const AMBIENCE_BEATS = 64;

export const musicTrackIds = [
  'hollow-signal',
  'event-horizon',
  'surge-protocol',
  'sovereign',
  'terminal-echo',
  'first-light',
  'null-drift',
  'deep-current',
] as const;
export type MusicTrackId = (typeof musicTrackIds)[number];

/** Vol-Hell müzik ve ambiyans track'leri.
 *  2 ana menü, 1 savaş, 1 boss, 1 ölüm, 1 zafer, 2 ambiyans. */
export const musicTracks: Record<MusicTrackId, MusicTrack> = {
  'hollow-signal': {
    id: 'hollow-signal',
    bpm: HOLLOW_BPM,
    loopStart: 0,
    loopEnd: HOLLOW_BEATS * HOLLOW_BEAT, // ~91.43 s
    stems: [
      {
        id: 'hollow-signal',
        src: `${musicBasePath}/main-menu/hollow-signal.ogg`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'event-horizon': {
    id: 'event-horizon',
    bpm: EVENT_BPM,
    loopStart: 0,
    loopEnd: EVENT_BEATS * EVENT_BEAT, // ~76.80 s
    stems: [
      {
        id: 'event-horizon',
        src: `${musicBasePath}/main-menu/event-horizon.ogg`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'surge-protocol': {
    id: 'surge-protocol',
    bpm: SURGE_BPM,
    loopStart: 0,
    loopEnd: SURGE_BEATS * SURGE_BEAT, // ~58.18 s
    stems: [
      {
        id: 'surge-protocol',
        src: `${musicBasePath}/combat/surge-protocol.ogg`,
        gain: 0.85,
        loop: true,
      },
    ],
  },

  sovereign: {
    id: 'sovereign',
    bpm: SOVEREIGN_BPM,
    loopStart: 0,
    loopEnd: SOVEREIGN_BEATS * SOVEREIGN_BEAT, // ~54.86 s
    stems: [
      {
        id: 'sovereign',
        src: `${musicBasePath}/boss/sovereign.ogg`,
        gain: 0.85,
        loop: true,
      },
    ],
  },

  'terminal-echo': {
    id: 'terminal-echo',
    bpm: DEATH_BPM,
    loopStart: 0,
    loopEnd: DEATH_BEATS * DEATH_BEAT, // ~25.71 s
    stems: [
      {
        id: 'terminal-echo',
        src: `${musicBasePath}/end/terminal-echo.ogg`,
        gain: 0.75,
        loop: false,
      },
    ],
  },

  'first-light': {
    id: 'first-light',
    bpm: VICTORY_BPM,
    loopStart: 0,
    loopEnd: VICTORY_BEATS * VICTORY_BEAT, // ~20.87 s
    stems: [
      {
        id: 'first-light',
        src: `${musicBasePath}/end/first-light.ogg`,
        gain: 0.75,
        loop: false,
      },
    ],
  },

  'null-drift': {
    id: 'null-drift',
    bpm: AMBIENCE_BPM,
    loopStart: 0,
    loopEnd: AMBIENCE_BEATS * AMBIENCE_BEAT, // 64.0 s
    stems: [
      {
        id: 'null-drift',
        src: `${ambienceBasePath}/null-drift.ogg`,
        gain: 0.7,
        loop: true,
      },
    ],
  },

  'deep-current': {
    id: 'deep-current',
    bpm: AMBIENCE_BPM,
    loopStart: 0,
    loopEnd: AMBIENCE_BEATS * AMBIENCE_BEAT, // 64.0 s
    stems: [
      {
        id: 'deep-current',
        src: `${ambienceBasePath}/deep-current.ogg`,
        gain: 0.7,
        loop: true,
      },
    ],
  },
};

/** Oyun içi ambiyans track'leri. Null Drift (düşman az), Deep Current (yoğun). */
export const ambientTrackKeys = ['null-drift', 'deep-current'] as const;
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
    calmTrackId: 'null-drift' satisfies AmbientTrackKey,
    /** Düşman yoğunken çalan ambiyans. */
    tenseTrackId: 'deep-current' satisfies AmbientTrackKey,
    /** Ambiyans giriş fade süresi (saniye). */
    fadeInSec: 2,
    /** Oyuna girerken menü müziğinin kapanma süresi (saniye). */
    menuStopFadeSec: 2,
    /** Ölüm veya zafer gibi terminal ekranlarda ambiyans/müziğin kapanma süresi (saniye). */
    terminalStopFadeSec: 1,
  },
  /** Savaş müziği — `surge-protocol` ambiyansın üstüne girer. */
  combat: {
    /** Savaş müziği eşiği: düşman yoğunluğu bu seviyeyi geçince `surge-protocol` başlar. */
    enemyThreshold: 12,
    /** Savaş müziği giriş/kapanış fade süresi (saniye). */
    fadeInSec: 3,
    fadeOutSec: 4,
    /** Savaş müziğine geçiş için kararlılık süresi (ms). */
    holdMs: 2500,
    /** Savaştan ambiyansa geçiş için kararlılık süresi (ms). */
    releaseHoldMs: 4000,
  },
  /** Boss müziği. */
  boss: {
    fadeInSec: 1.5,
    fadeOutSec: 2,
  },
  /** Ölüm ekranı müziği. */
  death: {
    fadeInSec: 1,
  },
  /** Zafer ekranı müziği. */
  victory: {
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
export const deathTrackKeys: readonly MusicTrackId[] = ['terminal-echo'];

/** Ana menü rastgele seçenekleri — Hollow Signal, Event Horizon. */
export const menuTrackKeys: readonly MusicTrackId[] = ['hollow-signal', 'event-horizon'];

/** Savaş müziği track id'si. */
export const combatTrackId: MusicTrackId = 'surge-protocol';

/** Boss müziği track id'si. */
export const bossTrackId: MusicTrackId = 'sovereign';

/** Zafer müziği track id'si. */
export const victoryTrackId: MusicTrackId = 'first-light';
