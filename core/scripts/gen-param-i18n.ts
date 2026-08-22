/**
 * Şemadaki parametre açıklamalarından editör i18n anahtarlarını üretir.
 *
 * Şema `description` alanları KODDA yaşar (parametrenin yanında durdukları
 * için geliştirici belgesi olarak da işlevliler) ama editörde kullanıcıya
 * görünürler — `AGENTS.md` Bozulamaz Kural 1 hard-coded metni yasaklıyor.
 * Aynı metni iki yerde elle taşımak yerine tek kaynaktan türetmek, deponun
 * `gen-theme.mjs` ile zaten kurduğu desendir.
 *
 * Üretilen `tr` dosyası commit edilir; `en` karşılığı ELLE doldurulur ve
 * parite testi eksik İngilizceyi yakalar.
 *
 * Kullanım: tsx core/scripts/gen-param-i18n.ts
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_KINDS, NODE_SCHEMAS } from '../src/visual/index';

const root = resolve(import.meta.dirname, '../../games/vol-forge/src/i18n');
const trPath = resolve(root, 'params.tr.json');
const enPath = resolve(root, 'params.en.json');

interface ParamStrings {
  description: string;
  params: Record<string, string>;
}

/**
 * i18next `.` karakterini İÇ İÇE GEÇME ayracı olarak kullanır; `sdf.circle`
 * gibi bir tür adı doğrudan anahtar olamaz. Nokta alt çizgiye çevrilir ve
 * `paramKey()` yardımcısı aynı dönüşümü tüketici tarafta uygular.
 */
function keyFor(kind: string): string {
  return kind.replace(/\./g, '_');
}

const tr: Record<string, ParamStrings> = {};
for (const kind of FIELD_KINDS) {
  const schema = NODE_SCHEMAS[kind];
  const params: Record<string, string> = {};
  for (const param of schema.params) params[param.name] = param.description;
  tr[keyFor(kind)] = { description: schema.description, params };
}

writeFileSync(trPath, `${JSON.stringify(tr, null, 2)}\n`);

// İngilizce dosya ELLE doldurulur; üreteç yalnızca EKSİK anahtarları açar ki
// çevrilmiş metinler her çalıştırmada silinmesin.
const existing: Record<string, ParamStrings> = existsSync(enPath)
  ? (JSON.parse(readFileSync(enPath, 'utf-8')) as Record<string, ParamStrings>)
  : {};
const en: Record<string, ParamStrings> = {};
for (const kind of FIELD_KINDS) {
  const current = existing[keyFor(kind)];
  en[keyFor(kind)] = {
    description: current?.description ?? '',
    params: Object.fromEntries(
      NODE_SCHEMAS[kind].params.map((param) => [param.name, current?.params?.[param.name] ?? '']),
    ),
  };
}
writeFileSync(enPath, `${JSON.stringify(en, null, 2)}\n`);

console.log(`[gen-param-i18n] ${FIELD_KINDS.length} düğüm yazıldı`);
console.log(`  ${trPath}`);
console.log(`  ${enPath}  (boş alanlar elle doldurulur)`);
