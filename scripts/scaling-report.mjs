/**
 * Ölçekleme kapısı — `quality.json` → `scaling` bütçelerini doğrular.
 *
 * Süreyi DEĞİL karmaşıklığı ölçer; gerekçesi `scripts/quality/scalingBudget.mjs`
 * başlığında.
 */
import { readFileSync } from 'node:fs';
import { validateScaling } from './quality/scalingBudget.mjs';

const root = process.cwd();
const quality = JSON.parse(readFileSync(`${root}/quality.json`, 'utf8'));
const problems = validateScaling(root, quality.scaling);

console.log(`##quality:${JSON.stringify({ kind: 'scaling', count: problems.length })}`);
if (problems.length > 0) {
  console.error('[scaling] Ölçekleme bütçesi aşıldı:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[scaling] Algoritmik ölçekleme bütçe içinde.');
