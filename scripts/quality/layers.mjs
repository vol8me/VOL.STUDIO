import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { sourceImports } from './sourceImports.mjs';

/** Yazarlık formatının sahibi üreticidir; çalışma zamanı CORE'a taşınmaz. */
const DEVTOOL_EDGES = {
  '@volstudio/vol-asset-studio': {
    '@volstudio/visual-synth': 'Asset Studio, VisualSynth belgelerini salt okunur inceler.',
  },
};
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-server',
  'coverage',
  'test-results',
  '.cache',
  'gen',
  'target',
]);
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function inside(parent, child) {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !path.startsWith(sep));
}

function packagesAt(root) {
  const dirs = ['core', 'tauri-v2'];
  for (const group of ['games', 'devtools']) {
    if (!existsSync(join(root, group))) continue;
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) dirs.push(`${group}/${entry.name}`);
    }
  }
  return dirs
    .filter((dir) => existsSync(join(root, dir, 'package.json')))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
      return {
        dir,
        root: resolve(root, dir),
        name: manifest.name,
        manifest,
        kind: dir.startsWith('games/')
          ? 'game'
          : dir.startsWith('devtools/')
          ? 'tool'
          : dir === 'core'
          ? 'core'
          : 'platform',
      };
    });
}

function walk(dir, visit) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visit);
    else if (SOURCE.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) visit(file);
  }
}

/**
 * Runtime, manifest ve devtool sunucu/script kenarları aynı kurala tabidir.
 * Import sözdizimi AST'den, tsconfig alias'ları TypeScript çözümleyicisinden
 * gelir. Yorumlar kenar değildir; ts/js ve sabit dinamik importlar kenardır.
 * Değişkenle kurulan import hedefleri statik olarak çözülemez.
 */
export function validateLayerBoundaries(root) {
  const problems = [];
  const packages = packagesAt(root);
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const graph = new Map(packages.map((pkg) => [pkg.name, new Set()]));
  const configCache = new Map();
  const ownerOf = (file) => packages.find((pkg) => inside(pkg.root, file));
  const optionsFor = (file) => {
    const config = ts.findConfigFile(dirname(file), ts.sys.fileExists);
    if (!config) return { moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true };
    if (!configCache.has(config)) {
      const raw = ts.readConfigFile(config, ts.sys.readFile);
      configCache.set(
        config,
        ts.parseJsonConfigFileContent(raw.config ?? {}, ts.sys, dirname(config)).options,
      );
    }
    return configCache.get(config);
  };
  const targetOf = (specifier, file) => {
    const name = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    if (byName.has(name)) return byName.get(name);
    if (specifier.startsWith('.')) return ownerOf(resolve(dirname(file), specifier));
    const resolved = ts.resolveModuleName(specifier, file, optionsFor(file), ts.sys).resolvedModule;
    return resolved ? ownerOf(resolved.resolvedFileName) : undefined;
  };
  const check = (owner, target, where, runtime) => {
    if (!target || target === owner) return;
    graph.get(owner.name).add(target.name);
    const allowed = DEVTOOL_EDGES[owner.name]?.[target.name];
    if (owner.kind === 'core' && target.kind !== 'core') {
      problems.push(`${where}: CORE bir tüketici paketi import ediyor ("${target.name}").`);
    } else if (owner.kind === 'platform' && (target.kind === 'game' || target.kind === 'tool')) {
      problems.push(`${where}: platform katmanı bir oyun/devtool tüketiyor ("${target.name}").`);
    } else if (
      owner.kind === 'game' &&
      (target.kind === 'game' || (runtime && target.kind === 'tool'))
    ) {
      problems.push(
        `${where}: oyun ${runtime ? 'çalışma zamanı' : 'bağımlılığı'} yasak pakete uzanıyor ("${
          target.name
        }").`,
      );
    } else if (
      owner.kind === 'tool' &&
      (target.kind === 'game' || (target.kind === 'tool' && !allowed?.trim()))
    ) {
      problems.push(`${where}: devtool bildirilmemiş/yasak pakete uzanıyor ("${target.name}").`);
    }
  };
  for (const owner of packages) {
    for (const field of [
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'devDependencies',
    ]) {
      for (const name of Object.keys(owner.manifest[field] ?? {})) {
        check(
          owner,
          byName.get(name),
          `${owner.dir}/package.json (${field})`,
          field !== 'devDependencies',
        );
      }
    }
    const roots = owner.kind === 'tool' ? ['src', 'server', 'shared', 'scripts'] : ['src'];
    for (const directory of roots)
      walk(join(owner.root, directory), (file) => {
        for (const specifier of sourceImports(readFileSync(file, 'utf8'), file)) {
          const where = relative(root, file);
          check(owner, targetOf(specifier, file), where, directory !== 'scripts');
          if (
            directory !== 'scripts' &&
            specifier.startsWith('.') &&
            !inside(owner.root, resolve(dirname(file), specifier))
          ) {
            problems.push(
              `${where}: çalışma zamanı paketin dışına göreli yolla uzanıyor ("${specifier}").`,
            );
          }
        }
      });
  }
  const visiting = new Set();
  const done = new Set();
  const visit = (name, chain) => {
    if (visiting.has(name)) {
      problems.push(`Paket bağımlılıklarında döngü var: ${[...chain, name].join(' -> ')}`);
      return;
    }
    if (done.has(name)) return;
    visiting.add(name);
    for (const target of graph.get(name)) visit(target, [...chain, name]);
    visiting.delete(name);
    done.add(name);
  };
  for (const name of graph.keys()) visit(name, []);
  return [...new Set(problems)];
}
