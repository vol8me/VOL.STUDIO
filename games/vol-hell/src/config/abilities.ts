/**
 * Ability tanımları — Q/E slotlarına atanabilen aktif yetenekler.
 *
 * Dört TEMEL MEKANİK var (kule, zincir yıldırım, ateş alanı, çoklu mermi);
 * her mekaniğin kendi bağımsız component'i `runtime/ability/` altında.
 * Katalogdaki varyantlar aynı mekaniğin farklı güç/parametre kurulumlarıdır
 * ve kart sisteminde AYRI kartlar olarak yer alırlar (bkz. `CARD_CATALOG`).
 *
 * Cooldown'lar sabittir (mana/kaynak havuzu yok); oyuncunun `fireRate` stat'ı
 * bunları oransal olarak kısaltır — bkz. `Ability.getCooldownMs()`.
 */

/** Ability'nin hangi mekaniği çalıştırdığı. */
export type AbilityKind = 'turret' | 'chainLightning' | 'fireZone' | 'multiShot';

/** Kule parametreleri. */
export interface TurretParams {
  /** Atış başına hasar. */
  damage: number;
  /** Kulenin canı — düşmanlar temasla yıpratır. */
  health: number;
  /** Hedef arama menzili (piksel). */
  rangePx: number;
  /** Atışlar arası bekleme (ms). */
  fireIntervalMs: number;
  /** Çizim yarıçapı (piksel). */
  radius: number;
  color: number;
  strokeColor: number;
}

/** Zincir yıldırım parametreleri. */
export interface ChainLightningParams {
  /** Her sıçramada verilen hasar — sıçradıkça AZALMAZ. */
  damage: number;
  /** Taban sıçrama sayısı (ilk hedef dahil değil). Kartlarla artırılabilir. */
  bounces: number;
  /** İlk hedefin aranacağı menzil (oyuncudan, piksel). */
  firstRangePx: number;
  /** Sonraki hedefin aranacağı menzil (son vurulandan, piksel). */
  hopRangePx: number;
  /** Sıçramalar arası süre (ms) — zincir gözle takip edilebilir olsun. */
  hopIntervalMs: number;
}

/** Ateş alanı parametreleri. */
export interface FireZoneParams {
  /** Alan yarıçapı (piksel). */
  radius: number;
  /** Her tick'te alandaki her düşmana verilen hasar. */
  damagePerTick: number;
  /** Hasar tick aralığı (ms). */
  tickMs: number;
  /** Alanın sahnede kalma süresi (ms). */
  durationMs: number;
  color: number;
}

/** Çoklu mermi parametreleri. */
export interface MultiShotParams {
  /** Tek atışta çıkan mermi sayısı. */
  projectiles: number;
  /** Yelpazenin toplam açısı (derece). */
  spreadDeg: number;
  /** Mermi hasarının oyuncu hasarına oranı — çok mermi, mermi başına az hasar. */
  damageScale: number;
}

export interface AbilityDefinition {
  /** Katalog anahtarı ile aynı olmalıdır. */
  id: string;
  kind: AbilityKind;
  /** Kart UI'ında ve slot göstergesinde kullanılan ad. */
  displayName: string;
  /** Aktivasyonlar arası bekleme (ms). */
  cooldownMs: number;
  turret?: TurretParams;
  chain?: ChainLightningParams;
  fire?: FireZoneParams;
  multiShot?: MultiShotParams;
}

/** Cooldown'un inebileceği mutlak alt sınır (ms) — stat modifier'ları sıfıra indiremesin. */
export const MIN_ABILITY_COOLDOWN_MS = 250;

/**
 * Kulenin görsel/his parametreleri.
 *
 * Kule önce yalnızca bir daireydi ve hitscan vuruyordu: ateş ettiği
 * görülmüyor, nereye baktığı bilinmiyor, menzili tahmin ediliyordu. Namlu,
 * geri tepme, gerçek mermi ve menzil halkası bu boşlukları kapatır.
 */
