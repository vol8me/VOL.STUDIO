/**
 * Aile rol sözlüğü — KAPALI ve genel. İki grup eksen vardır:
 *
 * - Akustik roller: sesin karakteri (sertlik, ağırlık, uzunluk…).
 * - Oyun durumu eksenleri: SIRALI anlam eksenleri. Oyun alanı
 *   kavramı değildir: "silah şarjlı" ya da "motor yüksek devir" tüketici
 *   paketinde `energy: high`e, "yaratık yaralı" `integrity: damaged`e,
 *   "arayüz kritik uyarı" `urgency: critical`e eşlenir. Değerler sıralıdır;
 *   aile bir eksende ölçülebilir bir yön iddiası beyan ederse (`quality.states`)
 *   iddia bu sıraya göre sınanır.
 *
 * Bu modül bilerek hiçbir şey import etmez: şema, analiz ve protokol aynı
 * sözlüğü döngüsüz okur.
 */
const ACOUSTIC_ROLE_AXES = {
  intensity: ['soft', 'medium', 'hard'],
  weight: ['light', 'medium', 'heavy'],
  length: ['short', 'long'],
  speed: ['slow', 'medium', 'fast'],
  wetness: ['dry', 'wet'],
  rarity: ['common', 'alternate', 'rare'],
  onset: ['soft', 'sharp'],
} as const;

export const STATE_AXES = {
  energy: ['idle', 'low', 'normal', 'high', 'peak'],
  urgency: ['calm', 'alert', 'warning', 'critical'],
  integrity: ['intact', 'worn', 'damaged', 'broken'],
} as const;

export const ROLE_AXES = { ...ACOUSTIC_ROLE_AXES, ...STATE_AXES } as const;
export type RoleAxis = keyof typeof ROLE_AXES;
export type StateAxis = keyof typeof STATE_AXES;

export function isStateAxis(axis: string): axis is StateAxis {
  return Object.prototype.hasOwnProperty.call(STATE_AXES, axis);
}

/** Durum değerinin eksendeki sırası (0'dan); bilinmeyen değer −1. */
export function stateRank(axis: StateAxis, value: string): number {
  return (STATE_AXES[axis] as readonly string[]).indexOf(value);
}
