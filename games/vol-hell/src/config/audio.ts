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
