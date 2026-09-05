#!/usr/bin/env node
/**
 * Bundle bütçesi kapısı — `just bundle`.
 *
 * Ayrı bir giriş noktasıdır çünkü `workspace-contract` pre-commit'te koşar ve
 * o anda `dist` genellikle yoktur; boyut ancak `build`den SONRA ölçülebilir.
 * Aynı bekçiyi commit anında çağırmak, her commit'te "dist yok" diye kapıyı
 * düşürürdü.
 */
import { loadQualityConfig } from './quality/config.mjs';
import { validateBundleSizes, measureBundle } from './quality/bundleSize.mjs';
import { join } from 'node:path';

const root = process.cwd();
const quality = loadQualityConfig(join(root, 'quality.json'));
const budgets = quality.bundles ?? {};

for (const packageDir of Object.keys(budgets)) {
  const measured = measureBundle(join(root, packageDir, 'dist'));
  if (measured === null) continue;
  console.log(
    `[bundle] ${packageDir}: app ${measured.appKb} KB, ` +
      `vendor ${measured.vendorKb} KB, css ${measured.cssKb} KB (gzip)`,
  );
}

const problems = validateBundleSizes(root, budgets);
if (problems.length > 0) {
  console.error(`##quality:{"kind":"bundle","count":${problems.length}}`);
  console.error('\n[bundle] Bütçe aşımı:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('[bundle] Bütün bütçeler sınırda.');
