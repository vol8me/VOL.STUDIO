/**
 * Ölçekleme kapısı — `quality.json` → `scaling` bütçelerini doğrular.
 *
 * Süreyi DEĞİL karmaşıklığı ölçer; gerekçesi `scripts/quality/scalingBudget.mjs`
 * başlığında.
 *
 * Frozen paketler rutin ölçekleme kapısından hariç tutulur.
 */
import { readFileSync } from 'node:fs';
import { validateScaling } from './quality/scalingBudget.mjs';
import { loadWorkspaceLifecycle, activeWorkspacePaths } from './quality/workspaceLifecycle.mjs';

const root = process.cwd();
const quality = JSON.parse(readFileSync(`${root}/quality.json`, 'utf8'));
const lifecycle = loadWorkspaceLifecycle(`${root}/workspace-lifecycle.json`);
const activePaths = new Set(activeWorkspacePaths(lifecycle));

const activeScaling = Object.fromEntries(
  Object.entries(quality.scaling ?? {}).filter(
    ([packageDir]) => packageDir.startsWith('$') || activePaths.has(packageDir),
  ),
);

const problems = validateScaling(root, activeScaling);

console.log(`##quality:${JSON.stringify({ kind: 'scaling', count: problems.length })}`);
if (problems.length > 0) {
  console.error('[scaling] Ölçekleme bütçesi aşıldı:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('[scaling] Algoritmik ölçekleme bütçe içinde.');
