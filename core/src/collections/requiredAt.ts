/**
 * Algoritmanın dolu kabul ettiği hücreyi okur. TypeScript döngü/sınır ilişkisini
 * izleyemediğinde kullanılan bu iç invariant, seyrek veya taşan indisi sessizce
 * `undefined` ile sürdürmez. Eleman türü `undefined` içeriyorsa dolu hücredeki
 * `undefined` geçerlidir; boş hücreyle karıştırılmaz.
 */
export function requiredAt<T>(values: ArrayLike<T>, index: number): T {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= values.length ||
    !Object.hasOwn(values, index)
  ) {
    throw new RangeError('Dolu koleksiyon hücresi bekleniyordu');
  }
  return values[index] as T;
}

/**
 * İç sayısal tamponun sıcak yolu: `undefined` sayı olamayacağı için eksik
 * hücreyi değer okuması ayırır. İndisler algoritmanın tamsayı döngüsünden
 * gelir; dışarıdan verilen indisler `requiredAt` ile doğrulanır.
 */
export function requiredNumberAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new RangeError('Sayısal tampon hücresi bekleniyordu');
  return value;
}
