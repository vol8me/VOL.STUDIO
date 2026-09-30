/**
 * Oyun hissi: olayların kameraya ve titreşime yansıması. Fizik ayarları
 * `tank.ts`te, kamera takibi `camera.ts`tedir; burası olay → tepki eşlemesidir.
 */
export const FEEL = {
  /**
   * Atış kamerayı SARSMAZ: sürekli ateşte görüntü okunur kalmalı. Yalnız
   * atışın tersine küçük, yaylı bir yön itmesi vardır; geri tepmeyi tank,
   * süspansiyon ve namlu taşır.
   */
  fire: {
    /** Kamera atışın tersine bu hızla (birim/s) itilir. */
    cameraKick: 60,
    /** Atış titreşiminin şiddeti (0–1). */
    haptic: 0.7,
  },
  /**
   * Patlama sarsıntısı oyuncuya uzaklıkla söner (`1 - d / radius`, karesi) ve
   * tavanlıdır; ekranın öbür ucundaki patlama görüntüyü oynatmaz.
   */
  blast: {
    trauma: 0.3,
    radius: 560,
    /** Titreşim yalnız bu yarıçapın içindeki patlamada, uzaklıkla sönen şiddetle. */
    hapticRadius: 280,
    haptic: 0.55,
  },
  /** Oyuncu isabet aldı: sarsıntı tavanlı, titreşim güçlü. */
  hit: { trauma: 0.35 },
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
