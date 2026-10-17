/**
 * Savaş katmanının olayları. Fizik olaylarından (`SimEvent`) ayrıdır: araç hasarını değil, cephenin
 * durumunu bildirir. Tel olayına (`NetEvent`) katılır; görünüm ve HUD bunları alır.
 */
export type WarEvent =
  /** Bir bölgenin sahibi değişti; `owner` -1 ise bölge tarafsızlaştı. */
  | { readonly kind: 'zone'; readonly zone: number; readonly owner: number }
  /** Bir cephe hâkimiyet puanına ulaştı: savaş kazanıldı, puanlar ve bölgeler sıfırlandı. */
  | { readonly kind: 'warWon'; readonly faction: number; readonly wins: number };
