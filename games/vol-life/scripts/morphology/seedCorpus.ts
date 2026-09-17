import { readFileSync } from 'node:fs';
import { createSimRandom } from '@/runtime/sim/rng';

/**
 * `corpus-v1` — uzun ufuk koşularının ve audition'ın ORTAK tohum kümesi (F7).
 *
 * Korpus BİR KEZ üretilir ve veri olarak commit'lenir. Sonradan düzenlenmesi
 * yasaktır: tohum kümesini koşu sonrasında değiştirmek, kötü sonuç veren
 * tohumları listeden düşürme yoludur (seed reroll). Dosya bu üreticiden
 * yeniden üretilebilir olduğu için testte birebir karşılaştırılır.
 */
export const CORPUS_V1_ID = 'corpus-v1';
export const CORPUS_V1_GENERATOR_SEED = 0x5eed_c0de >>> 0;
export const CORPUS_V1_SIZE = 32;

export interface SeedCorpus {
  readonly id: string;
  readonly generatorSeed: number;
  readonly seeds: readonly number[];
}

export function buildSeedCorpus(
  id = CORPUS_V1_ID,
  generatorSeed = CORPUS_V1_GENERATOR_SEED,
  size = CORPUS_V1_SIZE,
): SeedCorpus {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`Korpus boyutu geçersiz: ${size}`);
  const random = createSimRandom(generatorSeed);
  const seeds: number[] = [];
  const seen = new Set<number>();
  // Çakışan tohum ATLANIR, yeniden üretilir: 32 tohumun hepsi farklı dünyadır.
  while (seeds.length < size) {
    const seed = Math.floor(random.next() * 0x1_0000_0000) >>> 0;
    if (seen.has(seed)) continue;
    seen.add(seed);
    seeds.push(seed);
  }
  return { id, generatorSeed, seeds };
}

export function validateSeedCorpus(corpus: SeedCorpus, minimumSize = CORPUS_V1_SIZE): void {
  if (!corpus.id) throw new RangeError('Korpus kimliği boş olamaz.');
  if (corpus.seeds.length < minimumSize) {
    throw new RangeError(`${corpus.id}: en az ${minimumSize} tohum gerekir.`);
  }
  if (new Set(corpus.seeds).size !== corpus.seeds.length) {
    throw new RangeError(`${corpus.id}: tohumlar benzersiz olmalı.`);
  }
  for (const seed of corpus.seeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(`${corpus.id}: uint32 olmayan tohum: ${seed}`);
    }
  }
}

/** Korpus dosyası ARAŞTIRMANIN girdisidir; okunurken de doğrulanır. */
export function readSeedCorpus(path: string, minimumSize = CORPUS_V1_SIZE): SeedCorpus {
  const corpus = JSON.parse(readFileSync(path, 'utf8')) as SeedCorpus;
  validateSeedCorpus(corpus, minimumSize);
  return corpus;
}
