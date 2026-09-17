import { mkdirSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { buildSeedCorpus, validateSeedCorpus } from '../morphology/seedCorpus';

/*
 * `corpus-v1` üretici. Dosya bir kez yazılır ve commit'lenir; bu betik yalnız
 * o dosyanın üreticiden yeniden çıktığını göstermek için durur.
 */
const corpus = buildSeedCorpus();
validateSeedCorpus(corpus);
mkdirSync('benchmarks/fixtures', { recursive: true });
/*
 * Dosya commit'lenen bir fixture'dır ve biçim kapısından geçer; betiğin çıktısı
 * ile `prettier --check` arasındaki fark, her yeniden üretimde kırmızı kapı
 * olurdu.
 */
const path = 'benchmarks/fixtures/corpus-v1.json';
// Biçim deponun kendi prettier yapılandırmasından gelir; ayrı bir biçim icat edilmez.
const serialized = await format(JSON.stringify(corpus), {
  ...(await resolveConfig(path)),
  parser: 'json',
});
writeFileSync(path, serialized, 'utf8');
console.log(
  `${corpus.id}: ${corpus.seeds.length} tohum, ilk üç ${corpus.seeds.slice(0, 3).join(', ')}`,
);
