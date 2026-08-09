/**
 * Oyun ses efektleri — olay → kategorize edilmiş dosya yolları.
 * Dosyalar `public/assets/sounds/generated/<kategori>/` altında üretilir.
 */

const basePath = 'assets/sounds/generated';

const ui = `${basePath}/ui`;
const player = `${basePath}/player`;
const combat = `${basePath}/combat`;

/** Olay başına varyasyon listesi (0, 1, ...). */
export const soundAssets = {
  menuBlip: [`${ui}/menu-blip-0.wav`, `${ui}/menu-blip-1.wav`],
  confirm: [`${ui}/confirm-0.wav`],
  back: [`${ui}/back-0.wav`],
  pause: [`${ui}/pause-0.wav`],
  resume: [`${ui}/resume-0.wav`],
  restart: [`${ui}/restart-0.wav`],

  fire: [`${player}/fire-0.wav`, `${player}/fire-1.wav`, `${player}/fire-2.wav`],
  dash: [`${player}/dash-0.wav`],
  hurt: [`${player}/hurt-0.wav`, `${player}/hurt-1.wav`],
  death: [`${player}/death-0.wav`],

  enemyHit: [`${combat}/enemy-hit-0.wav`, `${combat}/enemy-hit-1.wav`],
  enemyDeath: [
    `${combat}/enemy-death-0.wav`,
    `${combat}/enemy-death-1.wav`,
    `${combat}/enemy-death-2.wav`,
  ],
  bulletBounce: [`${combat}/bullet-bounce-0.wav`],
} as const;

/** Olay → GameAudio SFX key eşlemesi. */
export const soundKeys = {
  menuBlip: 'sfx-menu-blip',
  confirm: 'sfx-confirm',
  back: 'sfx-back',
  pause: 'sfx-pause',
  resume: 'sfx-resume',
  restart: 'sfx-restart',

  fire: 'sfx-fire',
  dash: 'sfx-dash',
  hurt: 'sfx-hurt',
  death: 'sfx-death',

  enemyHit: 'sfx-enemy-hit',
  enemyDeath: 'sfx-enemy-death',
  bulletBounce: 'sfx-bullet-bounce',
} as const;

export type SoundEvent = keyof typeof soundAssets;
export type SoundKey = (typeof soundKeys)[SoundEvent];

/** Ön yükleme için key → dosya yolu listesi. */
export const soundLoadList: ReadonlyArray<readonly [string, string]> = Object.entries(
  soundAssets,
).flatMap(([event, files]) => {
  const key = soundKeys[event as SoundEvent];
  return files.map((file, index) => [`${key}--${index}`, file] as const);
});
