/**
 * Oyun hissi: olayların kameraya ve titreşime yansıması. Fizik ayarları
 * `tank.ts`te, kamera takibi `camera.ts`tedir; burası olay → tepki eşlemesidir.
 */
export const FEEL = {
  fire: {
    /** Kamera atışın tersine bu hızla (birim/s) itilir. */
    cameraKick: 150,
    trauma: 0.06,
  },
  wall: {
    /** Bu çarpma hızında yankı, sarsıntı ve titreşim tam şiddettedir. */
    fullSpeed: 340,
    traumaBase: 0.2,
    traumaScale: 0.5,
    /** Bu şiddetin üstündeki çarpma güçlü titreşim desenini çalar. */
    heavyHaptic: 0.5,
  },
  /** Paletin zeminden bu kadar hızlı döndüğü an patinajdır (birim/s). */
  slipSpeed: 45,
} as const;
