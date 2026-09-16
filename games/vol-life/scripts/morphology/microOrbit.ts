import { memberChurn } from './clusterShape';

/**
 * Lokal micro-orbit dedektörü (E7).
 *
 * Aranan şey KÖTÜ DÖNGÜDÜR: küçük, kapalı yörüngeli, aynı mesafede duran ve üye
 * değiştirmeyen bir halka. Böyle bir yapı "canlı" görünür ama hiçbir şey
 * yapmaz — morfoloji araması onu yapı sanmamalı.
 *
 * İYİ DÖNÜŞ işaretlenmez: büyük, deforme olan, üye değiştiren ya da yer
 * değiştiren bir yapı dönüyor olsa bile gerçek bir süreçtir.
 */

export interface MicroOrbitSample {
  readonly clusterId: number;
  readonly size: number;
  /** Üyelerin merkez etrafında tamamladığı ortalama tur sayısı. */
  readonly turns: number;
  /** Açısal hız işaretinin kalıcılığı, [0, 1]; 1 = hep aynı yönde. */
  readonly angularCoherence: number;
  /** Yarıçapın değişim katsayısı (σ/ortalama); küçükse yörünge "aynı mesafede". */
  readonly radiusVariation: number;
  /** Merkezin kendi yarıçapına oranla yer değiştirmesi; büyükse yapı taşınıyor. */
  readonly centroidDrift: number;
  /** Üyelik değişim oranı; kötü döngüde ~0. */
  readonly membershipExchangeRate: number;
  readonly isMicroOrbit: boolean;
}

export interface MicroOrbitReport {
  /** Micro-orbit sayılan kümelerdeki maddenin toplam aktif maddeye oranı. */
  readonly persistentMicroOrbitFraction: number;
  /** İşaretli kümelerin ortalama yaşı (tick). */
  readonly microOrbitLifetime: number;
  readonly samples: readonly MicroOrbitSample[];
}

export interface MicroOrbitConfig {
  /** Bu boyuttan büyük küme "küçük döngü" sayılmaz — büyük yapı iyi dönüştür. */
  readonly maxClusterSize: number;
  /** Bu tur sayısının altında kapalı yörünge sayılmaz. */
  readonly minTurns: number;
  readonly minAngularCoherence: number;
  /** Yarıçap bundan fazla oynuyorsa yapı deforme oluyordur. */
  readonly maxRadiusVariation: number;
  /** Merkez bundan fazla kayıyorsa yapı yer değiştiriyordur. */
  readonly maxCentroidDrift: number;
  /** Üyelik bundan hızlı değişiyorsa döngü kapalı değildir. */
  readonly maxMembershipExchange: number;
}

/**
 * Eşikler §8.4'te ön-kayıtlı DEĞİLDİR (orada faz eşikleri var, micro-orbit
 * parametreleri yok). Değerler kümeleme ölçülerinden türer: `maxClusterSize`
 * kümeleme tabanının (minClusterSize 4) iki katıdır — daha büyük bir halka
 * artık "lokal döngü" değil yapıdır. Bir aday değerlendirmesinden sonra
 * değişirlerse o ana kadarki micro-orbit sonuçları geçersizdir.
 */
export const defaultMicroOrbitConfig: MicroOrbitConfig = {
  maxClusterSize: 8,
  minTurns: 1,
  minAngularCoherence: 0.8,
  maxRadiusVariation: 0.25,
  maxCentroidDrift: 0.5,
  maxMembershipExchange: 0.1,
};

export interface MemberTrack {
  readonly id: number;
  /** Örnek başına [x, y]; en az iki örnek gerekir. */
  readonly positions: readonly { readonly x: number; readonly y: number }[];
}

export interface ClusterWindow {
  readonly clusterId: number;
  readonly ageTicks: number;
  readonly tracks: readonly MemberTrack[];
  /** Pencerenin başındaki ve sonundaki üyelik; değişim oranı bundan çıkar. */
  readonly membersAtStart: readonly number[];
  readonly membersAtEnd: readonly number[];
}

