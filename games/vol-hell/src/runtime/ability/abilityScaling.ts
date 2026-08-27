import { abilityProgressionConfig } from '@/config/abilities';
import type { HellStatBlock } from '@/config/stats';
import { nonNegativeFinite } from '@/runtime/utils/numeric';

/**
 * Oyuncu stat'ının tabana göre oranını döndürür.
 *
 * Sıfır geçerli bir sonuçtur: hasar bir takasla sıfırlanırsa ability de
 * sıfır hasar vermelidir. Yalnızca bozuk/eksik taban değerinde güvenli olarak
 * 1'e dönülür; böylece UI veya test doubles ability'yi çökertmez.
 */
function getStatRatio(value: number, base: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(base) || base <= 0) return 1;
  return Math.max(0, value / base);
}

function blendWithBase(ratio: number, influence: number): number {
  const safeInfluence = Math.max(0, Math.min(1, nonNegativeFinite(influence, 1)));
  return 1 + (ratio - 1) * safeInfluence;
}

/** Sabit ability hasarını oyuncunun güncel hasar statına taşır. */
export function scaleAbilityDamage(baseDamage: number, playerStats: HellStatBlock): number {
  const ratio = getStatRatio(playerStats.getValue('damage'), playerStats.getBase('damage'));
  return nonNegativeFinite(
    nonNegativeFinite(baseDamage) *
      blendWithBase(ratio, abilityProgressionConfig.damageStatInfluence),
  );
}

/** Kule maksimum canını oyuncunun güncel maksimum canına taşır. */
export function scaleTurretHealth(baseHealth: number, playerStats: HellStatBlock): number {
  const ratio = getStatRatio(playerStats.getValue('health'), playerStats.getBase('health'));
  const effectiveRatio = Math.max(
    abilityProgressionConfig.minTurretHealthRatio,
    blendWithBase(ratio, abilityProgressionConfig.turretHealthStatInfluence),
  );
  return nonNegativeFinite(nonNegativeFinite(baseHealth) * effectiveRatio);
}

/** Kule iç atış beklemesini oyuncunun ateş temposuyla aynı yöne taşır. */
export function scaleTurretFireInterval(
  baseIntervalMs: number,
  playerStats: HellStatBlock,
): number {
  const ratio = getStatRatio(playerStats.getValue('fireRate'), playerStats.getBase('fireRate'));
  const scaled = nonNegativeFinite(
    nonNegativeFinite(baseIntervalMs) *
      blendWithBase(ratio, abilityProgressionConfig.turretFireRateInfluence),
  );
  return Math.max(abilityProgressionConfig.minTurretFireIntervalMs, scaled);
}
