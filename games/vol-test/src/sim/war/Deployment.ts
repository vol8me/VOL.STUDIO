import { wrapAngle } from '@volstudio/core/math';
import { WAR } from '@/config/war';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Doğma noktası: konum ve dünya merkezine bakan gövde yönü. */
export interface SpawnPoint extends Point {
  readonly hull: number;
}

interface Extent {
  readonly width: number;
  readonly height: number;
}

/** Cephenin üssünün merkezi. */
export function baseCenter(world: Extent, faction: number): Point {
  const base = WAR.bases[faction];
  return { x: base.x * world.width, y: base.y * world.height };
}

/**
 * Üssün çevresindeki doğma adayları: altın açıyla dağıtılmış noktalar iç ve dış halkayı dönüşümlü
 * kullanır, bu yüzden komşu iki aday araç gövdesinden uzaktır. Gövde dünya merkezine bakar.
 */
export function spawnCandidates(world: Extent, faction: number): SpawnPoint[] {
  const base = WAR.bases[faction];
  const center = baseCenter(world, faction);
  const heading = Math.atan2(world.height / 2 - center.y, world.width / 2 - center.x);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const count = WAR.spawn.candidates;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * golden;
    // Karekök, noktaları halka içinde eşit alanlı dağıtır.
    const radius = base.radius * (0.3 + 0.7 * Math.sqrt((index + 0.5) / count));
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
      hull: wrapAngle(heading),
    };
  });
}

/**
 * Tehditlerden en uzak adayı seçer (en küçük uzaklığı en büyük olan). Uzaklık `clearance` ile
 * kırpılır: yeterince boş olan adaylar eşit sayılır ve `salt` ile döndürülmüş sıradaki ilki
 * seçilir, böylece art arda doğanlar aynı noktaya yığılmaz. Karar aynı girdide hep aynıdır.
 */
export function chooseSpawn(
  candidates: readonly SpawnPoint[],
  threats: readonly Point[],
  salt = 0,
  clearance: number = WAR.spawn.clearance,
): SpawnPoint {
  if (candidates.length === 0) throw new RangeError('Doğma adayı listesi boş olamaz.');
  let best = candidates[0];
  let bestGap = -1;
  for (let step = 0; step < candidates.length; step++) {
    const candidate = candidates[(step + Math.abs(Math.trunc(salt))) % candidates.length];
    let gap = clearance;
    for (const threat of threats)
      gap = Math.min(gap, Math.hypot(candidate.x - threat.x, candidate.y - threat.y));
    if (gap > bestGap) {
      bestGap = gap;
      best = candidate;
    }
  }
  return best;
}
