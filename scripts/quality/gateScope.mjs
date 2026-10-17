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
 *  - `closure`: bir paketin kendisi + `@volstudio/*` bağımlılık kapanışı + kök
 *    yapılandırma + paketlerin GERÇEKTEN başvurduğu betikler (`deriveSharedInputs`).
 *    Betik dizinindeki başka dosya paket sonucunu etkilemez.
 *  - `crate`: bir Rust crate'inin yolları + path bağımlılıkları + Cargo kökü.
 *
 * Paketin başka dizine uzandığı bir dosya okuması `findScopeEscapes` ile bekçilenir.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { activeWorkspaceNames, loadWorkspaceLifecycle } from './workspaceLifecycle.mjs';

const under = (path, dir) => path === dir || path.startsWith(`${dir}/`);
const underAny = (path, dirs) => dirs.some((dir) => under(path, dir));

/** Paketlerin dışındaki betik ağacı: yalnız başvurulan dosyaları kapsama girer. */
const SCRIPTS_DIR = 'scripts';

/** Rust sonucunu etkileyen kök dosyalar (JS yapılandırması buna girmez). */
const CARGO_ROOT_FILES = [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  'rust-toolchain',
  'rustfmt.toml',
  '.rustfmt.toml',
  'clippy.toml',
  '.clippy.toml',
];
const CARGO_ROOT_DIRS = ['.cargo'];

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

/** Hiçbir paketin içinde olmayan, belge olmayan dosya. */
const isGlobalFile = (graph, path) => !underAny(path, graph.allDirs) && !isOutsideDoc(path);

/** Kök yapılandırma ve betik dışı paylaşılan dosyalar: her paket kapsamına girer. */
const isBaseFile = (graph, path) => isGlobalFile(graph, path) && !under(path, SCRIPTS_DIR);

/**
 * @typedef {{ kind: 'repo' } | { kind: 'code' }
 *   | { kind: 'closure', package: string }
 *   | { kind: 'crate', paths: string[] }} Scope
 *
 * @param {Scope} scope
 * @param {Map<string, Set<string>>} [shared] `deriveSharedInputs` sonucu; `closure` için
 * @returns {(path: string) => boolean}
 */
export function scopeInclude(graph, scope, shared = new Map()) {
  if (scope.kind === 'repo') return () => true;
  if (scope.kind === 'code') {
    return (path) => underAny(path, graph.activeDirs) || isGlobalFile(graph, path);
  }
  if (scope.kind === 'closure') {
    const members = closureOf(graph, scope.package);
    if (members.length === 0) throw new Error(`Kapsam: aktif paket yok (${scope.package}).`);
    const dirs = members.map((name) => graph.packages.get(name).dir);
    const derived = new Set(members.flatMap((name) => [...(shared.get(name) ?? [])]));
    return (path) => underAny(path, dirs) || isBaseFile(graph, path) || derived.has(path);
  }
  if (scope.kind === 'crate') {
    return (path) =>
      underAny(path, scope.paths) ||
      CARGO_ROOT_FILES.includes(path) ||
      underAny(path, CARGO_ROOT_DIRS);
  }
  throw new Error(`Bilinmeyen kapsam türü: ${JSON.stringify(scope)}`);
}

