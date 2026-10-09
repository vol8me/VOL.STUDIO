/**
 * Bir aşamanın SONUCUNU etkileyen dosya kümesi (kapı makbuzunun kapsamı).
 *
 * Kapsam dardır çünkü dar kapsam kapıyı hızlandırır; kapsam eksiktir çünkü
 * eksik kapsam sessizce yanlış atlar. İkincisi çok daha pahalıdır, bu yüzden:
 *
 *  - `repo`: ağaçtaki her dosya (belge dahil). Başka paketin ya da belgenin
 *    okunup okunmadığı bilinemeyen aşamalar.
 *  - `code`: paket dizinleri + paket dışı kod/yapılandırma. Kökteki belgeler
 *    (`docs/`, paket dışı `.md`) sayılmaz; hiçbir kod kapısı onları okumaz.
 *  - `closure`: bir paketin kendisi + `@volstudio/*` bağımlılık kapanışı +
 *    paket dışı kod/yapılandırma. Paketin başka dizine uzandığı bir dosya
 *    okuması `findScopeEscapes` ile bekçilenir.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { activeWorkspaceNames, loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);
const underAny = (path, dirs) => dirs.some((dir) => under(path, dir));

/**
 * Lifecycle'dan paket grafiği: tüm kayıtlı dizinler (aktif + frozen) ve aktif
 * paketlerin `@volstudio/*` bağımlılıkları.
 */
export function readWorkspaceGraph(root) {
  const lifecycle = loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
  const active = new Set(activeWorkspaceNames(lifecycle));
  const byName = new Map();
  for (const record of lifecycle.workspaces) {
    const dir = record.path.split(/[\\/]/).filter(Boolean).join('/');
    let deps = [];
    let scripts = {};
    if (active.has(record.packageName)) {
      const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'));
      scripts = manifest.scripts ?? {};
      deps = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
      }).filter((name) => name.startsWith('@volstudio/'));
    }
    byName.set(record.packageName, {
      name: record.packageName,
      dir,
      active: active.has(record.packageName),
      deps,
      scripts,
    });
  }
  return {
    packages: byName,
    allDirs: [...byName.values()].map((pkg) => pkg.dir),
    activeDirs: [...byName.values()].filter((pkg) => pkg.active).map((pkg) => pkg.dir),
  };
}

/** `runActive.mjs --if-present` ile aynı seçim: betiği olan aktif paketler, ada göre sıralı. */
export function activePackagesWithScript(graph, script) {
  return [...graph.packages.values()]
    .filter((pkg) => pkg.active && Boolean(pkg.scripts[script]))
    .map((pkg) => pkg.name)
    .sort();
}

/** Paketin kendisi ve geçişli bağımlılıkları (yalnız aktif olanlar). */
export function closureOf(graph, name) {
  const seen = new Set();
  const visit = (current) => {
    const pkg = graph.packages.get(current);
    if (!pkg || !pkg.active || seen.has(current)) return;
    seen.add(current);
    for (const dep of pkg.deps) visit(dep);
  };
  visit(name);
  return [...seen].sort();
}

/** Paket dizini dışındaki belge: `docs/` ve her `.md`. Kod kapıları bunları okumaz. */
function isOutsideDoc(path) {
  return path.startsWith('docs/') || path.endsWith('.md');
}

/**
 * @param {{ kind: 'repo' } | { kind: 'code' } | { kind: 'closure', package: string }} scope
 * @returns {(path: string) => boolean}
 */
export function scopeInclude(graph, scope) {
  if (scope.kind === 'repo') return () => true;
  const isGlobal = (path) => !underAny(path, graph.allDirs) && !isOutsideDoc(path);
  if (scope.kind === 'code') {
    return (path) => underAny(path, graph.activeDirs) || isGlobal(path);
  }
  if (scope.kind === 'closure') {
    const dirs = closureOf(graph, scope.package).map((name) => graph.packages.get(name).dir);
    if (dirs.length === 0) throw new Error(`Kapsam: "${scope.package}" aktif paket değil.`);
    return (path) => underAny(path, dirs) || isGlobal(path);
  }
  throw new Error(`Bilinmeyen kapsam türü: ${JSON.stringify(scope)}`);
}

const SCANNED = /\.(?:ts|mts|cts|tsx|js|mjs|cjs|json)$/;
const RELATIVE_LITERAL = /(['"`])((?:\.\.\/)+[^'"`\r\n]*|\.\.)\1/g;

/**
 * Paketin KENDİ kapanışı dışındaki dosyaya uzanan göreli yol sabitleri. Böyle
 * bir okuma, o dosya paketin makbuz kapsamında olmadığından, dosya değiştiğinde
 * makbuzun sessizce eski kalmasına yol açar. Çözüm: paketi `repo` kapsamına almak
 * ya da okumayı kaldırmak.
 *
 * @param {Iterable<string>} files izlenen ve izlenmeyen dosya yolları
 * @returns {{ file: string, literal: string, target: string }[]}
 */
export function findScopeEscapes(root, graph, packageName, files) {
  const closureDirs = closureOf(graph, packageName).map((name) => graph.packages.get(name).dir);
  const own = graph.packages.get(packageName).dir;
  const found = [];
  for (const file of files) {
    if (!under(file, own) || !SCANNED.test(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(RELATIVE_LITERAL)) {
      const target = posix.normalize(posix.join(dirname(file), match[2]));
      const outside = target === '..' || target.startsWith('../');
      const inScope =
        !outside &&
        target !== '.' &&
        (underAny(target, closureDirs) ||
          (!underAny(target, graph.allDirs) && !isOutsideDoc(target) && !isRepoRoot(target)));
      if (!inScope)
        found.push({ file, literal: match[2], target: outside ? '(repo dışı)' : target });
    }
  }
  return found;
}

/** `.` ve onun üstü: tüm repoyu kapsar, kapsamı belirsizleştirir. */
const isRepoRoot = (target) => target === '' || target === '.';
