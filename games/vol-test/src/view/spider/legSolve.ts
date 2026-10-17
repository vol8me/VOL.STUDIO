/**
 * Yükseltilmiş bacağın düşey düzlemdeki çözümü. Bacak, kalçayla ayağı birleştiren düşey düzlemde iki
 * kemiktir: `u` yer boyunca kalçadan ayağa doğru, `v` zeminden yüksekliktir. Diz her zaman yukarı
 * bükülür (örümcek bacağı). Yukarıdan bakışta yalnız `u` görünür; `v` perspektif ölçeği ve gölge
 * kaymasına dönüşür. Düzlemsel çözüm olduğundan kemik boyları korunur: ayak kalkarken diz yükselir,
 * ayak inerken tibia dikleşip izdüşümde kısalır.
 */
export interface LegSolution {
  /** Dizin kalçadan yer boyunca uzaklığı ve zeminden yüksekliği. */
  kneeU: number;
  kneeHeight: number;
  /** Ayağın kalçadan yer boyunca (kelepçelenmiş) uzaklığı. */
  footU: number;
}

/** Kemik boyları verilince, bu yükseklik farkında yatay erişimin üst sınırı. */
export function maxFootDistance(
  hipHeight: number,
  footHeight: number,
  femur: number,
  tibia: number,
): number {
  const rise = footHeight - hipHeight;
  const reach = femur + tibia - 0.5;
  return Math.sqrt(Math.max(reach * reach - rise * rise, 0));
}

/**
 * `distance` kalçadan ayağa yatay uzaklıktır. Çok uzaksa ayak erişim sınırına çekilir, çok yakınsa
 * kemiklerin katlanabileceği en kısa mesafeye itilir; diz her durumda geçerli bir noktadadır.
 */
export function solveLeg(
  distance: number,
  hipHeight: number,
  footHeight: number,
  femur: number,
  tibia: number,
  out: LegSolution,
): LegSolution {
  const rise = footHeight - hipHeight;
  const horizontal = Math.min(
    Math.max(distance, 0),
    maxFootDistance(hipHeight, footHeight, femur, tibia),
  );
  const chord = Math.max(Math.hypot(horizontal, rise), Math.abs(femur - tibia) + 0.5);
  // Kosinüs kuralı: dizin kalça-ayak doğrusu üzerindeki izdüşümü `along`, doğrudan uzaklığı `lift`.
  const along = (femur * femur - tibia * tibia + chord * chord) / (2 * chord);
  const lift = Math.sqrt(Math.max(femur * femur - along * along, 0));
  const dirU = chord > 1e-6 ? horizontal / chord : 1;
  const dirV = chord > 1e-6 ? rise / chord : 0;
  out.kneeU = along * dirU - lift * dirV;
  out.kneeHeight = hipHeight + along * dirV + lift * dirU;
  out.footU = horizontal;
  return out;
}
