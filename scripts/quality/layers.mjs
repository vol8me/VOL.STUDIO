/**
 * Katman sınırı bekçisi — AGENTS.md "Bozulamaz Kurallar" 3 ve 4'ün makine
 * karşılığı.
 *
 * Kural bir dönem yalnız `.md`de yazılıydı ve gerçekten kaydı: bir oyunun
 * ÇALIŞMA ZAMANI bir devtool paketini import ediyor, üstelik onu `dependencies`
 * altında taşıyordu. Aynı repoda doğru desen zaten vardı (build-time üretici,
 * `devDependencies`, üretilen asset oyunun `public/`i) — sapmayı gören bir kapı
 * yoktu.
 *
 * Ayrım ZAMANDIR, paket değil:
 *   - `src/`      = çalışma zamanı. Yalnız `core` ve dış bağımlılıklar.
 *   - `scripts/`, `tests/` = build/doğrulama zamanı. Devtool üreticileri serbest,
 *     ama `devDependencies` olarak.
 *
 * Bir devtool'un repo dosyalarını VERİ olarak okuması modül bağımlılığı
 * değildir; bu yüzden yalnız `.ts` import'ları taranır, JSON içerikleri değil.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

/**
 * Devtool → devtool kenarları. BOŞ OLMAYAN her giriş bilinçli bir karardır.
 *
 * "Hiçbir devtool bir diğerini import etmez" kuralı gönderilen bundle'ı
 * korumak için yazıldı; iki devtool arasında o kaygı yoktur — ikisi de
 * oyuncuya gitmez. Kalan gerçek risk düğümlenmedir, o yüzden kenar YASAK
 * değil GÖRÜNÜR olmalı: burada yazılı olmayan bir kenar kapıyı düşürür ve
 * döngü her hâlükârda reddedilir.
 */
const DEVTOOL_EDGES = {
  '@volstudio/vol-asset-studio': {
    '@volstudio/visual-synth':
      'Asset studio, VisualSynth belgelerini (.volsprite.json) SALT OKUNUR inceler; ' +
      'biçimin sahibi üreticidir ve onu CORE’a taşımak bir yazarlık formatını ' +
      'çalışma zamanı çerçevesine sokardı.',
  },
};

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  '.cache',
  'gen',
  'target',
]);

/** `from '<x>'`, `import '<x>'`, `import('<x>')`, `require('<x>')`. */
const SPECIFIER_PATTERN = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

