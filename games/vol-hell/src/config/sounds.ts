/**
 * Oyun sesleri — olay → dosya eşlemesi.
 * Tüm ses dosyaları `public/assets/sounds/` altında, Retro paketten.
 * Phaser preload bu listeden otomatik yükler.
 */

/** Phaser audio key → dosya yolu eşlemesi. */
export const soundAssets = {
  fire: 'assets/sounds/throw.wav',
  hurt: 'assets/sounds/hurt.wav',
  death: 'assets/sounds/lose.wav',
  dash: 'assets/sounds/jump_short.wav',
  enemyDeath: 'assets/sounds/explosion_small.wav',
  explosionLarge: 'assets/sounds/explosion_large.wav',
  powerUp: 'assets/sounds/power_up.wav',
  powerDown: 'assets/sounds/power_down.wav',
  coin: 'assets/sounds/coin.wav',
  menuBlip: 'assets/sounds/menu_blip.wav',
  pause: 'assets/sounds/power_down_2.wav',
  resume: 'assets/sounds/power_up_2.wav',
  restart: 'assets/sounds/grow_big.wav',
  ghost: 'assets/sounds/ghost.wav',
  wobble: 'assets/sounds/wobble.wav',
} as const;

/** Olay → Phaser audio key eşlemesi. AudioManager.play() bu key'leri kullanır. */
export const soundKeys = {
  fire: 'sfx-fire',
  hurt: 'sfx-hurt',
  death: 'sfx-death',
  dash: 'sfx-dash',
  enemyDeath: 'sfx-enemy-death',
  explosionLarge: 'sfx-explosion-large',
  powerUp: 'sfx-power-up',
  powerDown: 'sfx-power-down',
  coin: 'sfx-coin',
  menuBlip: 'sfx-menu-blip',
  pause: 'sfx-pause',
  resume: 'sfx-resume',
  restart: 'sfx-restart',
  ghost: 'sfx-ghost',
  wobble: 'sfx-wobble',
} as const;

/** preload() için key → dosya yolu listesi. */
export const soundLoadList: ReadonlyArray<readonly [string, string]> = Object.entries(
  soundKeys,
).map(([event, key]) => {
  const file = soundAssets[event as keyof typeof soundAssets];
  return [key, file] as const;
});
