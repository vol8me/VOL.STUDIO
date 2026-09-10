#!/usr/bin/env node
/**
 * KAPSAM KOŞUSU — ölçer ve NEYİ, NE ZAMAN ölçtüğünü kaydeder.
 *
 * Şekil kapısı (`coverage-shape`) diskteki `coverage/lcov.info` dosyalarını
 * okur. Bu kayıt olmadan hangi dosyanın bu koşudan, hangisinin eski bir
 * koşudan kaldığını bilemez: ölçüldü, `high` audio-synth'i ölçmüyordu ama şekil
 * kapısı onun önceki bir koşudan kalan lcov'unu değerlendiriyordu.
 *
 * Ölçülecek paketler `quality.json` → `coverageRuns` içinde yazılıdır; tarif
 * paket listesini tekrarlamaz.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadQualityConfig } from './config.mjs';

/** Kayıt `node_modules` altında durur: repoya girmez, temiz klonda yoktur. */
export function stampPath(root, run) {
  return join(root, 'node_modules', '.cache', 'vol-quality', `coverage-${run}.json`);
}

/** @returns Koşu kaydı ya da kayıt yoksa `null`. */
export function readStamp(root, run) {
  try {
    return JSON.parse(readFileSync(stampPath(root, run), 'utf8'));
  } catch {
    return null;
  }
}

/** `{ only }` yalnız adı geçenleri, `{ exclude }` adı geçenler dışındakileri seçer. */
export function selectRunPackages(packages, spec) {
  if (spec.only) return packages.filter((pkg) => spec.only.includes(pkg.name));
  const excluded = new Set(spec.exclude ?? []);
  return packages.filter((pkg) => !excluded.has(pkg.name));
}

function coveragePackages(root) {
  const listed = JSON.parse(
    execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  return listed
    .filter((pkg) => resolve(pkg.path) !== resolve(root))
    .map((pkg) => ({ name: pkg.name, dir: relative(root, pkg.path).split(sep).join('/') }))
    .filter((pkg) => {
      const manifest = JSON.parse(readFileSync(join(root, pkg.dir, 'package.json'), 'utf8'));
      return Boolean(manifest.scripts?.['test:coverage']);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function main(run) {
  const root = process.cwd();
  const spec = loadQualityConfig(join(root, 'quality.json')).coverageRuns?.[run];
  if (!spec) {
    console.error(`[coverage] "${run}" koşusu quality.json → coverageRuns içinde tanımlı değil.`);
    return 2;
  }
  const packages = selectRunPackages(coveragePackages(root), spec);
  if (packages.length === 0) {
    console.error(`[coverage] "${run}" koşusu hiçbir paketi seçmiyor.`);
    return 2;
  }

  const stamp = { run, startedAt: Date.now(), packages };
  mkdirSync(dirname(stampPath(root, run)), { recursive: true });
  writeFileSync(stampPath(root, run), JSON.stringify(stamp, null, 2));

  const filters = packages.flatMap((pkg) => ['--filter', pkg.name]);
  const result = spawnSync('pnpm', ['-r', ...filters, 'run', 'test:coverage'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) return result.status ?? 1;

  writeFileSync(stampPath(root, run), JSON.stringify({ ...stamp, finishedAt: Date.now() }, null, 2));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv[2] ?? 'coverage');
}
