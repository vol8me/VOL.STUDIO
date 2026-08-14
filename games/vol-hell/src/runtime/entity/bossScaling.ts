import { StatBlock, type StatBaseValues } from '@volstudio/core';
import { bossConfig } from '@/config/boss';

/** Boss'un spawn anında dondurulan güç profili — test ve HUD bunu okur. */
export interface BossScaling {
  /** Oyuncunun DPS'i taban DPS'in kaç katı. */
  playerPowerRatio: number;
  healthMultiplier: number;
  damageMultiplier: number;
  /** `fireRate` TERS stat: çarpan BÖLEN olarak uygulanır (büyük = daha sık). */
  fireRateMultiplier: number;
}

/**
 * Oyuncunun o anki gücünü boss'un stat'larına oranlar (B2).
 *
 * Neden: sabit bir boss, güçlü bir build karşısında saniyeler içinde eriyor;
 * zayıf bir build karşısındaysa aşılmaz oluyor. Boss'un zorluğu koşunun
 * NEREYE geldiğine bağlı olmalı, saatine değil.
 *
 * Formül:
 * - `powerRatio = (güncel hasar / taban hasar) × (taban fireRate / güncel fireRate)`
 *   yani gerçek DPS oranı — hem hasar hem ateş hızı kartları sayılır.
 *   `fireRate` ters stat olduğu için oran ters çevrilir.
 * - Can çarpanı = `powerRatio ^ 0.85`, [1, 4.5] arasına kelepçelenir.
 *   Üs 1'in ALTINDA: boss güçlü build'i takip eder ama tam yakalamaz —
 *   build kurmak hâlâ ödüllendirici kalsın.
 * - Hasar çarpanı oyuncunun MAX CANINI takip eder (`^0.6`, [1, 2.5]):
 *   can kartları alan oyuncu daha sert vuruş yer.
 * - Ateş hızı çarpanı oyuncunun HAREKET hızını takip eder (`^0.5`, [1, 1.8]):
 *   hızlı oyuncu daha sık saldırıyla baskılanır.
 *
 * Sonuç spawn anında BİR KEZ hesaplanır ve dondurulur; boss dövüşünün
 * ortasında alınan bir kart boss'u güçlendirmez.
 */
export function computeBossScaling(playerStats: StatBlock): BossScaling {
  const damageRatio = safeRatio(playerStats.getValue('damage'), playerStats.getBase('damage'));
  // fireRate ters: küçük değer hızlı demek, bu yüzden taban/güncel.
  const fireRateRatio = safeRatio(
    playerStats.getBase('fireRate'),
    playerStats.getValue('fireRate'),
  );
  const healthRatio = safeRatio(playerStats.getValue('health'), playerStats.getBase('health'));
  const speedRatio = safeRatio(playerStats.getValue('speed'), playerStats.getBase('speed'));

  const playerPowerRatio = damageRatio * fireRateRatio;
  const { scaling } = bossConfig;

  return {
    playerPowerRatio,
    healthMultiplier: clamp(
      Math.pow(playerPowerRatio, scaling.healthPowerExponent),
      scaling.minHealthMultiplier,
      scaling.maxHealthMultiplier,
    ),
    damageMultiplier: clamp(
      Math.pow(healthRatio, scaling.damagePowerExponent),
      scaling.minDamageMultiplier,
      scaling.maxDamageMultiplier,
    ),
    fireRateMultiplier: clamp(
      Math.pow(speedRatio, scaling.fireRatePowerExponent),
      scaling.minFireRateMultiplier,
      scaling.maxFireRateMultiplier,
    ),
  };
}

/**
 * Ölçeklemeyi boss'un taban stat'larına uygular ve SABİT bir `StatBlock` üretir.
 *
 * Değerler burada sayıya dönüştürülür (getter modifier DEĞİL): boss'un
 * stat'ları spawn anında donmalı, oyuncunun sonraki kartları onu
 * güçlendirmemeli.
 */
export function scaleBossStats(baseStats: StatBaseValues, scaling: BossScaling): StatBlock {
  return new StatBlock({
    damage: baseStats.damage * scaling.damageMultiplier,
    speed: baseStats.speed,
    health: baseStats.health * scaling.healthMultiplier,
    // Ters stat: çarpan bölen olarak girer, sonuç DAHA KISA bekleme.
    fireRate: baseStats.fireRate / scaling.fireRateMultiplier,
  });
}

/** Payda sıfır/negatif ya da tanımsızsa oran 1 sayılır — ölçekleme çökmez. */
function safeRatio(value: number, base: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0 || value <= 0) return 1;
  return value / base;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