const SCANNED = /\.(?:ts|mts|cts|tsx|js|mjs|cjs|json)$/;
const RELATIVE_LITERAL = /(['"`])((?:\.\.\/)+[^'"`\r\n]*|\.\.)\1/g;
/** `join(ROOT, 'scripts', 'linux', 'x.mjs')`: yol parçalarla kurulan betik başvurusu. */
const SEGMENTED_SCRIPT = /(['"`])scripts\1\s*,\s*((?:(['"`])[^'"`,\r\n]+\3\s*,?\s*)*)/g;
const QUOTED_SEGMENT = /(['"`])([^'"`,\r\n]+)\1/g;
const SCRIPT_EXTENSIONS = ['', '.mjs', '.js', '.ts', '.mts', '.cjs', '.json'];

/**
 * Başvuru desenleri. `rootRelative`: yakalanan yol dosyaya göre değil depo köküne göredir.
 * `ROOT_ANYWHERE` tırnak aramaz: `${ROOT}/scripts/x.mjs` gibi kurulan yollar da yakalanır.
 * Fazla yakalamak güvenlidir (kapsam genişler); eksik yakalamak sessiz yanlış atlamadır.
 */
const FILE_RELATIVE = { regex: RELATIVE_LITERAL, group: 2, rootRelative: false };
const SAME_DIR = { regex: /(['"`])(\.\/[^'"`\r\n]*)\1/g, group: 2, rootRelative: false };
const ROOT_QUOTED = { regex: /(['"`])(scripts\/[^'"`\r\n]*)\1/g, group: 2, rootRelative: true };
const ROOT_ANYWHERE = { regex: /(?<![\w-])(scripts\/[\w./@-]+)/g, group: 1, rootRelative: true };

/**
 * Başvurunun gösterdiği betik dosyaları. Dizin başvurusu (`scripts/linux`) yalnız bir
 * PAKET dosyasından geliyorsa dizini kapsar; betiklerin kendi içindeki `..` gibi yol
 * hesapları dizin okuması değildir.
 */
function scriptResolver(tracked) {
  const scripts = [...tracked].filter((path) => under(path, SCRIPTS_DIR));
  return (target, fromPackage) => {
    for (const extension of SCRIPT_EXTENSIONS) {
      const path = `${target}${extension}`;
      if (tracked.has(path) && under(path, SCRIPTS_DIR)) return [path];
    }
    for (const extension of SCRIPT_EXTENSIONS.slice(1)) {
      const path = `${target}/index${extension}`;
      if (tracked.has(path) && under(path, SCRIPTS_DIR)) return [path];
    }
    if (fromPackage && under(target, SCRIPTS_DIR)) {
      return scripts.filter((path) => under(path, target));
    }
    return [];
  };
}

/** Kaynak metindeki betik başvurularının depo köküne göre yolları. */
function scriptTargets(file, source, patterns) {
  const found = [];
  for (const { regex, group, rootRelative } of patterns) {
    for (const match of source.matchAll(regex)) {
      const literal = rootRelative ? match[group].replace(/[./]+$/, '') : match[group];
      found.push(posix.normalize(rootRelative ? literal : posix.join(dirname(file), literal)));
    }
  }
  for (const match of source.matchAll(SEGMENTED_SCRIPT)) {
    const segments = [...match[2].matchAll(QUOTED_SEGMENT)].map((segment) => segment[2]);
    found.push(posix.normalize([SCRIPTS_DIR, ...segments].join('/')));
  }
  return found;
}

const PACKAGE_PATTERNS = [FILE_RELATIVE, ROOT_QUOTED, ROOT_ANYWHERE];
const SCRIPT_PATTERNS = [FILE_RELATIVE, SAME_DIR, ROOT_QUOTED];

/**
 * Paketlerin paket dışı betiklerden GERÇEKTEN başvurduğu dosyalar ve onların geçişli
 * göreli başvuruları. Paket, betik dizininin geri kalanını okumaz; o yüzden betik
 * düzenlemesi paketin makbuzunu bozmaz.
 *
 * @param {Iterable<string>} files izlenen ve izlenmeyen dosya yolları
 * @returns {Map<string, Set<string>>} paket adı → betik dosyası yolları
 */
export function deriveSharedInputs(root, graph, files, read = readSource) {
  const tracked = new Set(files);
  const resolve = scriptResolver(tracked);
  const cache = new Map();
  const text = (path) => {
    if (!cache.has(path)) {
      const source = read(root, path);
      cache.set(path, source === null ? null : withoutInertComments(source));
    }
    return cache.get(path);
  };

  const result = new Map();
  for (const pkg of graph.packages.values()) {
    if (!pkg.active) continue;
    const found = new Set();
    const queue = [];
    const add = (targets, fromPackage) => {
      for (const target of targets) {
        for (const path of resolve(target, fromPackage)) {
          if (!found.has(path)) {
            found.add(path);
            queue.push(path);
          }
        }
      }
    };
    for (const file of tracked) {
      if (!under(file, pkg.dir) || !SCANNED.test(file)) continue;
      const source = text(file);
      if (source !== null) add(scriptTargets(file, source, PACKAGE_PATTERNS), true);
    }
    while (queue.length > 0) {
      const file = queue.pop();
      const source = SCANNED.test(file) ? text(file) : null;
      if (source !== null) add(scriptTargets(file, source, SCRIPT_PATTERNS), false);
    }
    result.set(pkg.name, found);
  }
  return result;
}

const COMMENT_LINE = /^\s*(?:\/\/|\/?\*)/;

/**
 * Yalnız yorumdan ibaret satırlar hiçbir dosyayı okumaz; içlerinde geçen yol sabiti
 * kapsamı şişirir. Tip denetimini etkileyen `import(...)` başvuruları yorumda da kalır.
 */
function withoutInertComments(source) {
  return source
    .split('\n')
    .filter((line) => !COMMENT_LINE.test(line) || line.includes('import('))
    .join('\n');
}

function readSource(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8');
  } catch {
    return null;
  }
}

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

const CODE_FILE = /\.(?:ts|mts|cts|tsx|js|mjs|cjs)$/;
const SCRIPTS_WORD = /(?<![\w.$-])scripts(?![\w-]|\s*[:=])/g;

/**
 * Paket kaynağında `scripts` sözcüğü geçen ama `deriveSharedInputs`in tanıdığı hiçbir
 * başvuru biçiminin kapsamadığı yerler (örn. `'scripts' + sep + ad`). Türetme yalnız
 * tanıdığı biçimleri izler; tanımadığı biçim, bir betiğin paket kapsamına girmesini
 * SESSİZCE engellerdi. Bekçi bu körlüğü görünür kılar: biçim ya tanınır ya da gerekçeyle
 * `REVIEWED_SCRIPT_MENTIONS`a yazılır.
 *
 * @param {Iterable<string>} files izlenen ve izlenmeyen dosya yolları
 * @returns {{ file: string, line: number, text: string }[]}
 */
export function findUnrecognizedScriptMentions(root, graph, files, read = readSource) {
  const recognized = [
    FILE_RELATIVE.regex,
    ROOT_QUOTED.regex,
    ROOT_ANYWHERE.regex,
    SEGMENTED_SCRIPT,
  ];
  const dirs = [...graph.packages.values()].filter((pkg) => pkg.active).map((pkg) => pkg.dir);
  const found = [];
  for (const file of files) {
    if (!CODE_FILE.test(file) || !underAny(file, dirs)) continue;
    const source = read(root, file);
    if (source === null) continue;
    source.split('\n').forEach((text, index) => {
      if (COMMENT_LINE.test(text) && !text.includes('import(')) return;
      const covered = recognized.flatMap((regex) =>
        [...text.matchAll(regex)].map((match) => [match.index, match.index + match[0].length]),
      );
      for (const mention of text.matchAll(SCRIPTS_WORD)) {
        const inside = covered.some(([from, to]) => mention.index >= from && mention.index < to);
        if (!inside) found.push({ file, line: index + 1, text: text.trim().slice(0, 120) });
      }
    });
  }
  return found;
}