export const turretVisualConfig = {
  /** Namlu uzunluğu = gövde yarıçapı x bu oran. */
  barrelLengthRatio: 1.7,
  /** Namlu kalınlığı (piksel). */
  barrelWidthPx: 5,
  /** Atış anında namlunun geri çekildiği mesafe (piksel). */
  recoilPx: 5,
  /** Geri tepmenin sönümlenme süresi (ms) — kısa ve keskin. */
  recoilRecoverMs: 110,
  /** Kurulum animasyonunun süresi (ms). */
  spawnDurationMs: 260,
  /** Kurulumda gövdenin başladığı ölçek. */
  spawnScale: 1.6,
  /** Menzil halkasının normal saydamlığı — dikkat dağıtmayacak kadar soluk. */
  rangeRingAlpha: 0.12,
  /** Kurulum anında halkanın saydamlığı — menzil bir anlığına net görünür. */
  rangeRingSpawnAlpha: 0.55,
  /** Kule mermisinin yarıçapı (piksel). */
  shotRadius: 3.5,
  /** Kule mermisinin hızı (piksel/saniye). */
  shotSpeed: 620,
  /** Mermi hedefini kaybederse bu süre sonunda söner (ms). */
  shotLifetimeMs: 1200,
  /** Kule mermisinin rengi (0xRRGGBB). */
  shotColor: 0xbbffee,
} as const;

/**
 * Ateş alanının görsel parametreleri — alan tek düz daire olduğunda "ucuz"
 * duruyordu; nabız, sürekli kıvılcım ve nefes alan halka onu yaşayan bir
 * tehlike alanına çevirir.
 */
export const fireZoneVisualConfig = {
  /** Dolgunun taban saydamlığı. */
  fillAlpha: 0.18,
  /** Nabızla eklenen ek saydamlık. */
  fillPulseAlpha: 0.14,
  /** Bir nabız döngüsünün süresi (ms). */
  pulsePeriodMs: 900,
  /** Dış halkanın kalınlığı (piksel). */
  ringWidthPx: 2,
  /** Halkanın nabızla büyüme oranı. */
  ringPulseScale: 0.04,
  /** Kalan sürenin bu oranın altında sönümlenme başlar. */
  fadeStartRatio: 0.28,
  /** Kıvılcım çıkış aralığı (ms) — hasar tick'inden bağımsız, sürekli. */
  emberIntervalMs: 140,
} as const;

/** Zincir yıldırımın görsel parametreleri. */
export const chainVisualConfig = {
  /** Yay kolunun ekranda kalma süresi (ms). */
  arcLifetimeMs: 260,
  /** Ana kolun kalınlığı (piksel). */
  coreWidthPx: 2.5,
  /** Etrafındaki parıltının kalınlığı (piksel). */
  glowWidthPx: 7,
  /** Kolun rengi (0xRRGGBB). */
  color: 0x99ddff,
  /** Parıltının rengi (0xRRGGBB). */
  glowColor: 0x3366ff,
  /** Kolun kırılma noktası sayısı — düz çizgi yerine zikzak. */
  segments: 5,
  /** Zikzak sapmasının maksimum genliği (piksel). */
  jitterPx: 11,
} as const;

