#!/usr/bin/env node
/**
 * UI yüzey kaydı yardımcısı.
 *
 *   node scripts/quality/cli/ui-registry.mjs --check
 *   node scripts/quality/cli/ui-registry.mjs --suggest <ExportAdı>
 *
 * `--suggest` yeni bir export'u kaydederken bağlanabilecek gerçek doğrulama
 * taşıyan testleri (adı tanımlayıcı olarak kullanan ve `expect` çağıran blok) listeler.
 */
import { suggestEvidence, validateRepoUiRegistry } from '../uiRegistry.mjs';

const root = process.cwd();
const [flag, name] = process.argv.slice(2);

if (flag === '--suggest' && name) {
  const found = suggestEvidence(root, name, 5);
  if (found.length === 0) {
    console.log(`${name}: doğrulama taşıyan test bulunamadı; registry'ye gap (sahip görevli) yaz.`);
    process.exit(1);
  }
  console.log(JSON.stringify(found, null, 2));
} else if (flag === '--check' || flag === undefined) {
  const problems = validateRepoUiRegistry(root);
  for (const problem of problems) console.error(problem);
  console.log(`[ui-registry] ${problems.length === 0 ? 'geçerli' : `${problems.length} ihlal`}`);
  process.exit(problems.length === 0 ? 0 : 1);
} else {
  console.error('Kullanım: ui-registry.mjs --check | --suggest <ExportAdı>');
  process.exit(2);
}
