#!/usr/bin/env node
/**
 * Workspace sözleşmesi — kapıların kapsamının repo büyüdükçe sessizce
 * daralmasını engeller.
 *
 * Kapılar `pnpm -r` üzerinden çalışır ve `--if-present` bayrağı, script'i
 * olmayan paketi HATA VERMEDEN atlar. Yani test script'i yazılmamış yeni bir
 * paket eklendiğinde bütün kapılar yeşil kalır ve o paket ölçülmeden repoya
 * girer. Bu betik o boşluğu kapatır: her workspace paketinin kapılara dahil
 * olduğunu ve kapsam eşiğinden muaf tutulmadığını doğrular.
 *
 * `just quick` içinde koşar (pre-commit), maliyeti milisaniye mertebesinde.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadQualityConfig, validateQualityWorkspaceParity } from './quality/config.mjs';

/** Her paketin sahip olması gereken script'ler ve hangi kapının kullandığı. */
const REQUIRED_SCRIPTS = {
  typecheck: 'just typecheck',
  test: 'just test',
  'test:coverage': 'just coverage',
};

const root = process.cwd();
const problems = [];

/**
 * Kalite sözleşmesi TEK dosyadan okunur (`quality.json`).
 *
 * Eşikler bir dönem her paketin `vitest.config.ts` dosyasındaydı ve buradan
 * REGEX ile okunuyordu: `/thresholds\s*:\s*\{([\s\S]*?)\}/` ilk `}`
 * karakterinde kestiği için `thresholds` bloğuna iç içe bir nesne eklemek
 * bekçiyi sessizce yanlış bloğu okumaya iterdi — üstelik dosyadaki İLK
 * `thresholds` eşleşmesi neredeyse doğru olurdu. Bekçi ile config artık aynı
 * dosyayı tüketiyor, ayrışamazlar.
 */
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

  // Config'in eşiği ELLE yazmadığını da doğrula: `quality.json`u atlayıp
  // vitest.config.ts'e sayı yazmak, bekçi yeşilken kapsamın düşmesine yol açar.
  const configPath = join(root, pkg.dir, 'vitest.config.ts');
  if (!existsSync(configPath)) {
    problems.push(
      `${pkg.name} (${pkg.dir}): "test:coverage" script'i var ama vitest.config.ts yok. ` +
        `Kapsam eşiği test çalıştırıcısına bağlanmamış.`,
    );
    continue;
  }
  const configSource = readFileSync(configPath, 'utf8');
  if (/thresholds:\s*\{/.test(configSource)) {
    problems.push(
      `${pkg.name}: vitest.config.ts eşikleri satır içi yazıyor. ` +
        `Eşikler quality.json'dan gelmeli (thresholds: quality.packages[...]).`,
    );
  }

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

console.log(`[workspace-contract] ${packages.length} paket, kapı kapsamı tam.`);
