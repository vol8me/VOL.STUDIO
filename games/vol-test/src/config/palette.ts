/**
 * Oyun dünyasının paleti. UI renkleri (`VOL_COLORS`, `--vol-ui-*`) YALNIZ
 * HUD'a aittir; dünya, tank ve efektler bu tablodan beslenir. İki dil
 * birbirine karışmaz: tema değişince oyun, oyun değişince HUD etkilenmez.
 *
 * Zemin sıcak bir çöl kumudur; ızgara zemine yarı saydam siyahla işlenir,
 * böylece ton değişse de ızgara aynı derinlikte kalır.
 */
export const PALETTE = {
  /** Dünyanın dışı (kamera dünyadan geniş kalırsa görünen). */
  void: '#1d1812',
  sand: 0xc8ab82,
  gridMinor: { color: 0x14100c, alpha: 0.1 },
  gridMajor: { color: 0x14100c, alpha: 0.2 },
  border: 0x4a3a2a,
  /** Duvar çarpmasında parlayan sınır. */
  impact: 0xfff1d6,
  /** Metal kıvılcımı (isabet, duvar). */
  spark: [0xffd48a, 0xfff4dc] as const,
  /** Tankın biyolüminesans silahı: mermi izi ve ağız parlaması. */
  energy: 0x52f5cf,
  energyHot: 0xeafff9,
  dust: 0xe0c9a4,
  smoke: 0xefe7da,
  treadMark: 0x3a2c1e,
  /** Kayan paletin kumu sıyırıp ezdiği koyu çizgi. */
  skidMark: 0x2a1f15,
} as const;
