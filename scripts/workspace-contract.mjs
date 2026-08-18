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
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Her paketin sahip olması gereken script'ler ve hangi kapının kullandığı. */
const REQUIRED_SCRIPTS = {
  typecheck: 'just typecheck',
  test: 'just test',
  'test:coverage': 'just coverage',
};

/**
 * Kapsam eşiği tabanı. Bir paket bunun altına eşik yazamaz; yazarsa kapsam
 * gerilemesi sessizce geçer. `design` paketi bir dönem 0/0/0/0 ile durdu ve
 * gerçek kapsamı %98 olmasına rağmen sıfıra düşse kapı yeşil kalırdı.
 */
const THRESHOLD_FLOOR = { lines: 50, statements: 50, branches: 50, functions: 40 };

/** Kapsam eşiği aranmayan paketler — gerekçesi burada yazılı olmalı. */
const THRESHOLD_EXEMPT = new Map();

const root = process.cwd();
const problems = [];

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

/** vitest config'inden `thresholds` bloğunu okur (config'i çalıştırmadan). */
function readThresholds(dir) {
  const candidates = ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js'];
  const file = candidates.map((c) => join(dir, c)).find((p) => existsSync(p));
  if (!file) return null;

  const src = readFileSync(file, 'utf8');
  const block = src.match(/thresholds\s*:\s*\{([\s\S]*?)\}/);
  if (!block) return null;

  const found = {};
  for (const key of Object.keys(THRESHOLD_FLOOR)) {
    const hit = block[1].match(new RegExp(`${key}\\s*:\\s*(\\d+(?:\\.\\d+)?)`));
    if (hit) found[key] = Number(hit[1]);
  }
  return Object.keys(found).length > 0 ? found : null;
}

const packages = listWorkspacePackages();

if (packages.length === 0) {
  problems.push('Hiç workspace paketi bulunamadı — pnpm-workspace.yaml bozuk olabilir.');
}

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

  const thresholds = readThresholds(join(root, pkg.dir));
  if (!thresholds) {
    problems.push(
      `${pkg.name} (${pkg.dir}): vitest coverage "thresholds" bloğu yok. ` +
        `Eşiksiz paket kapsam gerilemesini yakalamaz.`,
    );
    continue;
  }

  for (const [key, floor] of Object.entries(THRESHOLD_FLOOR)) {
    const value = thresholds[key];
    if (value === undefined) {
      problems.push(`${pkg.name}: coverage eşiği "${key}" tanımsız (taban ${floor}).`);
    } else if (value < floor) {
      problems.push(
        `${pkg.name}: coverage eşiği ${key}=${value}, taban ${floor}'ın altında. ` +
          `Eşiği yükselt ya da gerekçesini THRESHOLD_EXEMPT'e yaz.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('\n[workspace-contract] Kapı kapsamı ihlali:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    `\n${problems.length} ihlal. Kapılar bu paketleri ölçmediği için commit engellendi.\n`,
  );
  process.exit(1);
}

console.log(`[workspace-contract] ${packages.length} paket, kapı kapsamı tam.`);
