import type { MusicTrack } from '@volstudio/core/audio/music';

const musicBasePath = 'assets/audio/music';
const ambienceBasePath = 'assets/audio/ambience';

import { MUSIC_TIMING, trackSeconds } from './musicTiming';

/**
 * `loopEnd` değerleri `musicTiming.ts`ten TÜRETİLİR, elle yazılmaz.
 *
 * Bu sayılar bir dönem hem burada hem üretim script'lerinde ayrı ayrı
 * duruyordu ve "birebir eşleşmek zorunda" diye bir yorumla korunuyordu.
 * Ayrışma sessizdi: `loopEnd` dosyadan uzunsa Web Audio loop aralığını yok
 * sayar, kısaysa parça erken başa sarar.
 */
const loopEndOf = (id: keyof typeof MUSIC_TIMING): number => trackSeconds(MUSIC_TIMING[id]);

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
    bpm: MUSIC_TIMING['hollow-signal'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('hollow-signal'),
    stems: [
      {
        id: 'hollow-signal',
        src: `${musicBasePath}/main-menu/hollow-signal.ogg`,
        gain: 0.8,
        // Menü parçaları DÖNMEZ: bitince playlist sıradakine geçsin diye.
        // `loop: true` iken ikinci parçaya hiç sıra gelmiyordu.
        loop: false,
      },
    ],
  },

  'event-horizon': {
    id: 'event-horizon',
    bpm: MUSIC_TIMING['event-horizon'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('event-horizon'),
    stems: [
      {
        id: 'event-horizon',
        src: `${musicBasePath}/main-menu/event-horizon.ogg`,
        gain: 0.8,
        // Menü parçaları DÖNMEZ: bitince playlist sıradakine geçsin diye.
        // `loop: true` iken ikinci parçaya hiç sıra gelmiyordu.
        loop: false,
      },
    ],
  },

  'surge-protocol': {
    id: 'surge-protocol',
    bpm: MUSIC_TIMING['surge-protocol'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('surge-protocol'),
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
    bpm: MUSIC_TIMING['sovereign'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('sovereign'),
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
    bpm: MUSIC_TIMING['terminal-echo'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('terminal-echo'),
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
    bpm: MUSIC_TIMING['first-light'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('first-light'),
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
    bpm: MUSIC_TIMING['null-drift'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('null-drift'),
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
    bpm: MUSIC_TIMING['deep-current'].bpm,
    loopStart: 0,
    loopEnd: loopEndOf('deep-current'),
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
  /** Ana menü müziği — parça listesi hâlinde çalar. */
  menu: {
    fadeInSec: 2,
    /** Menüden çıkarken müziğin kapanma süresi (saniye). */
    stopFadeSec: 1,
    /** Bir parça bitip sıradakine geçmeden önceki sessizlik (ms). */
    gapMs: 3000,
  },
} as const;

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
