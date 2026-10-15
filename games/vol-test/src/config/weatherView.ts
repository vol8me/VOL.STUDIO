export const WEATHER_VIEW = {
  particles: 512,
  vehicleCapacity: 16,
  wakeCapacity: 32,
  seasonDepth: -105,
  seasons: {
    spring: { ground: 0xb6b88e, patch: 0x687d45, alpha: 0.22 },
    summer: { ground: 0xd7bf91, patch: 0x9f8a4f, alpha: 0.16 },
    autumn: { ground: 0xba956e, patch: 0x8e4e2d, alpha: 0.24 },
    winter: { ground: 0x9fadb0, patch: 0x657b84, alpha: 0.18 },
  },
  terrain: {
    noiseScale: 160,
    subdivisions: 2,
    groundThreshold: 0.62,
    waterDepthBias: 0.5,
    waterNoise: 0.75,
    waterThreshold: 0.72,
  },
  /**
   * Yeşillik: ekilebilir yamalarda yağmurla büyüyen çim tutamları. Kar katmanının (`surfaceDepth`)
   * altında çizilir: ince kar yeşilliği saydam örter, kalın kar tümden gizler.
   */
  vegetation: {
    depth: -92,
    /** Kar üstünde görünen uçlar (yüzey katmanının üstü, su katmanının altı). */
    tipDepth: -88.5,
    /** Çayır bu aralıktan (ms, sim saati) sık yeniden çizilmez; kamera görünür alandan çıkınca çizilir. */
    redrawMs: 600,
    /** Küme ızgarası aralığı (birim) ve kare başına küme tavanı (uzaklaşınca seyrelir). */
    spacing: 26,
    capacity: 1500,
    /** Bu örtünün altı çıplak toprak; çayır bölgesi örtü + kenar gürültüsü eşiği aşınca başlar. */
    minGrowth: 0.04,
    threshold: 0.16,
    /** Kenar tırtıklanma genliği (örtü birimi) ve kenardan içeriye kümelerin sıklaşma hızı. */
    edgeNoise: 0.34,
    density: 3.2,
    /** Küme öbeklenmesi: gürültü bu orandan (`min`) 1'e kadar kabul olasılığını çarpar. */
    clump: { min: 0.3 },
    /** Kontur dolgusu örnekleme adımı (birim): kenar bu çözünürlükte tırtıklıdır. */
    edgeStep: 20,
    /** Çayır tabanı: yaprak renginde yumuşak dolgu; çekirdek, yoğun (olgun) örtüde daha koyu leke. */
    base: { alpha: 0.4 },
    core: { threshold: 0.62, alpha: 0.2 },
    /** Küme boyu (birim) en küçük ve en büyük örtüde; küme başına yaprak, yelpaze açısı ve çizgi kalınlığı. */
    length: [5, 12],
    blades: 6,
    spread: 1.9,
    bladeWidth: 1.4,
    /** Küme altı temas gölgesi: saydamlık ve koyu yapraktan karartma oranı. */
    shadeAlpha: 0.2,
    shadeDarken: 0.5,
    bloomRadius: 1.9,
    /** Kar üstündeki uçlar: bu kar derinliğinin (m) altında çizilmez, tam derinliğin `fadeDepth` katında `floor` payına iner (derin karda da birkaç ucu görünür). */
    tip: {
      minSnow: 0.002,
      fadeDepth: 2.2,
      floor: 0.22,
      length: 0.6,
      snowColor: 0xe4eef2,
      snowMix: 0.15,
    },
    /** Mevsim başına yaprak, açık yaprak ve çiçek; geçişte bir sonrakine karışır (`seasons` gibi). */
    palette: {
      spring: { leaf: 0x4f8a34, light: 0x8cc156, bloom: 0xf3e07a },
      summer: { leaf: 0x5f8a2f, light: 0x9fb24a, bloom: 0xf2c4d8 },
      autumn: { leaf: 0x86722a, light: 0xc79a3a, bloom: 0xd9722f },
      winter: { leaf: 0x6f7c5c, light: 0x93a381, bloom: 0xdde6ea },
    },
    /** Çiçekli kümelerin payı [0, 1]; yalnız bahar ve yaz. */
    bloomShare: { spring: 0.22, summer: 0.1, autumn: 0, winter: 0 },
  },
  surfaceDepth: -89,
  reflectionDepth: 8,
  precipitationDepth: 20,
  wakeDepth: 12,
  rain: { speed: 480, length: 14, alpha: 0.38, color: 0xb9d7e8 },
  snow: { speed: 40, radius: 1.7, alpha: 0.78, color: 0xf7fafc },
  dust: { speed: 25, particles: 72, radius: 38, alpha: 0.085, color: 0xd4ba95 },
  surface: {
    wetColor: 0x493f35,
    wetAlpha: 0.22,
    puddleColor: 0x294d59,
    puddleAlpha: 0.38,
    puddleFullDepth: 0.035,
    glintColor: 0xb7d7e4,
    glintAlpha: 0.16,
    snowColor: 0xf1f5f8,
    packedSnowColor: 0xb8cbd4,
    snowFullDepth: 0.045,
    snowAlpha: 0.86,
    rippleRadius: 9,
    ripplePeriodMs: 1050,
  },
  reflection: { alpha: 0.2, offsetY: 7, scaleY: 0.7, tint: 0x8fb7c7 },
  wake: {
    durationMs: 480,
    minPuddleDepth: 0.002,
    minSpeed: 12,
    spacing: 18,
    maxRadius: 14,
    alpha: 0.45,
    color: 0xc7e3e9,
  },
} as const;
