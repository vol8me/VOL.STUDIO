/**
 * Derlenmiş alan biçimi.
 *
 * Belge (§2) fonksiyon taşımaz — bu D10'un kuralıdır ve JSON'un gözden
 * geçirilebilirliği buna bağlıdır. Ama belge bir kez DERLENİR: her düğüm
 * kendi kapanışına (closure) çevrilir ve piksel başına yalnızca çağrı kalır.
 *
 * Derleme, düğüm yolundan tohum türetmenin (D5) de tek yeridir: yol dizgisi
 * piksel başına değil, belge başına bir kez işlenir.
 */

/** Birim uzaydaki bir noktada alanın değeri. */
export type FieldFn = (x: number, y: number) => number;

/**
 * Beşinci derece yumuşatma eğrisi — kafes gürültüsünün enterpolasyonu için.
 *
 * Üçüncü derece (`3t²−2t³`) yalnızca birinci türevi sıfırlar; kafes
 * sınırlarında ikinci türev sıçraması kalır ve gürültüden normal
 * türetildiğinde (Tur 3) ızgara çizgileri olarak görünür. Beşinci derece
 * ikinci türevi de sıfırlar.
 */
export function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
