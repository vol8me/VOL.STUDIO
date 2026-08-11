import type { DuckingProfile } from '@volstudio/core';
import type { SoundEvent } from './sounds';

/** Ses ayarları için varsayılan değerler. 0-1 arası volume değerleri. */
export const audioConfig = {
  /** Master ses seviyesi (0-1). Tüm sesleri ölçekler. */
  masterVolume: 0.9,
  /** SFX (efekt) ses seviyesi (0-1). */
  sfxVolume: 0.85,
  /** Müzik ses seviyesi (0-1). */
  musicVolume: 0.5,
  /** Ambiyans ses seviyesi (0-1). Ambiyans SFX'i ezmemeli, bu yüzden düşük. */
  ambientVolume: 0.4,
  /** Ses kısma durumu. */
  muted: false,
  /** Ekran sarsıntısı açık/kapalı. */
  screenShakeEnabled: true,
  /** Ekran sarsıntısı şiddeti (0-1). */
  screenShakeIntensity: 0.6,
} as const;

export type AudioConfig = typeof audioConfig;

/**
 * Olay başına SFX kazancı (0-1). Sahne kodunda `playSfx(..., { volume: 0.45 })`
 * gibi literal yazılmaz — mix dengesi tek yerden ayarlanabilmeli.
 * Bu değerler `sfxVolume` slider'ıyla ayrıca ölçeklenir.
 */
export const sfxVolumes: Record<SoundEvent, number> = {
  menuBlip: 0.4,
  back: 0.5,
  pause: 0.5,
  resume: 0.5,
  restart: 0.5,

  fire: 0.45,
  dash: 0.65,
  hurt: 0.85,
  death: 0.9,

  enemyHit: 0.6,
  enemyDeath: 0.7,
  bulletBounce: 0.45,
};

/** SFX çaldığında müzik ve/veya ambiyansı geçici kısan sidechain ducking profilleri.
 *  Patlama/grinding seslerinin melodiyi boğmasını önlemek için;
 *  hedef 1 = kısmama, 0 = sessiz.
 */
export const sfxDucking: Partial<
  Record<SoundEvent, { music?: DuckingProfile; ambient?: DuckingProfile }>
> = {
  death: {
    music: { target: 0.2, attack: 0.02, hold: 0.6, release: 0.6 },
    ambient: { target: 0.1, attack: 0.02, hold: 0.9, release: 0.6 },
  },
  hurt: {
    music: { target: 0.65, attack: 0.01, hold: 0.12, release: 0.25 },
    ambient: { target: 0.45, attack: 0.01, hold: 0.18, release: 0.3 },
  },
  enemyDeath: {
    music: { target: 0.8, attack: 0.01, hold: 0.08, release: 0.2 },
    ambient: { target: 0.7, attack: 0.01, hold: 0.12, release: 0.25 },
  },
  restart: {
    music: { target: 0.75, attack: 0.02, hold: 0.15, release: 0.3 },
    ambient: { target: 0.6, attack: 0.02, hold: 0.2, release: 0.35 },
  },
} as const;