function listPackageDirs(root, group) {
  const groupDir = join(root, group);
  let entries;
  try {
    entries = readdirSync(groupDir);
  } catch {
    return [];
  }
  return entries.filter((entry) => {
    if (SKIP_DIRS.has(entry)) return false;
    try {
      return statSync(join(groupDir, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

function readPackageName(root, dir) {
  try {
    return JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')).name ?? null;
  } catch {
    return null;
  }
}

function walkTypeScript(dir, visit) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkTypeScript(full, visit);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      visit(full, readFileSync(full, 'utf8'));
    }
  }
}

/** `child`, `parent` ağacının içinde mi? (Aynı dizin de içeridir.) */
function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}

function specifiersOf(source) {
  const found = [];
  for (const match of source.matchAll(SPECIFIER_PATTERN)) found.push(match[1]);
  return found;
}

/**
 * Katman sınırlarını doğrular ve ihlalleri döner (fırlatmaz — çağıran hepsini
 * tek listede toplar).
 */
export function validateLayerBoundaries(root) {
  const problems = [];

  const gameDirs = listPackageDirs(root, 'games').map((name) => ({
    dir: join('games', name),
    pkg: readPackageName(root, join('games', name)),
  }));
  const devtoolDirs = listPackageDirs(root, 'devtools').map((name) => ({
    dir: join('devtools', name),
    pkg: readPackageName(root, join('devtools', name)),
  }));

  const devtoolPackages = new Set(devtoolDirs.map((entry) => entry.pkg).filter(Boolean));
  const gamePackages = new Set(gameDirs.map((entry) => entry.pkg).filter(Boolean));

  /** `@volstudio/audio-synth/writer` gibi alt yollar da aynı pakete sayılır. */
  const packageOf = (specifier) => {
    if (!specifier.startsWith('@volstudio/')) return null;
    const [scope, name] = specifier.split('/');
    return `${scope}/${name}`;
  };

  const scanRuntime = (owner, forbidden, label) => {
    walkTypeScript(join(root, owner.dir, 'src'), (file, source) => {
      const rel = relative(root, file);
      for (const specifier of specifiersOf(source)) {
        const pkg = packageOf(specifier);
        if (pkg && forbidden.has(pkg)) {
          problems.push(`${rel}: çalışma zamanı bir ${label} import ediyor ("${pkg}").`);
        }
      }
    });
  };

  /**
   * Paketin DIŞINA göreli yolla uzanan import'lar.
   *
   * Ayrı bir geçiştir çünkü `scanRuntime` sahip başına birden çok kez koşar
   * (farklı yasak kümeleri için) ve aynı ihlali her turda yeniden raporlardı.
   *
   * Yol DESENLE aranmaz, ÇÖZÜLÜR: paket adıyla import etmeyi yukarıdaki kontrol
   * yakalar, `../../` ile kaçmak aynı bağı kurar ve bir dönem tam olarak öyle
   * kurulmuştu (rig metadata'sı oyunun kaynağından export ağacına uzanıyordu).
   * Desen araması yetmez — kardeş bir pakete giden yol (`../../../vol-hell/`)
   * hiçbir grup adı içermez ve sessizce geçerdi.
   */
  const scanEscapes = (owner) => {
    const ownerRoot = join(root, owner.dir);
    walkTypeScript(join(ownerRoot, 'src'), (file, source) => {
      const rel = relative(root, file);
      for (const specifier of specifiersOf(source)) {
        if (!specifier.startsWith('.')) continue;
        if (isInside(ownerRoot, resolve(dirname(file), specifier))) continue;
        problems.push(
          `${rel}: çalışma zamanı paketin DIŞINA göreli yolla uzanıyor ("${specifier}"). ` +
            `Paylaşılan kod CORE'a alınır, üretilmiş asset paketin kendi ağacına senkronlanır.`,
        );
      }
    });
  };

  // 1) Oyunların ÇALIŞMA ZAMANI ne bir devtool'a ne BAŞKA BİR OYUNA bağlanır.
  //    Paylaşılacak bir şey varsa CORE'a taşınır (AGENTS.md Kural 4).
  for (const game of gameDirs) {
    const otherGames = new Set([...gamePackages].filter((pkg) => pkg !== game.pkg));
    scanRuntime(game, devtoolPackages, 'devtool');
    scanRuntime(game, otherGames, 'başka oyun');
    scanEscapes(game);
  }

  // 2) Devtool'lar bir OYUNA hiç bağlanmaz; başka bir devtool'a yalnız
  //    `DEVTOOL_EDGES`de yazılı olduğu kadar bağlanır.
  for (const tool of devtoolDirs) {
    const declared = new Set(Object.keys(DEVTOOL_EDGES[tool.pkg] ?? {}));
    const others = new Set([...devtoolPackages].filter((pkg) => !declared.has(pkg)));
    others.delete(tool.pkg);
    scanRuntime(tool, others, 'bildirilmemiş devtool');
    scanRuntime(tool, gamePackages, 'oyun');
    scanEscapes(tool);
  }

  problems.push(...findDevtoolCycles(devtoolPackages));

  // 3) CORE hiçbir oyun ya da devtool import etmez (Kural 3).
  const coreForbidden = new Set([...devtoolPackages, ...gamePackages]);
  walkTypeScript(join(root, 'core', 'src'), (file, source) => {
    const rel = relative(root, file);
    for (const specifier of specifiersOf(source)) {
      const pkg = packageOf(specifier);
      if (pkg && coreForbidden.has(pkg)) {
        problems.push(`${rel}: CORE bir tüketici paketi import ediyor ("${pkg}").`);
      }
      if (/(^|\/)\.\.\/(?:\.\.\/)*(?:games|devtools)\//.test(specifier)) {
        problems.push(`${rel}: CORE tüketici ağacına göreli yolla uzanıyor ("${specifier}").`);
      }
    }
  });

  // 4) Devtool bir oyunun ÇALIŞMA ZAMANI bağımlılığı olamaz. Build-time
  //    kullanım (`scripts/`, `tests/`) meşrudur ama `devDependencies`e yazılır:
  //    `dependencies` o paketi gönderilen bundle'ın sözleşmesine sokar.
  for (const game of gameDirs) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, game.dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      if (devtoolPackages.has(dep)) {
        problems.push(
          `${game.dir}/package.json: "${dep}" dependencies altında. ` +
            `Devtool'lar yalnız build-time kullanılır; devDependencies'e taşı.`,
        );
      }
    }
  }

  return problems;
}

/**
 * Bildirilmiş kenarlarda döngü aramaz — döngüyü REDDEDER.
 *
 * İki devtool birbirini import ettiğinde ikisi de tek başına sökülemez hâle
 * gelir; kenarı görünür kılmanın amacı tam olarak bunu engellemekti.
 */
function findDevtoolCycles(devtoolPackages) {
  const problems = [];
  const visiting = new Set();
  const done = new Set();

  const walk = (pkg, chain) => {
    if (done.has(pkg)) return;
    if (visiting.has(pkg)) {
      problems.push(
        `devtool bağımlılıklarında döngü var (${[...chain, pkg].join(' -> ')}). ` +
          `Paylaşılan yüzey CORE'a ya da bağımsız bir pakete taşınmalı.`,
      );
      return;
    }
    visiting.add(pkg);
    for (const next of Object.keys(DEVTOOL_EDGES[pkg] ?? {})) {
      if (devtoolPackages.has(next)) walk(next, [...chain, pkg]);
    }
    visiting.delete(pkg);
    done.add(pkg);
  };

  for (const pkg of devtoolPackages) walk(pkg, []);
  return problems;
}
