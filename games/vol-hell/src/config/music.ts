import type { MusicTrack } from '@volstudio/core/audio/music';

const musicBasePath = 'assets/music/generated';
const BPM = 50;
const BEAT = 60 / BPM;
const COMBAT_BPM = 58;
const COMBAT_BEAT = 60 / COMBAT_BPM;
const TAIL = 4; // reverb tail loop noktasina dahil

export const musicTrackIds = ['main-menu', 'gameplay-ambient', 'combat', 'death'] as const;
export type MusicTrackId = (typeof musicTrackIds)[number];

/** Obsidian Silence tema muzik track'leri.
 *  Basit palet: 1 ana menu, 1 olum, 1 gameplay ambiyans,
 *  1 combat track (3 stem ile dikey adaptive).
 */
export const musicTracks: Record<MusicTrackId, MusicTrack> = {
  'main-menu': {
    id: 'main-menu',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 64 * BEAT + TAIL,
    stems: [
      {
        id: 'main-menu-theme',
        src: `${musicBasePath}/main-menu/main-menu.wav`,
        gain: 0.8,
        loop: true,
      },
    ],
  },

  'gameplay-ambient': {
    id: 'gameplay-ambient',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 32 * BEAT + TAIL,
    stems: [
      { id: 'ambience-bed', src: `${musicBasePath}/gameplay/ambience.wav`, gain: 0.65, loop: true },
    ],
  },

  combat: {
    id: 'combat',
    bpm: COMBAT_BPM,
    loopStart: 0,
    loopEnd: 24 * COMBAT_BEAT + TAIL,
    defaultState: { intensity: 0 },
    stems: [
      {
        id: 'combat-drone',
        src: `${musicBasePath}/combat/drone.wav`,
        gain: 0.5,
        loop: true,
      },
      {
        id: 'combat-pulse',
        src: `${musicBasePath}/combat/pulse.wav`,
        gain: 0.65,
        loop: true,
      },
      {
        id: 'combat-bells',
        src: `${musicBasePath}/combat/bells.wav`,
        gain: 0.8,
        loop: true,
        gainMap: {
          intensity: [
            { threshold: 0, gain: 0 },
            { threshold: 0.35, gain: 0.15 },
            { threshold: 0.7, gain: 0.75 },
            { threshold: 1, gain: 1 },
          ],
        },
      },
    ],
  },

  death: {
    id: 'death',
    bpm: BPM,
    loopStart: 0,
    loopEnd: 40 * BEAT + TAIL,
    stems: [{ id: 'death-drone', src: `${musicBasePath}/death/death.wav`, gain: 0.75, loop: true }],
  },
};

/** Ambiyans track'leri (looplu, arka planda az hissedilen). */
export const ambientTracks = {
  gameplay: musicTracks['gameplay-ambient'],
} as const;

/** Death ekrani rastgele secenekleri — simdi tek track. */
export const deathTrackKeys: readonly MusicTrackId[] = ['death'];
