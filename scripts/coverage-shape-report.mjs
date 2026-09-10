#!/usr/bin/env node
/**
 * Kapsamın şekli kapısı — `just coverage-shape` ve `just coverage-audio`.
 *
 * Kapsam koşusundan SONRA koşar: yalnız o koşunun ölçtüğü paketleri ve o
 * koşuda yazılmış `coverage/lcov.info` dosyalarını değerlendirir.
 */
import { join } from 'node:path';
import { loadQualityConfig } from './quality/config.mjs';
import { readStamp } from './quality/coverageRun.mjs';
import { validateCoverageShape } from './quality/coverageShape.mjs';

const root = process.cwd();
const run = process.argv[2] ?? 'coverage';
const quality = loadQualityConfig(join(root, 'quality.json'));
const stamp = readStamp(root, run);
const problems = validateCoverageShape(root, quality.coverageShape, stamp, run);

if (problems.length > 0) {
  console.error(`##quality:{"kind":"coverage-shape","count":${problems.length}}`);
  console.error(`\n[coverage-shape] "${run}" koşusunda kapsam şekli ihlalleri:\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  process.exit(1);
}

console.log(
  `[coverage-shape] "${run}": ${stamp.packages.length} paket — büyük dosyalar test edilmiş ya da kanıtlı gerekçeli.`,
);
