import type { HellBaseStats } from '@/config/stats';

/**
 * Düşman arketipi — davranış ailesini belirler.
 *
 * `elite` ve `boss` doğrudan spawn havuzuna girmez (`spawnWeight: 0`);
 * `WaveManager` onları özel dalgalarda çağırır. Elite, rusher ve swarmer
 * davranışlarını KOMPOZE eder — bu yüzden davranış mantığı arketipe değil,
 * ayrı ve yeniden çağrılabilir fonksiyonlara bağlıdır
 * (bkz. `runtime/entity/behaviors/`).
 */
export type EnemyArchetype = 'base' | 'rusher' | 'swarmer' | 'elite' | 'boss';

/** Rusher davranış parametreleri — bir çizgi üzerinde hesaplı atılım. */
export interface RusherParams {
  /** Bu mesafenin altında atılım hazırlığı başlar (piksel). */
  triggerDistance: number;
  /** Atılım öncesi telegraf/bekleme süresi (ms) — oyuncuya tepki şansı verir. */
  windupMs: number;
  /** Atılım hızı = `speed` stat'ı x bu çarpan. */
  dashSpeedMultiplier: number;
  /** Atılımın sürdüğü süre (ms). */
  dashDurationMs: number;
  /** Atılım sonrası hareketsiz kalma süresi (ms) — açık pencere. */
  recoverMs: number;
  /** İki atılım arasındaki minimum bekleme (ms). */
  cooldownMs: number;
}

/** Swarmer davranış parametreleri — minion doğurur, mesafesini korur. */
export interface SwarmerParams {
  /** Doğurulacak minion'un katalog kimliği. */
  minionId: string;
  /** Doğurma denemeleri arasındaki süre (ms). */
  spawnIntervalMs: number;
  /** Aynı anda hayatta tutabileceği maksimum minion sayısı. */
  maxMinions: number;
  /** Her doğurmada kaç minion çıkar. */
  spawnCount: number;
  /** Minion'ların ebeveyn etrafında doğduğu yarıçap (piksel). */
  spawnRadius: number;
  /** Oyuncuya bu mesafeden fazla yaklaşmaz (piksel). */
  standoffDistance: number;
}

/**
 * Bir düşman türünün veri tanımı.
 *
 * `enemyConfig` paylaşılan davranış/görünüm sabitlerini (separation, can barı,
 * spawn kenarları) tutmaya devam eder; burada yalnızca TÜRE ÖZEL değerler yer alır.
 */
export interface EnemyDefinition {
  /** Katalog anahtarı ile aynı olmalıdır. */
  id: string;
  archetype: EnemyArchetype;
  /** Teşhis/log amaçlı ad — oyuncuya gösterilen bir metin değildir (i18n gerekmez). */
  displayName: string;
  /** Kısa açıklama — katalog okunabilirliği için. */
  description: string;
  /** Arama etiketleri. */
  tags: readonly string[];
  /**
   * Taban stat'lar. Düşman bağlamında:
   * `damage` = temas hasarı, `speed` = hareket hızı (piksel/sn),
   * `health` = maksimum can, `fireRate` = temas hasarı bekleme süresi (ms).
   */
  baseStats: HellBaseStats;
  /** Çarpışma/çizim yarıçapı (piksel). */
  radius: number;
  /** Gövde rengi (0xRRGGBB). */
  color: number;
  /** Kenar rengi (0xRRGGBB). */
  strokeColor: number;
  /** Öldürülünce verilen temel skor (zorluk çarpanı ayrıca uygulanır). */
  scoreValue: number;
  /** Öldürülünce doğrudan sayaca eklenen Spark. */
  sparkReward: number;
  /** Öldürülünce yere düşen Flux pickup miktarı. 0 = düşmez. */
  fluxReward: number;
  /** Bu düşmanın dalga havuzuna girdiği en erken dalga (1 tabanlı). */
  minWave: number;
  /** Dalga havuzunda seçilme ağırlığı. 0 = doğrudan spawn edilmez (minion). */
  spawnWeight: number;
  /** Arketip 'rusher' ise zorunlu. */
  rusher?: RusherParams;
  /** Arketip 'swarmer' ise zorunlu. */
  swarmer?: SwarmerParams;
}

/** `findEnemies` sorgu alanları. */
export interface FindEnemiesQuery {
  archetype?: EnemyArchetype;
  tags?: string[];
  /** Verilirse yalnızca bu dalgada havuzda olan tanımlar döner. */
  wave?: number;
  /** true ise yalnızca doğrudan spawn edilebilenler (spawnWeight > 0). */
  spawnableOnly?: boolean;
}
