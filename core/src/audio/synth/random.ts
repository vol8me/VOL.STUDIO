/**
 * Geriye dönük uyumluluk shim'i. Gerçek implementasyon `core/src/random/random.ts`'e
 * taşındı — Random genel bir runtime capability'dir, yalnızca ses sentezinde
 * doğmuştur. Bu dosya, ses motoru içindeki göreli importları (`./random`,
 * `../random`) kırmamak için re-export olarak bırakıldı. Yeni kod
 * `@volstudio/core`'dan (`createRandom`) veya doğrudan
 * `core/src/random/random.ts`'ten import etmeli.
 */
export { createRandom, seedFromString, DEFAULT_SEED, type Random } from '../../random/random';
