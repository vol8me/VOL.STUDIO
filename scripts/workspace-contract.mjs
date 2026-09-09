#!/usr/bin/env node
/**
 * Workspace kapı kapsamı, gerçek Vitest eşikleri, paket sınırları ve git
 * girdileri birlikte doğrulanır. Bir ihlal diğerinin teşhisini gizlemez.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadQualityConfig, validateQualityWorkspaceParity } from './quality/config.mjs';
import { validateBlobSizes } from './quality/blobSize.mjs';
import { validateLayerBoundaries } from './quality/layers.mjs';
import { validateTrackedImports } from './quality/trackedImports.mjs';
import { validateCoverageBinding } from './quality/coverageBinding.mjs';
import { validateI18nKeys } from './quality/deadI18n.mjs';
import { validateSourceSize } from './quality/sourceSize.mjs';
import { validateCommentDensity } from './quality/commentDensity.mjs';
import { validateDevPorts } from './quality/devPorts.mjs';
import { validateModuleCycles } from './quality/moduleCycles.mjs';

/** Her paketin sahip olması gereken script'ler ve hangi kapının kullandığı. */
const REQUIRED_SCRIPTS = {
  typecheck: 'just typecheck',
  test: 'just test',
  'test:coverage': 'just coverage',
};

const root = process.cwd();
const problems = [];

const quality = loadQualityConfig(join(root, 'quality.json'));
const THRESHOLD_FLOOR = quality.floor;
/** Kapsam eşiği aranmayan paketler — gerekçesi `quality.json`da yazılı olmalı. */
const THRESHOLD_EXEMPT = new Map(Object.entries(quality.exempt ?? {}));

function listWorkspacePackages() {
  const raw = execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw)
    .filter((p) => p.path !== root)
    .map((p) => ({ name: p.name, dir: p.path.replace(`${root}/`, '') }));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Paketin eşiklerini tek kaynaktan okur. */
function readThresholds(name) {
  return quality.packages?.[name] ?? null;
}

const packages = listWorkspacePackages();

if (packages.length === 0) {
  problems.push('Hiç workspace paketi bulunamadı — pnpm-workspace.yaml bozuk olabilir.');
}

problems.push(
  ...validateQualityWorkspaceParity(
    quality,
    packages.map((pkg) => pkg.name),
  ),
);

// Katman sınırları: oyun/devtool/core bağımlılık yönü.
problems.push(...validateLayerBoundaries(root));
problems.push(...validateBlobSizes(root));
problems.push(...validateTrackedImports(root));
problems.push(...validateI18nKeys(root));
problems.push(...validateSourceSize(root));
problems.push(...validateDevPorts(root));
problems.push(...validateModuleCycles(root));
problems.push(...validateCommentDensity(root));

for (const pkg of packages) {
  const manifest = readJson(join(root, pkg.dir, 'package.json'));
  const scripts = manifest.scripts ?? {};

  for (const [script, gate] of Object.entries(REQUIRED_SCRIPTS)) {
    if (!scripts[script]) {
      problems.push(
        `${pkg.name} (${pkg.dir}): "${script}" script'i yok. ` +
          `${gate} bu paketi --if-present yüzünden SESSİZCE atlar.`,
      );
    }
  }

  if (!scripts['test:coverage']) continue;
  if (THRESHOLD_EXEMPT.has(pkg.name)) continue;

  const thresholds = readThresholds(pkg.name);
  if (!thresholds) {
    continue;
  }

  // Vitest gerçek config ile yüklenir: eksik veya ezilmiş eşik de hatadır.
  const configPath = join(root, pkg.dir, 'vitest.config.ts');
  if (!existsSync(configPath)) {
    problems.push(
      `${pkg.name} (${pkg.dir}): "test:coverage" script'i var ama vitest.config.ts yok. ` +
        `Kapsam eşiği test çalıştırıcısına bağlanmamış.`,
    );
    continue;
  }
  problems.push(...(await validateCoverageBinding(configPath, thresholds)));

  for (const [key, floor] of Object.entries(THRESHOLD_FLOOR)) {
    const value = thresholds[key];
    if (value === undefined) {
      problems.push(`${pkg.name}: coverage eşiği "${key}" tanımsız (taban ${floor}).`);
    } else if (value < floor) {
      problems.push(
        `${pkg.name}: coverage eşiği ${key}=${value}, taban ${floor}'ın altında. ` +
          `Eşiği yükselt ya da gerekçesini quality.json'un "exempt" alanına yaz.`,
      );
    }
  }
}

if (problems.length > 0) {
  // Makine-okunur işaret: `scripts/quality/report.mjs` bunu ayrıştırır. Kendi
  // ürettiğimiz çıktıyı serbest metinden okumak, üçüncü parti araçları
  // ayrıştırmakla aynı kırılganlığı ev yapımı bir soruna çevirirdi.
  console.error(`##quality:{"kind":"contract","count":${problems.length}}`);
  console.error('\n[workspace-contract] Kapı kapsamı ihlali:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\n${problems.length} ihlal. Kapılar bu paketleri ölçmediği için commit engellendi.\n`,
  );
  process.exit(1);
}

console.log(
  `[workspace-contract] ${packages.length} paket, kapı kapsamı tam, ` +
    `katman sınırları temiz, dosya boyutları ve kaynak girdileri geçerli.`,
);
