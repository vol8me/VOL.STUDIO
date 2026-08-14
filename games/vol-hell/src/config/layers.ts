/**
 * Render katmanları (Phaser depth).
 *
 * Depth verilmediğinde Phaser yaratılma sırasına göre çizer; bu, sonradan
 * doğan her düşmanın oyuncunun ve yerdeki Flux'un üstüne binmesine, sıralamanın
 * koşudan koşuya değişmesine yol açıyordu. Katmanlar burada TEK yerde ve
 * aralarında boşluk bırakacak şekilde tanımlanır: araya yeni bir katman
 * girdiğinde mevcut değerleri kaydırmak gerekmesin.
 */
export const RENDER_DEPTH = {
  /** Saha sınırı — her şeyin altında. */
  border: -100,
  /** Zemin efektleri: mermi izi, dash hayaleti, namlu kıvılcımı. */
  groundEffect: -60,
  /** Yerdeki Flux parçaları — düşmanlar üzerinden geçer. */
  fluxPickup: -50,
  /** Ateş alanı gibi zemine serilen ability etkileri. */
  abilityGround: -40,
  /** Düşman gövdeleri. */
  enemy: 0,
  /** Kule gibi yerleştirilen yapılar — düşmanların üstünde, oyuncunun altında. */
  structure: 8,
  /** Düşman can barları — başka bir düşmanın gövdesi altında kalmasın. */
  enemyHealthBar: 5,
  /** Oyuncu — kalabalıkta asla kaybolmaz. */
  player: 10,
  /** Mermiler. */
  bullet: 20,
  /** Zincir yıldırım gibi anlık ability görselleri — mermilerin üstünde okunur. */
  abilityVisual: 25,
  /** Vuruş/ölüm/toplama efektleri — en üstte okunur. */
  impactEffect: 30,
} as const;

export type RenderDepth = typeof RENDER_DEPTH;
