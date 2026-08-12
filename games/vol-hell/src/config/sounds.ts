/**
 * Oyun ses efektleri — olay → kategorize edilmiş dosya yolları.
 * Dosyalar `public/assets/audio/sfx/<kategori>/` altında üretilir.
 */

const basePath = 'assets/audio/sfx';

const ui = `${basePath}/ui`;
const player = `${basePath}/player`;
const combat = `${basePath}/combat`;

/** Olay başına varyasyon listesi (0, 1, ...). */
export const soundAssets = {
  menuBlip: [`${ui}/menu-blip-0.ogg`, `${ui}/menu-blip-1.ogg`],
  back: [`${ui}/back-0.ogg`],
  pause: [`${ui}/pause-0.ogg`],
  resume: [`${ui}/resume-0.ogg`],
  restart: [`${ui}/restart-0.ogg`],

  fire: [`${player}/fire-0.ogg`, `${player}/fire-1.ogg`, `${player}/fire-2.ogg`],
  dash: [`${player}/dash-0.ogg`],
  hurt: [`${player}/hurt-0.ogg`, `${player}/hurt-1.ogg`],
  death: [`${player}/death-0.ogg`],

  enemyHit: [`${combat}/enemy-hit-0.ogg`, `${combat}/enemy-hit-1.ogg`],
  enemyDeath: [`${combat}/enemy-death-0.ogg`, `${combat}/enemy-death-1.ogg`],
  bulletBounce: [`${combat}/bullet-bounce-0.ogg`],
} as const;

/** Olay → GameAudio SFX key eşlemesi. */
export const soundKeys = {
  menuBlip: 'sfx-menu-blip',
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
