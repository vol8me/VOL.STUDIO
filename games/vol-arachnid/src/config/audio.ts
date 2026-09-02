import type { MusicTrack } from '@volstudio/core/audio/music';

export type ArachnidSoundEvent = 'step' | 'dashLaunch' | 'dashLand' | 'wallImpact';

/** Uzun tekrar hissini azaltan, gerçek crossfade-loop süresi. */
export const ARACHNID_AMBIENCE_DURATION_SECONDS = 48;

const sfxPath = 'assets/audio/sfx';

/** Üretilmiş ses varlıkları; runtime sentez yapmaz. */
export const arachnidSoundAssets: Readonly<Record<ArachnidSoundEvent, readonly string[]>> = {
  step: [
    `${sfxPath}/step-1.ogg`,
    `${sfxPath}/step-2.ogg`,
    `${sfxPath}/step-3.ogg`,
    `${sfxPath}/step-4.ogg`,
  ],
  dashLaunch: [`${sfxPath}/dash-launch.ogg`],
  dashLand: [`${sfxPath}/dash-land.ogg`],
  wallImpact: [`${sfxPath}/wall-impact.ogg`],
};

/**
 * Sabit miks ve kaynak bütçesi. Ayar ekranı yoktur; VOL.ARACHNID her açılışta
 * bu dengeli profili kullanır.
 */
export const arachnidAudioConfig = {
  masterVolume: 0.82,
  ambienceVolume: 0.28,
  sfxVolume: 0.78,
  maxVoices: 12,
  maxVoicesPerSound: 3,
  minRetriggerMs: 24,
  limiter: {
    thresholdDb: -7,
    kneeDb: 2,
    ratio: 18,
    attackSeconds: 0.003,
    releaseSeconds: 0.12,
  },
  events: {
    step: { gain: 0.34, rateJitter: 0.07 },
    dashLaunch: { gain: 0.72, rateJitter: 0.025 },
    dashLand: { gain: 0.82, rateJitter: 0.02 },
    wallImpact: { gain: 0.92, rateJitter: 0.015 },
  },
  intensity: {
    wallImpactFloor: 0.55,
    stepBase: 0.72,
    stepPerPlant: 0.07,
    stepPlantCap: 4,
  },
} as const;

/** Dikişsiz oyuk ambiyansı; loop noktası üretim süresiyle birebir eşleşir. */
export const arachnidAmbienceTrack: MusicTrack = {
  id: 'arachnid-hollow',
  bpm: 60,
  loopStart: 0,
  loopEnd: ARACHNID_AMBIENCE_DURATION_SECONDS,
  stems: [
    {
      id: 'hollow',
      src: 'assets/audio/ambience/hollow.ogg',
      gain: 1,
      loop: true,
    },
  ],
};