export const ABILITY_CATALOG: Record<string, AbilityDefinition> = {
  // --- Kule ailesi ---------------------------------------------------------
  turret: {
    id: 'turret',
    kind: 'turret',
    displayName: 'Kule',
    cooldownMs: 9000,
    turret: {
      damage: 12,
      health: 60,
      rangePx: 240,
      fireIntervalMs: 700,
      radius: 11,
      color: 0x44ddaa,
      strokeColor: 0x88ffdd,
    },
  },
  turretRapid: {
    id: 'turretRapid',
    kind: 'turret',
    displayName: 'Seri Kule',
    cooldownMs: 10000,
    turret: {
      damage: 9,
      health: 70,
      rangePx: 220,
      fireIntervalMs: 280,
      radius: 12,
      color: 0x44ccff,
      strokeColor: 0x99e6ff,
    },
  },
  turretSiege: {
    id: 'turretSiege',
    kind: 'turret',
    displayName: 'Kuşatma Kulesi',
    cooldownMs: 14000,
    turret: {
      damage: 40,
      health: 110,
      rangePx: 340,
      fireIntervalMs: 1100,
      radius: 14,
      color: 0xffcc44,
      strokeColor: 0xffe699,
    },
  },

  // --- Zincir yıldırım ailesi ---------------------------------------------
  chainLightning: {
    id: 'chainLightning',
    kind: 'chainLightning',
    displayName: 'Zincir Yıldırım',
    cooldownMs: 5000,
    chain: {
      damage: 22,
      bounces: 2,
      firstRangePx: 300,
      hopRangePx: 180,
      hopIntervalMs: 70,
    },
  },
  chainSurge: {
    id: 'chainSurge',
    kind: 'chainLightning',
    displayName: 'Çifte Zincir',
    cooldownMs: 6000,
    chain: {
      damage: 30,
      bounces: 4,
      firstRangePx: 340,
      hopRangePx: 200,
      hopIntervalMs: 60,
    },
  },
  chainStorm: {
    id: 'chainStorm',
    kind: 'chainLightning',
    displayName: 'Yıldırım Fırtınası',
    cooldownMs: 9000,
    chain: {
      damage: 38,
      bounces: 7,
      firstRangePx: 380,
      hopRangePx: 240,
      hopIntervalMs: 55,
    },
  },

  // --- Ateş ailesi ---------------------------------------------------------
  fireZone: {
    id: 'fireZone',
    kind: 'fireZone',
    displayName: 'Ateş Çemberi',
    cooldownMs: 7000,
    fire: {
      radius: 78,
      damagePerTick: 6,
      tickMs: 320,
      durationMs: 3200,
      color: 0xff7722,
    },
  },
  emberField: {
    id: 'emberField',
    kind: 'fireZone',
    displayName: 'Kor Tarlası',
    cooldownMs: 9000,
    fire: {
      radius: 108,
      damagePerTick: 8,
      tickMs: 300,
      durationMs: 4600,
      color: 0xff5533,
    },
  },
  inferno: {
    id: 'inferno',
    kind: 'fireZone',
    displayName: 'Cehennem',
    cooldownMs: 12000,
    fire: {
      radius: 130,
      damagePerTick: 15,
      tickMs: 260,
      durationMs: 5200,
      color: 0xff3311,
    },
  },

  // --- Çoklu mermi ailesi --------------------------------------------------
  multiShot: {
    id: 'multiShot',
    kind: 'multiShot',
    displayName: 'Üçlü Atış',
    cooldownMs: 3500,
    multiShot: { projectiles: 3, spreadDeg: 26, damageScale: 0.8 },
  },
  scatterShot: {
    id: 'scatterShot',
    kind: 'multiShot',
    displayName: 'Saçma Atış',
    cooldownMs: 5000,
    multiShot: { projectiles: 5, spreadDeg: 54, damageScale: 0.75 },
  },
  bulletStorm: {
    id: 'bulletStorm',
    kind: 'multiShot',
    displayName: 'Mermi Fırtınası',
    cooldownMs: 8000,
    multiShot: { projectiles: 9, spreadDeg: 360, damageScale: 0.7 },
  },
};

/** Tanımı kimliğe göre getirir; bilinmeyen kimlikte hata fırlatır. */
export function getAbilityDefinition(id: string): AbilityDefinition {
  const definition = ABILITY_CATALOG[id];
  if (!definition) {
    throw new Error(`[ABILITY_CATALOG] Bilinmeyen ability kimliği: ${id}`);
  }
  return definition;
}
