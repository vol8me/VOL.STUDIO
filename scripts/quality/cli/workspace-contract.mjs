#!/usr/bin/env node
/**
 * Workspace kapı kapsamı, gerçek Vitest eşikleri, paket sınırları ve git
 * girdileri birlikte doğrulanır. Bir ihlal diğerinin teşhisini gizlemez.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadQualityConfig,
  validateQualityWorkspaceParity,
  validateActiveGameBudgets,
} from '../config.mjs';
import { validateBlobSizes } from '../blobSize.mjs';
import { validateLayerBoundaries } from '../layers.mjs';
import { validateTrackedImports } from '../trackedImports.mjs';
import { validateCoverageBinding } from '../coverageBinding.mjs';
import { validateI18nKeys } from '../deadI18n.mjs';
import { validateSourceSize } from '../sourceSize.mjs';
import { validateCommentDensity } from '../commentDensity.mjs';
import { validateDevPorts } from '../devPorts.mjs';
import { validateModuleCycles } from '../moduleCycles.mjs';
import { validateDeviceApps } from '../deviceApps.mjs';
import { validateCargoWorkspace } from '../cargoWorkspace.mjs';
import { validateProductIcons } from '../productIcons.mjs';
import { validatePhaserBoundary } from '../phaserBoundary.mjs';
import { validateCoreTypeSurface } from '../publicTypeSurface.mjs';
import { validateTauriPlugins } from '../tauriPlugins.mjs';
import { validateRepoAppIdentity } from '../appIdentity.mjs';
import { validateRepoCatalog } from '../catalog.mjs';
import { validateRepoUiRegistry } from '../uiRegistry.mjs';
import { validateRepoUiEvidence } from '../uiEvidence.mjs';
import { validateRepoRootEntries } from '../rootEntries.mjs';
import { validateContextComments } from '../contextComments.mjs';
import { validateDocumentation } from '../documentation.mjs';
import {
  activeWorkspaceNames,
  listWorkspacePackages,
  loadWorkspaceLifecycle,
  validateWorkspaceLifecycle,
} from '../workspaceLifecycle.mjs';

/** Her paketin sahip olması gereken script'ler ve hangi kapının kullandığı. */
const REQUIRED_SCRIPTS = {
  typecheck: 'just typecheck',
  test: 'just test',
  'test:coverage': 'just coverage',
};

const root = process.cwd();
const problems = [];

const quality = loadQualityConfig(join(root, 'quality.json'));
const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
const THRESHOLD_FLOOR = quality.floor;
/** Kapsam eşiği aranmayan paketler — gerekçesi `quality.json`da yazılı olmalı. */
const THRESHOLD_EXEMPT = new Map(Object.entries(quality.exempt ?? {}));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Paketin eşiklerini tek kaynaktan okur. */
function readThresholds(name) {
  return quality.packages?.[name] ?? null;
}

const packages = listWorkspacePackages(root);
const activeNames = new Set(activeWorkspaceNames(lifecycle));
const activePackages = packages.filter((pkg) => activeNames.has(pkg.name));

if (packages.length === 0) {
  problems.push('Hiç workspace paketi bulunamadı — pnpm-workspace.yaml bozuk olabilir.');
}

problems.push(
  ...validateQualityWorkspaceParity(
    quality,
    activePackages.map((pkg) => pkg.name),
  ),
);
problems.push(...validateWorkspaceLifecycle(root, lifecycle, packages));
problems.push(
  ...validateActiveGameBudgets(
    quality,
    activePackages.filter((pkg) => pkg.dir.startsWith('games/')).map((pkg) => pkg.dir),
  ),
);

// Katman sınırları: oyun/devtool/core bağımlılık yönü.
// Lifecycle'ı DIŞARI veren bekçiler ürün kalitesidir ve frozen ağaçları
// taramaz; almayanlar (lifecycle, blob, tracked imports, phaser, type yüzeyi)
// repo/freeze bütünlüğüdür ve ağacın tamamını görür.
problems.push(...validateLayerBoundaries(root, lifecycle));
problems.push(...validateBlobSizes(root));
problems.push(...validateTrackedImports(root));
problems.push(...validateI18nKeys(root, undefined, lifecycle));
problems.push(...validateSourceSize(root, undefined, undefined, lifecycle));
problems.push(...validateDevPorts(root, lifecycle));
problems.push(...validateModuleCycles(root, lifecycle));
problems.push(...validateCommentDensity(root, undefined, undefined, lifecycle));
problems.push(...validateDeviceApps(root, lifecycle));
problems.push(...validateCargoWorkspace(root, undefined, undefined, lifecycle));
problems.push(...validateProductIcons(root, undefined, lifecycle));
problems.push(...validateTauriPlugins(root, lifecycle));
problems.push(...validateRepoAppIdentity(root, lifecycle));
problems.push(...validatePhaserBoundary(root));
problems.push(...validateCoreTypeSurface(root));
problems.push(...validateRepoCatalog(root));
problems.push(...validateRepoUiRegistry(root));
problems.push(...validateRepoUiEvidence(root));
problems.push(...validateRepoRootEntries(root));
problems.push(...validateContextComments(root, undefined, lifecycle));
problems.push(...validateDocumentation(root, quality.documentation, lifecycle));

for (const pkg of activePackages) {
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
  `[workspace-contract] ${activePackages.length} aktif / ${packages.length} toplam paket, kapı kapsamı tam, ` +
    `katman sınırları temiz, dosya boyutları ve kaynak girdileri geçerli.`,
);
