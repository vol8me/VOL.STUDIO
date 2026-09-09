#!/usr/bin/env node
/**
 * Kapsamın şekli kapısı — `just coverage-shape`.
 *
 * `coverage`den SONRA koşar: paketlerin `coverage/lcov.info` çıktısını okur.
 * Ortalama kapsam yüksek olsa bile, kritik/büyük dosyaların test edilmeden
 * kalmasını veya gerekçesiz bırakılmasını engeller.
 */
import { join } from 'node:path';
import { loadQualityConfig } from './quality/config.mjs';
import { validateCoverageShape } from './quality/coverageShape.mjs';

const root = process.cwd();
const quality = loadQualityConfig(join(root, 'quality.json'));
const problems = validateCoverageShape(root, quality.coverageShape);

if (problems.length > 0) {
  console.error(`##quality:{"kind":"coverage-shape","count":${problems.length}}`);
  console.error('\n[coverage-shape] Kapsam şekli ihlalleri:\n');
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log('[coverage-shape] Kapsam şekli doğrulandı (büyük dosyalar test edilmiş veya gerekçeli).');
