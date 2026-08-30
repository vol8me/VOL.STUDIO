/**
 * Varlıkların kalite kademesinden okuduğu görsel anahtarlar.
 *
 * Entity'ler `@/app/services` singleton'ına UZANMAZ: bir düşman ya da mermi
 * yaratmak için uygulamanın tamamının kurulmuş olması gerekmemeli (testler ve
 * simülasyon bunu Phaser'sız yapıyor). Sağlayıcı enjekte edilir ve verilmezse
 * TAM kalite varsayılır — yani varsayılan davranış hiç değişmez.
 */
export interface EntityVisualQuality {
  /** Varlık kenar çizgileri çizilsin mi (arc başına ikinci çizim geçişi). */
  readonly entityStrokes: boolean;
  /** Mermi izi partikülleri üretilsin mi. */
  readonly bulletTrails: boolean;
}

export const FULL_ENTITY_VISUALS: EntityVisualQuality = {
  entityStrokes: true,
  bulletTrails: true,
};

/** Canlı okunabilen sağlayıcı; kalite oyun sırasında değişebilir. */
export type EntityVisualQualityProvider = () => EntityVisualQuality;

export function resolveEntityVisuals(
  provider: EntityVisualQualityProvider | undefined,
): EntityVisualQuality {
  return provider?.() ?? FULL_ENTITY_VISUALS;
}
