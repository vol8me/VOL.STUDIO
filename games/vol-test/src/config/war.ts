/**
 * Kalıcı savaş dünyasının kuralları. Konumlar dünya ölçüsünün oranıdır (0..1): dünya büyüyünce
 * harita aynı düzeni korur. Hiçbir sayı ağdan değiştirilemez; sunucu ve çevrimdışı alıştırma
 * aynı tabloyu okur.
 */

export type FactionId = 0 | 1;

export interface ZoneSpec {
  /** Ayırt edici anahtar: i18n adı `voltest:war.zone.<id>`. */
  readonly id: string;
  /** Dünya genişliği ve yüksekliğine oranla konum. */
  readonly x: number;
  readonly y: number;
  /** Ele geçirme çemberinin yarıçapı (birim). */
  readonly radius: number;
}

export interface BaseSpec {
  readonly x: number;
  readonly y: number;
  /** Doğma halkasının yarıçapı (birim). */
  readonly radius: number;
}

export const WAR = {
  /** İki cephe: ad ve renk sunumdadır; kural yalnız indeks bilir. */
  factions: 2,

  /** Üsler dünyanın karşıt köşelerinde, çaprazın iki ucundadır. */
  bases: [
    { x: 0.14, y: 0.86, radius: 760 },
    { x: 0.86, y: 0.14, radius: 760 },
  ] as readonly BaseSpec[],

  /** Ele geçirilecek bölgeler: çapraz hat üzerinde ve iki yanında. */
  zones: [
    { id: 'core', x: 0.5, y: 0.5, radius: 600 },
    { id: 'outpostWest', x: 0.33, y: 0.67, radius: 480 },
    { id: 'outpostEast', x: 0.67, y: 0.33, radius: 480 },
    { id: 'ridgeNorth', x: 0.27, y: 0.27, radius: 520 },
    { id: 'ridgeSouth', x: 0.73, y: 0.73, radius: 520 },
    { id: 'frontNorth', x: 0.52, y: 0.12, radius: 480 },
    { id: 'frontSouth', x: 0.48, y: 0.88, radius: 480 },
  ] as readonly ZoneSpec[],

  capture: {
    /** Bölgede tek başına duran bir aracın boş bölgeyi ele geçirme süresi (sn). */
    soloSeconds: 16,
    /** Hız çarpanı için sayılan en çok araç farkı. */
    maxAdvantage: 3,
    /** Rakipsiz bölgede ele geçirenin yokluğunda ilerleme bu hızla (1/sn) boşa doğru söner. */
    decayPerSecond: 0.02,
  },

  score: {
    /** Elde tutulan her bölgenin cepheye saniyede kazandırdığı puan. */
    zonePerSecond: 1,
    /** Düşman aracı etkisiz hâle getirmenin cepheye puanı. */
    perKill: 2,
    /** Bu puana ilk ulaşan cephe savaşı kazanır; puanlar ve bölgeler sıfırlanır, savaş sürer. */
    dominance: 1200,
  },

  population: {
    /** Cephe başına hedef araç sayısı (insan + bot); insan girince bir bot yerini bırakır. */
    perFaction: 8,
    /** Bot kadrosundaki araç ağırlıkları (`VEHICLE_IDS` sırası: striker, bulwark, dart, arachnid). */
    roster: [3, 2, 2, 2] as readonly number[],
    skill: { min: 0.25, max: 0.85 },
    /** Nüfus ve görev denetim aralığı (ms). */
    reviewMs: 1000,
    /** Bir bot görevini yeniden değerlendirme aralığı (ms) ve ilk seçimdeki sapma payı. */
    reassignMs: 4200,
    reassignJitterMs: 1800,
  },

  /** Bölge seçiminde ağırlıklar: savunulan, tartışmalı ve düşman/boş bölgenin çekiciliği. */
  objective: {
    owned: 0.4,
    contested: 1.7,
    hostile: 1.2,
    /** Aynı bölgeye atanan her botun çekiciliği bu oranda düşürmesi. */
    crowding: 0.45,
    /** Uzaklık sönümü: bu mesafede (birim) çekicilik yarıya iner. */
    halfDistance: 5200,
    /** Mevcut görevi bırakmak için yenisinin en az bu kat iyi olması. */
    hysteresis: 1.25,
    /** Bölge çemberinin bu katı kadar uzaktaki düşmana peşine düşülmez. */
    leashRadii: 2.4,
  },

  spawn: {
    /** Doğma halkasında adaylar ve yarıçapın bu oranı aralığında dağılır. */
    candidates: 28,
    /** Taze doğan araç düşman ve dost araçlardan bu kadar uzağı tercih eder (birim, ~9 m). */
    clearance: 300,
  },

  /** Bot adları: cepheye göre ek önek alır, `Ad 2` gibi çakışmalar çözülür. */
  callsigns: [
    'Kestrel',
    'Vanta',
    'Rook',
    'Ember',
    'Tarn',
    'Skiff',
    'Orion',
    'Havoc',
    'Lynx',
    'Mire',
    'Cobalt',
    'Jackal',
    'Pylon',
    'Raven',
    'Sable',
    'Tundra',
    'Quill',
    'Bastion',
    'Flint',
    'Harrier',
  ] as readonly string[],
} as const;
