/**
 * Kayaların sunumu. Geometri `config/rocks.ts` ve `RockField`'dan gelir; burada yalnız renk, katman
 * ve düzensizlik vardır. Hiçbir sayı fiziği etkilemez: kar başlığı, ıslaklık ve yosun salt sunumdur.
 */
export const ROCK_VIEW = {
  /** Su (-88) ve izlerin (-87) üstü, araçların (10) altı. */
  depth: -80,
  /**
   * Lob çokgeni: köşe sayısı, yarıçap düzensizliği ve açı titreşimi (köşeler eşit aralıklı değildir,
   * yoksa kaya yuvarlak ve yapay görünür). Üst düzlem, dış çokgenin bu oranıdır ve ışığa doğru kayar.
   */
  vertices: 10,
  roughness: 0.2,
  angleJitter: 0.32,
  top: { scale: 0.5, shift: 0.16 },
  /** Gölge uzunluğu (lob yüksekliği başına birim); yön `config/light.ts`'ten gelir. */
  shadow: { length: 30, alpha: 0.3, color: 0x000000 },
  /**
   * Yüz renkleri: ışığa dönük yüz `light`, gölge yüzü `dark`; yüzün normali ışıkla iç çarpımıyla karışır.
   * `variance` yüz başına küçük rastgele parlaklık sapmasıdır (düz boyalı görünmesin).
   */
  palette: {
    rim: 0x3c3831,
    dark: 0x57524a,
    light: 0xaaa392,
    top: 0xc4bdab,
    crack: 0x2a2722,
    glint: 0xe6dfcd,
  },
  variance: 0.09,
  /** Kırık çizgi sayısı (kenardan içeri kısa kırıklar) ve dipteki çakıl sayısı. */
  cracks: 3,
  pebbles: 3,
  /** Islaklığın koyulaştırması ve kar başlığının rengi ile en çok saydamlığı. */
  wetDarken: 0.28,
  snow: { color: 0xf3f7fa, shade: 0xc4d4de, alpha: 0.92, fullDepth: 0.045 },
  /** Kaya dibindeki yeşillik: tutam sayısı ve rengi (mevsim yeşilliğiyle aynı aileden). */
  moss: { count: 7, color: 0x5e7a3a, dark: 0x3f5a28, size: 0.12 },
  /**
   * Örümceğin kaya tırmanışı sunumu (fizik `ROCKS.climb`): ayaklar kayanın üstüne basar (`stepUp`,
   * kalça yüksekliğinin oranı) ve kalça aynı payla kalkar; adımlar basamak çıkar gibi `swingGain` kat
   * yükseğe kalkar, gövde `leanBack` piksel geriye yaslanır. Yükselme `heave` yayıdır: çıkışta
   * hafifçe aşar ve oturur, giriş sıçramaz. Her ayak daha ağır basar ve daha çok toz kaldırır.
   */
  spiderClimb: {
    stepUp: 0.85,
    hipRise: 0.2,
    swingGain: 1.7,
    leanBack: 3.4,
    heave: { stiffness: 230, damping: 14 },
    dustBoost: 1.1,
    plantBoost: 0.35,
  },
} as const;
