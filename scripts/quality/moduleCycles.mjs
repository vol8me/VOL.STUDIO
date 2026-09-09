import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

/**
 * MODÜL düzeyinde dairesel bağımlılık.
 *
 * `layers.mjs` de döngü arar ama grafiğini PAKET adlarından kurar; bir paketin
 * İÇİNDEKİ dosya döngüsü ona görünmez. Ölçüldü: `vol-hell` içinde
 * `AudioSettings → settingsPersistence → services → AudioSettings` döngüsü
 * repoya girdi, yaşadı ve hiçbir kapı ses çıkarmadı — dışarıdan bir analiz
 * aracı söyleyene kadar kimse fark etmedi.
 *
 * Döngü bir stil sorunu değildir: modül başlatma sırası döngüde tanımsızdır,
 * yani biri diğerinin henüz atanmamış export'unu `undefined` olarak görür. Hata
 * import satırında değil, çalışma zamanında ve başka bir dosyada patlar.
 *
 * Yalnız GÖRELİ import'lar sayılır — paket sınırını geçen kenarlar
 * `layers.mjs`in işidir ve orada zaten kapılıdır.
 */
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
/** Uzantısız bir görece yol bu sırayla çözülür. */
const RESOLUTIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '/index.ts', '/index.js'];

/**
 * ÇALIŞMA ZAMANINDA kalan import'lar — döngüyü yaratan tek kenar türü.
 *
 * `sourceImports.mjs` bilinçli olarak hepsini döndürür: paketler arası bir TİP
 * bağımlılığı da bir katman kenarıdır ve `layers.mjs` onu saymalıdır. Ama
 * modül döngüsü başka bir soru sorar — "başlatma sırası tanımsız mı?" — ve
 * ona yalnız derlemeden SAĞ ÇIKAN import'lar sebep olur:
 *
 * - `import type { X } from './y'` ve tümü `type` olan adlandırılmış listeler
 *   silinir; sayılmaz.
 * - `export type { X } from './y'` silinir; sayılmaz.
 * - Dinamik `import()` döngüyü KIRAR (tembel ve asenkron); zaten olağan
 *   çözümdür, ihlal sayılmaz.
 * - Yan etki (`import './y'`), varsayılan ve isim uzayı import'ları kalır.
 */
function runtimeImports(source, fileName) {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const specifiers = [];

  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      // Yan etki importunda clause YOKTUR ve o her zaman çalışma zamanıdır.
      const erased =
        clause?.isTypeOnly ||
        (clause &&
          !clause.name &&
          clause.namedBindings &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.length > 0 &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly));
      if (!erased && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const erased =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((element) => element.isTypeOnly));
      if (!erased && ts.isStringLiteralLike(node.moduleSpecifier)) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };

  visit(file);
  return specifiers;
}

function packageDirs(root) {
  const dirs = ['core', 'tauri-v2'];
  for (const group of ['games', 'devtools']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) dirs.push(`${group}/${entry.name}`);
    }
  }
  return dirs.filter((dir) => existsSync(join(root, dir, 'package.json')));
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

/** Uzantısız bir yolu diskteki gerçek dosyaya çözer; çözülemezse `null`. */
function resolveFile(target) {
  if (existsSync(target) && SOURCE.test(target)) return target;
  for (const suffix of RESOLUTIONS) {
    const candidate = `${target}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Paket İÇİ bir specifier'ı dosyaya çözer.
 *
 * `./` yeterli DEĞİLDİR: bu repoda paket içi import'ların çoğu `@/` alias'ıyla
 * yazılır (`@/app/services`). Yalnız göreli yolları izleyen bir bekçi, tam da
 * yakalaması gereken döngüyü kaçırırdı — ölçüldü, `vol-hell`in gerçek
 * döngüsündeki kenarlardan biri alias'lıydı.
 *
 * Alias haritası paketin `tsconfig.json`undaki `paths`ten okunur; paket
 * dışına çıkan hedefler bu bekçinin işi değildir (`layers.mjs` onları kapılar).
 */
function packageAliases(packageRoot) {
  const configPath = join(packageRoot, 'tsconfig.json');
  if (!existsSync(configPath)) return [];
  let raw;
  try {
    raw = ts.readConfigFile(configPath, ts.sys.readFile).config ?? {};
  } catch {
    return [];
  }
  const options = raw.compilerOptions ?? {};
  const baseUrl = resolve(packageRoot, options.baseUrl ?? '.');
  return Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({
    prefix: pattern.replace(/\*$/, ''),
    wildcard: pattern.endsWith('*'),
    targets: targets.map((target) => resolve(baseUrl, target.replace(/\*$/, ''))),
  }));
}

function resolveInsidePackage(specifier, fromFile, packageRoot, aliases) {
  if (specifier.startsWith('.')) {
    return resolveFile(resolve(dirname(fromFile), specifier));
  }
  for (const alias of aliases) {
    if (!specifier.startsWith(alias.prefix)) continue;
    const rest = specifier.slice(alias.prefix.length);
    if (!alias.wildcard && rest.length > 0) continue;
    for (const base of alias.targets) {
      const resolved = resolveFile(resolve(base, rest));
      // Paket dışına düşen alias'lar (ör. `@volstudio/core`) burada elenir.
      if (resolved && !relative(packageRoot, resolved).startsWith('..')) return resolved;
    }
  }
  return null;
}

/**
 * Tarski değil, Tarjan da değil: döngüyü BULMAK yetmez, hangi kenarların
 * döngüyü kapattığını okunur biçimde söylemek gerekir. Derinlik-öncelikli
 * arama yığındaki yolu taşır ve döngüyü olduğu gibi bildirir.
 */
function findCycles(graph) {
  const cycles = [];
  const state = new Map();
  const stack = [];

  const visit = (node) => {
    state.set(node, 'visiting');
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 'visiting') {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!state.has(next)) {
        visit(next);
      }
    }
    stack.pop();
    state.set(node, 'done');
  };

  for (const node of graph.keys()) if (!state.has(node)) visit(node);
  return cycles;
}

/**
 * @param root Repo kökü.
 * @returns Sorun listesi; boşsa hiçbir pakette modül döngüsü yok.
 */
export function validateModuleCycles(root) {
  const problems = [];

  for (const dir of packageDirs(root)) {
    const packageRoot = join(root, dir);
    const aliases = packageAliases(packageRoot);
    const graph = new Map();

    for (const sourceDir of ['src', 'server', 'shared']) {
      walk(join(packageRoot, sourceDir), (file) => {
        const edges = graph.get(file) ?? new Set();
        graph.set(file, edges);
        for (const specifier of runtimeImports(readFileSync(file, 'utf8'), file)) {
          const target = resolveInsidePackage(specifier, file, packageRoot, aliases);
          if (target && target !== file) edges.add(target);
        }
      });
    }

    for (const cycle of findCycles(graph)) {
      const readable = cycle.map((file) => relative(packageRoot, file).split(sep).join('/'));
      problems.push(`${dir}: modül döngüsü — ${readable.join(' -> ')}`);
    }
  }

  return [...new Set(problems)];
}
