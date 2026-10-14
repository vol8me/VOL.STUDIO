/**
 * Dünyanın tek ışığı: gölge, ışığın tersine yükseklikle orantılı kayar (yükseklik başına dünya birimi).
 * Tank, örümcek ve enkaz aynı yönü kullanır; gölgeleri farklı açıda düşen araç sahnede yüzer görünür.
 */
export const LIGHT = { x: 0.38, y: 0.5 } as const;

/** Tank gövdesinin gölgesini veren ortalama yükseklik (dünya birimi). */
export const TANK_SHADOW_HEIGHT = 10;
