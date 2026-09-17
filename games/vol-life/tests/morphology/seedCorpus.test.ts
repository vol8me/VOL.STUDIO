import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CORPUS_V1_ID,
  CORPUS_V1_SIZE,
  buildSeedCorpus,
  readSeedCorpus,
  validateSeedCorpus,
} from '@/../scripts/morphology/seedCorpus';

const CORPUS_PATH = 'benchmarks/fixtures/corpus-v1.json';

/*
 * F7: korpus bir kez üretilir, veri olarak commit'lenir ve SONRADAN
 * DÜZENLENMEZ. Dosyayı üreticiyle karşılaştırmak, kötü sonuç veren tohumların
 * listeden düşürülmesini (seed reroll) imkânsız kılar.
 */
describe('corpus-v1', () => {
  it('diskteki korpus üreticiden birebir çıkar', () => {
    const onDisk = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as ReturnType<
      typeof buildSeedCorpus
    >;
    expect(onDisk).toEqual(buildSeedCorpus());
  });

  it('en az 32 benzersiz uint32 tohum taşır', () => {
    const corpus = readSeedCorpus(CORPUS_PATH);
    expect(corpus.id).toBe(CORPUS_V1_ID);
    expect(corpus.seeds.length).toBeGreaterThanOrEqual(CORPUS_V1_SIZE);
    expect(new Set(corpus.seeds).size).toBe(corpus.seeds.length);
    for (const seed of corpus.seeds) {
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('eksik, yinelenen ya da aralık dışı tohum reddedilir', () => {
    const corpus = buildSeedCorpus();
    expect(() => validateSeedCorpus({ ...corpus, seeds: corpus.seeds.slice(0, 4) })).toThrow(
      RangeError,
    );
    const duplicated = [...corpus.seeds.slice(0, 31), corpus.seeds[0]];
    expect(() => validateSeedCorpus({ ...corpus, seeds: duplicated })).toThrow(RangeError);
    const outOfRange = [...corpus.seeds.slice(0, 31), 0x1_0000_0000];
    expect(() => validateSeedCorpus({ ...corpus, seeds: outOfRange })).toThrow(RangeError);
  });

  it('üretici deterministiktir', () => {
    expect(buildSeedCorpus().seeds).toEqual(buildSeedCorpus().seeds);
  });
});
