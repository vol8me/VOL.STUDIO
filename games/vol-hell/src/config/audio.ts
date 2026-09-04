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
  /**
   * Dokunsal geri bildirim (titreşim). Dokunmatik cihazlarda anlamlıdır;
   * masaüstünde `navigator.vibrate` yoktur ve çağrılar sessizce düşer.
   * Varsayılan AÇIK: mobilde düğme basımının hissedilmesi beklenir.
   */
  hapticsEnabled: true,
} as const;

/** Bir SFX olayının eşzamanlı ses ve tekrar aralığı bütçesi. */
export interface SfxVoiceLimitConfig {
  /** Aynı olaydan eşzamanlı yaşayabilecek kaynak sayısı. */
  maxVoices: number;
  /** Aynı olayın iki başlangıcı arasındaki en kısa süre (saniye). */
  minInterval: number;
}

const eventVoiceLimits: Partial<Record<SoundEvent, SfxVoiceLimitConfig>> = {
  // Tek bir UI niyeti tek ses olarak okunmalı; üst üste blip cızırtı gibi duyulur.
  menuBlip: { maxVoices: 1, minInterval: 0.08 },
  fire: { maxVoices: 3, minInterval: 0.05 },
  dash: { maxVoices: 2, minInterval: 0.1 },
  hurt: { maxVoices: 2, minInterval: 0.08 },
  enemyHit: { maxVoices: 4, minInterval: 0.04 },
  enemyDeath: { maxVoices: 3, minInterval: 0.05 },
  bulletBounce: { maxVoices: 3, minInterval: 0.05 },
  fluxPickup: { maxVoices: 3, minInterval: 0.04 },
  turretFire: { maxVoices: 4, minInterval: 0.08 },
  telegraph: { maxVoices: 4, minInterval: 0.03 },
  eliteSpawn: { maxVoices: 1, minInterval: 0.2 },
  bossSpawn: { maxVoices: 1, minInterval: 0.2 },
  bossEnrage: { maxVoices: 1, minInterval: 0.2 },
  bossDown: { maxVoices: 1, minInterval: 0.2 },
  waveStart: { maxVoices: 1, minInterval: 0.2 },
  waveClear: { maxVoices: 1, minInterval: 0.2 },
  levelUp: { maxVoices: 1, minInterval: 0.2 },
};

/**
 * SFX kaynak bütçesi.
 *
 * Olay başı limit tek bir ses ailesinin taşmasını önler; global tavan ise çok
 * sayıda FARKLI olay aynı karede patladığında Web Audio kaynak sayısını ve
 * toplam miks tepesini sınırlar. Ses çalarken aniden `stop()` etmek dalga
 * biçimini sıfır olmayan noktada kesip özellikle telefon hoparlöründe klik/
 * cızırtı üretir; kaynaklar kısa bir kazanç rampasından sonra durdurulur.
 */
export const sfxVoiceConfig = {
  /** Yeni ses başlatabilen (fade kuyruğunda olmayan) eşzamanlı sesler. */
  globalMaxVoices: 16,
  /**
   * Kısa fade ile kapanan kaynaklar `onended` gelene kadar Web Audio ağında
   * yaşamaya devam eder. Ani salkımda aktif bütçe sabit kalsa bile bu kuyruk
   * sınırsız büyümesin; doygunken yeni ve daha az önemli ses düşürülür.
   */
  globalMaxLiveVoices: 20,
  defaultLimit: { maxVoices: 2, minInterval: 0.03 } satisfies SfxVoiceLimitConfig,
  eventLimits: eventVoiceLimits,
  stopFadeSeconds: 0.008,
} as const;

/**
 * Olay başına SFX kazancı (0-1). Sahne kodunda `playSfx(..., { volume: 0.45 })`
 * gibi literal yazılmaz — mix dengesi tek yerden ayarlanabilmeli.
 * Bu değerler `sfxVolume` slider'ıyla ayrıca ölçeklenir.
 *
 * Hiyerarşi: UI ~0.4-0.5, ateş ~0.55, hasar ~0.75, ölüm/boss ~0.85-0.9.
 */
export const sfxVolumes: Record<SoundEvent, number> = {
  // UI
  menuBlip: 0.48,
  back: 0.46,
  pause: 0.5,
  resume: 0.5,
  restart: 0.52,
  deny: 0.45,
  cardPick: 0.5,
  cardBuy: 0.54,
  reroll: 0.5,
  lock: 0.52,

  // Player
  fire: 0.55,
  dash: 0.6,
  hurt: 0.75,
  death: 0.88,
  fluxPickup: 0.42,

  // Combat
  enemyHit: 0.6,
  enemyDeath: 0.68,
  bulletBounce: 0.45,
  eliteSpawn: 0.72,
  bossSpawn: 0.85,
  bossEnrage: 0.8,
  bossDown: 0.88,
  telegraph: 0.4,

  // Ability
  chainLightning: 0.66,
  fireZone: 0.62,
  multiShot: 0.6,
  turretDeploy: 0.58,
  turretFire: 0.42,

  // Progress
  waveStart: 0.55,
  waveClear: 0.55,
  levelUp: 0.6,
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
  bossSpawn: {
    music: { target: 0.5, attack: 0.05, hold: 1.2, release: 0.8 },
    ambient: { target: 0.35, attack: 0.05, hold: 1.5, release: 0.8 },
  },
  bossDown: {
    music: { target: 0.35, attack: 0.05, hold: 1.5, release: 1.0 },
    ambient: { target: 0.2, attack: 0.05, hold: 1.8, release: 1.0 },
  },
  chainLightning: {
    music: { target: 0.75, attack: 0.01, hold: 0.15, release: 0.25 },
    ambient: { target: 0.6, attack: 0.01, hold: 0.2, release: 0.3 },
  },
  fireZone: {
    music: { target: 0.8, attack: 0.02, hold: 0.3, release: 0.35 },
    ambient: { target: 0.65, attack: 0.02, hold: 0.4, release: 0.35 },
  },
  restart: {
    music: { target: 0.75, attack: 0.02, hold: 0.15, release: 0.3 },
    ambient: { target: 0.6, attack: 0.02, hold: 0.2, release: 0.35 },
  },
} as const;
