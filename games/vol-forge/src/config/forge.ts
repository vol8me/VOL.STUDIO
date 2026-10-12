/**
 * Fabrika dünyasının oynanış sayıları. Simülasyon, sunucu ve istemci bu
 * dosyadan okur; sayı başka yerde yazılmaz.
 */

/** Tile türleri; sayısal değerler anlık görüntü ve ağ biçiminin parçasıdır. */
export const KIND = {
  empty: 0,
  conveyor: 1,
  drill: 2,
  smelter: 3,
  core: 4,
  turret: 5,
  wall: 6,
} as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

/** Oyuncunun inşa edebildiği türler. */
export const BUILDABLE = [
  KIND.conveyor,
  KIND.drill,
  KIND.smelter,
  KIND.turret,
  KIND.wall,
] as const satisfies readonly Kind[];

export const ITEM = { none: 0, ore: 1, plate: 2 } as const;
export type Item = (typeof ITEM)[keyof typeof ITEM];
export const ITEM_COUNT = 3;

export const WORLD = {
  /** Tile cinsinden dünya boyutu. */
  width: 256,
  height: 256,
  /** Ağ ilgi alanının ve çizimin birimi: chunk kenarı tile. */
  chunk: 16,
  /** Yalnız çizim: tile kenarı piksel. */
  tilePx: 24,
  seed: 0x5eed1234,
  /** Çekirdek kenarı (tile); dünya merkezinde. */
  coreSize: 3,
  oreFields: 44,
  oreFieldRadius: { min: 3, max: 8 },
  /** Çekirdeğin çevresinde cevher çıkmayan yarıçap. */
  coreClearRadius: 12,
} as const;

export const SIM = {
  /** Sunucu simülasyon hızı. */
  tickRate: 30,
  stepMs: 1000 / 30,
} as const;

/** Konveyör: pozisyon 0..LENGTH-1 aralığında sabit noktalıdır. */
export const BELT = {
  length: 1024,
  slots: 4,
  /** Aynı bantta iki eşya arasındaki en küçük uzaklık. */
  spacing: 256,
  /** Adım başına ilerleme: 30 Hz'de saniyede yaklaşık 4,1 tile. */
  speed: 140,
  /** Yandan giren eşyanın yerleştiği konum. */
  sidePosition: 512,
} as const;

export interface BuildingSpec {
  readonly hp: number;
  /** Maliyet; yoksa ücretsiz. */
  readonly cost: Readonly<Partial<Record<'ore' | 'plate', number>>>;
}

export const BUILDING: Readonly<Record<Exclude<Kind, 0>, BuildingSpec>> = {
  [KIND.conveyor]: { hp: 45, cost: { ore: 1 } },
  [KIND.drill]: { hp: 90, cost: { ore: 12 } },
  [KIND.smelter]: { hp: 110, cost: { ore: 20 } },
  [KIND.core]: { hp: 2000, cost: {} },
  [KIND.turret]: { hp: 150, cost: { plate: 12, ore: 10 } },
  [KIND.wall]: { hp: 280, cost: { plate: 4 } },
};

/** Maliyetin bu oranı silinen binada iade edilir. */
export const REFUND_PERCENT = 50;

export const MACHINES = {
  /** Matkap: bu kadar adımda bir eşya. */
  drillPeriod: 20,
  /** İşleyici: 2 cevher → 1 levha, bu kadar adımda. */
  smelterPeriod: 30,
  smelterInput: 2,
  smelterBuffer: 8,
  smelterOutputBuffer: 4,
  turret: {
    range: 9,
    damage: 6,
    cooldown: 6,
    /** Bir levhanın verdiği atış sayısı ve depo tavanı. */
    shotsPerPlate: 12,
    ammoCap: 252,
  },
} as const;

export interface UnitSpec {
  readonly hp: number;
  /** Adım başına tile. */
  readonly speed: number;
  /** Bulunduğu veya önündeki binaya adım başına hasar. */
  readonly damage: number;
  /** Çekirdeğe ulaşınca çekirdeğe vurduğu tek seferlik hasar. */
  readonly coreDamage: number;
}

export const UNIT: Readonly<Record<'crawler' | 'brute', UnitSpec>> = {
  crawler: { hp: 40, speed: 2.2 / 30, damage: 1, coreDamage: 30 },
  brute: { hp: 160, speed: 1.3 / 30, damage: 3, coreDamage: 90 },
};
export const UNIT_KIND = { crawler: 1, brute: 2 } as const;

export const UNIT_POOL = 2048;

/**
 * Çekirdek, yarıçapındaki taretleri bant gerektirmeden besler: lojistik sadeleştirmesi.
 * Bant ile beslemek de çalışır (`offer`); bu kural savunmayı otomatik ayakta tutar.
 */
export const SUPPLY = { radius: 24, period: 15 } as const;

export const WAVES = {
  /** İlk dalgaya ve dalgalar arasına düşen adım. */
  period: 900,
  firstDelay: 600,
  baseCount: 8,
  perWave: 3,
  bruteEvery: 5,
  /** Çekirdek yıkılınca kalan kaynak yüzdesi. */
  defeatKeepPercent: 50,
} as const;

export const START_RESOURCES = { ore: 300, plate: 40 } as const;

/** Yol alanı en çok bu aralıkta yeniden hesaplanır (katı bina değişimi sonrası). */
export const FLOW_RECOMPUTE_MIN_TICKS = 15;

/** Oyuncu sınırları. Komutlar dünya genelinde geçerlidir: oyuncunun konumu ya da menzili yoktur. */
export const PLAYER = {
  commandsPerSecond: 20,
  maxPlayers: 12,
} as const;

/** Ağ ayarları (sunucu ve istemci ortak). */
export const NET = {
  /** Dinamik varlık paketinin her kaç simülasyon adımında bir gönderileceği. */
  dynamicsEvery: 2,
  /** Konveyör içeriği anlık görüntüsünün aralığı (adım). */
  beltsEvery: 6,
  /** Kilit adımlı eşitlemede paket aralığı (adım): 30 Hz'de 15 paket/sn. */
  syncEvery: 2,
  /** Durum karmasının pakete eklendiği aralık (adım): 5 saniye. */
  hashEvery: 150,
  /** Ortak durum (HUD) aralığı (adım). */
  hudEvery: 15,
  /** İstemcinin isteyebileceği en büyük ilgi alanı (chunk). */
  maxAoiChunks: { x: 8, y: 6 },
  /** Soket tamponu bu bayttan büyükse dinamik paket atlanır. */
  backpressureBytes: 256 * 1024,
  /** Sunucu anlık görüntü aralığı (adım) ve karma kaydı aralığı. */
  snapshotEvery: 30 * 30,
  heartbeatEvery: 30,
  maxMessagesPerSecond: 120,
  reconnectSeconds: 20,
} as const;
