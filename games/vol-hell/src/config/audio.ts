/** Ses ayarları. 0-1 arası volume değerleri. */
export const audioConfig = {
  /** Master ses seviyesi (0-1). Tüm sesleri ölçekler. */
  masterVolume: 0.8,
  /** SFX (efekt) ses seviyesi (0-1). */
  sfxVolume: 0.7,
  /** Müzik ses seviyesi (0-1). */
  musicVolume: 0.5,
  /** Ses kısma durumu. */
  muted: false,
} as const;

export type AudioConfig = typeof audioConfig;
