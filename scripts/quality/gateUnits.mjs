/**
 * Kapı aşamalarının makbuzlanan parçaları (birimleri).
 *
 * Bir aşama tek komutsa tek makbuz taşır ve en küçük değişiklikte baştan koşar. Burada
 * aşama, `justfile` tarifinin işini bölüşen birimlere ayrılır; her birim kendi kapsamıyla
 * makbuzlanır, yalnız girdisi değişen birim koşar. Birimlerin birleşimi tarifin işinin
 * TAMAMIdır; bunu `gatePlan.test.mjs` tarife karşı sınar.
 *
 * Birim kapsamı yalnız o birimin sonucunu etkileyen dosyalardır (`gateScope.mjs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { CONTRACT_SUITES } from './contractSuites.mjs';
import { SCOPE_OVERRIDES, STAGE_PLAN } from './gatePlan.mjs';
import { activePackagesWithScript } from './gateScope.mjs';
import { rustManifests } from './rust.mjs';

/**
 * @typedef {import('./gateScope.mjs').Scope} Scope
 * @typedef {{ unit: string | null, label: string, command: string, args: string[], scope: Scope }} UnitSpec
 */

const shortName = (name) => name.replace('@volstudio/', '');

const activePackages = (graph) => [...graph.packages.values()].filter((pkg) => pkg.active);

function packageScope(plan, name) {
  const override = plan.overrides ? SCOPE_OVERRIDES[name] : undefined;
  return override ? { kind: override.kind } : { kind: 'closure', package: name };
}

/** Betiği olan her aktif paket: `runActive.mjs --if-present` ile aynı seçim. */
function packageUnits(ctx, plan) {
  const names = activePackagesWithScript(ctx.graph, plan.script);
  if (names.length === 0) throw new Error(`Aktif workspace'lerde "${plan.script}" betiği yok.`);
  return names.map((name) => ({
    unit: name,
    label: shortName(name),
    command: 'pnpm',
    args: ['--filter', name, 'run', plan.script],
    scope: packageScope(plan, name),
  }));
}

/** Paketler + betik ağacı (`scripts/tsconfig.json`, hiçbir pakete ait değil). */
function typecheckUnits(ctx, plan) {
  return [
    ...packageUnits(ctx, plan),
    {
      unit: 'scripts',
      label: 'scripts',
      command: 'pnpm',
      args: ['exec', 'tsc', '-p', 'scripts/tsconfig.json'],
      scope: { kind: 'code' },
    },
  ];
}

/**
 * `eslint .`ın bölünmesi: her aktif paket kendi dizinini, `rest` aktif paket dizinleri
 * dışındaki her şeyi (betikler, kök yapılandırma, donmuş ürünler) denetler. İkisi birlikte
 * `eslint .`ın kapsadığı dosya kümesini tam kapsar; yeni bir üst dizin kendiliğinden `rest`e düşer.
 */
function lintUnits(ctx) {
  const packages = activePackages(ctx.graph).sort((a, b) => (a.dir < b.dir ? -1 : 1));
  return [
    ...packages.map((pkg) => ({
      unit: pkg.name,
      label: shortName(pkg.name),
      command: 'pnpm',
      args: ['exec', 'eslint', pkg.dir],
      scope: /** @type {Scope} */ ({ kind: 'closure', package: pkg.name }),
    })),
    {
      unit: 'rest',
      label: 'rest',
      command: 'pnpm',
      args: [
        'exec',
        'eslint',
        '.',
        ...packages.flatMap((pkg) => ['--ignore-pattern', `${pkg.dir}/`]),
      ],
      scope: { kind: 'code' },
    },
  ];
}

/** Bağımsız bekçi takımları; komutları `contractSuites.mjs` tanımlar. */
function contractUnits() {
  return Object.keys(CONTRACT_SUITES).map((name) => ({
    unit: name,
    label: name,
    command: 'node',
    args: ['scripts/quality/contractSuites.mjs', name],
    scope: /** @type {Scope} */ ({ kind: 'repo' }),
  }));
}

const PATH_DEPENDENCY = /\bpath\s*=\s*"([^"]+)"/g;

function pathDependencies(manifestText, fromDirectory) {
  return [...manifestText.matchAll(PATH_DEPENDENCY)].map((match) =>
    posix.normalize(posix.join(fromDirectory, match[1])),
  );
}

/** Tauri'nin derleme sırasında gömdüğü ön yüz dizini (URL değil, yola benzeyen değer). */
function frontendDirectory(read, directory) {
  try {
    const configuration = JSON.parse(read(posix.join(directory, 'tauri.conf.json')));
    const dist = configuration?.build?.frontendDist;
    return typeof dist === 'string' && !/^[a-z]+:/i.test(dist)
      ? [posix.normalize(posix.join(directory, dist))]
      : [];
  } catch {
    return [];
  }
}

/**
 * Bir crate'in sonucunu etkileyen dizinler: kendisi, path bağımlılıkları (geçişli),
 * kök `Cargo.toml`un path bağımlılıkları ve Tauri ön yüz dizini. Cargo kök dosyaları
 * (`Cargo.lock`, araç zinciri) kapsam türünün işidir.
 *
 * @param {(path: string) => string} read depo köküne göre dosya okur
 */
export function crateDirectories(manifest, read) {
  // Okunamayan manifest bağımlılık eklemez; dizini yine de kapsamdadır.
  const manifestText = (path) => {
    try {
      return read(path);
    } catch {
      return '';
    }
  };
  const dirs = new Set(pathDependencies(manifestText('Cargo.toml'), '.'));
  /** @type {string[]} */
  const queue = [dirname(manifest)];
  const visited = new Set();
  for (let directory = queue.pop(); directory !== undefined; directory = queue.pop()) {
    if (visited.has(directory)) continue;
    visited.add(directory);
    dirs.add(directory);
    for (const dist of frontendDirectory(read, directory)) dirs.add(dist);
    queue.push(...pathDependencies(manifestText(posix.join(directory, 'Cargo.toml')), directory));
  }
  return [...dirs].sort();
}

/** Git'in gördüğü her aktif Cargo manifesti bir birimdir; cargo hedef dizinini paylaşırlar. */
function rustUnits(ctx) {
  const manifests = rustManifests(ctx.root);
  if (manifests.length === 0) throw new Error('Rust kapısı: Cargo.toml bulunamadı');
  const read = (path) => readFileSync(join(ctx.root, path), 'utf8');
  return manifests.map((manifest) => ({
    unit: manifest,
    label: dirname(manifest),
    command: 'node',
    args: ['scripts/quality/rust.mjs', '--manifest', manifest],
    scope: /** @type {Scope} */ ({ kind: 'crate', dirs: crateDirectories(manifest, read) }),
  }));
}

export const UNIT_PROVIDERS = {
  packages: packageUnits,
  typecheck: typecheckUnits,
  lint: lintUnits,
  contract: contractUnits,
  rust: rustUnits,
};

/**
 * @param {{ root: string, graph: any }} ctx
 * @returns {UnitSpec[]}
 */
export function unitsFor(ctx, stage) {
  const plan = STAGE_PLAN[stage];
  const provider = UNIT_PROVIDERS[plan.units];
  if (!provider) throw new Error(`${stage}: bilinmeyen birim türü "${plan.units}" (gateUnits.mjs)`);
  return provider(ctx, plan);
}