export function measureMicroOrbits(
  windows: readonly ClusterWindow[],
  activeCount: number,
  config: MicroOrbitConfig = defaultMicroOrbitConfig,
): MicroOrbitReport {
  const samples = windows.map((window) => measureWindow(window, config));
  const flagged = samples.filter((sample) => sample.isMicroOrbit);
  const orbiting = flagged.reduce((sum, sample) => sum + sample.size, 0);
  const lifetime =
    flagged.length > 0
      ? windows
          .filter((window) => flagged.some((sample) => sample.clusterId === window.clusterId))
          .reduce((sum, window) => sum + window.ageTicks, 0) / flagged.length
      : 0;
  return {
    persistentMicroOrbitFraction: activeCount > 0 ? orbiting / activeCount : 0,
    microOrbitLifetime: lifetime,
    samples,
  };
}

function measureWindow(window: ClusterWindow, config: MicroOrbitConfig): MicroOrbitSample {
  const size = window.membersAtEnd.length;
  const centroids = centroidPath(window.tracks);
  const turnsPerMember: number[] = [];
  const coherencePerMember: number[] = [];
  const radiusVariationPerMember: number[] = [];

  for (const track of window.tracks) {
    if (track.positions.length < 3 || track.positions.length !== centroids.length) continue;
    let wound = 0;
    let positive = 0;
    let steps = 0;
    const radii: number[] = [];
    let previousAngle = Number.NaN;
    for (let index = 0; index < track.positions.length; index++) {
      const dx = track.positions[index].x - centroids[index].x;
      const dy = track.positions[index].y - centroids[index].y;
      radii.push(Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      if (Number.isFinite(previousAngle)) {
        // Sarım: -π/π sıçramasını düzelterek toplam açıyı biriktir.
        let delta = angle - previousAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        wound += delta;
        if (delta > 0) positive++;
        steps++;
      }
      previousAngle = angle;
    }
    if (steps === 0) continue;
    turnsPerMember.push(Math.abs(wound) / (Math.PI * 2));
    // İşaret kalıcılığı: hep aynı yönde dönüyorsa 1, yön değiştiriyorsa 0'a iner.
    coherencePerMember.push(Math.abs(positive / steps - 0.5) * 2);
    radiusVariationPerMember.push(variationCoefficient(radii));
  }

  const turns = mean(turnsPerMember);
  const angularCoherence = mean(coherencePerMember);
  const radiusVariation = mean(radiusVariationPerMember);
  const meanRadius = mean(
    window.tracks.flatMap((track) =>
      track.positions.map((point, index) =>
        index < centroids.length
          ? Math.hypot(point.x - centroids[index].x, point.y - centroids[index].y)
          : 0,
      ),
    ),
  );
  const drift =
    centroids.length >= 2 && meanRadius > 0
      ? Math.hypot(
          centroids[centroids.length - 1].x - centroids[0].x,
          centroids[centroids.length - 1].y - centroids[0].y,
        ) / meanRadius
      : 0;
  const exchange = memberChurn(window.membersAtStart, window.membersAtEnd);

  return {
    clusterId: window.clusterId,
    size,
    turns,
    angularCoherence,
    radiusVariation,
    centroidDrift: drift,
    membershipExchangeRate: exchange,
    isMicroOrbit:
      size > 0 &&
      size <= config.maxClusterSize &&
      turns >= config.minTurns &&
      angularCoherence >= config.minAngularCoherence &&
      radiusVariation <= config.maxRadiusVariation &&
      drift <= config.maxCentroidDrift &&
      exchange <= config.maxMembershipExchange,
  };
}

/** Merkez her örnekte yeniden hesaplanır: yapı taşınırsa açı sarımı bozulmasın. */
function centroidPath(tracks: readonly MemberTrack[]): { x: number; y: number }[] {
  const length = tracks.length > 0 ? tracks[0].positions.length : 0;
  const path: { x: number; y: number }[] = [];
  for (let index = 0; index < length; index++) {
    let x = 0;
    let y = 0;
    let count = 0;
    for (const track of tracks) {
      const point = track.positions[index];
      if (!point) continue;
      x += point.x;
      y += point.y;
      count++;
    }
    path.push(count > 0 ? { x: x / count, y: y / count } : { x: 0, y: 0 });
  }
  return path;
}

function variationCoefficient(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  if (average === 0) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance) / average;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
