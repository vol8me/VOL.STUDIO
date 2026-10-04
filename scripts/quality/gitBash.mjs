import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, posix, win32 } from 'node:path';

/**
 * `justfile` tarifleri `bash -euo pipefail -c` ile koşar. Windows'ta PATH'teki
 * `bash`, `WindowsApps\bash.exe` WSL launcher'ına çözülebiliyor ve o zaman her
 * tarif WSL'nin Linux node/pnpm'i altında koşar: `rust-just` ile `esbuild`
 * win32 ikilisi arar, bulamaz, kapılar koddan bağımsız olarak kırılır; `doctor`
 * de Linux'un araç durumunu raporlar, hatta Linux'un `pkg-config`iyle yeşil
 * Tauri bağımlılığı bildirir.
 *
 * Bu yüzden Windows'ta kabuk PATH sırasından değil, deponun zorunlu kıldığı Git
 * kurulumundan türetilir: `git.exe`nin bulunduğu kökün `bin\bash.exe`si. PATH
 * sırası, `WindowsApps` ve WSL bu yolla devre dışı kalır.
 */

/** `git.exe` bu klasörlerden birindeyse Git kurulumunun kökü bir üstüdür. */
const GIT_EXE_PARENTS = ['cmd', 'bin'];
const BASH_FROM_GIT_ROOT = [
  ['bin', 'bash.exe'],
  ['usr', 'bin', 'bash.exe'],
];
/** @type {Array<[string, string[]]>} */
const GIT_WELLS = [
  ['ProgramFiles', ['Git']],
  ['ProgramFiles(x86)', ['Git']],
  ['LocalAppData', ['Programs', 'Git']],
];
const POSIX_BASH_WELLS = [
  ['bin', 'bash'],
  ['usr', 'bin', 'bash'],
];

/**
 * Yol, çalıştırılan platforma göre biçimlenir: `posix.join` ve `win32.join`
 * ayrıdır, bu yüzden hedef platform hangisiyse onun birleştiricisi kullanılır.
 * Böylece çözümleme başka bir platformda sınandığında da aynı yolu üretir.
 */
function joinFor(platform) {
  return platform === 'win32' ? win32.join : posix.join;
}

function firstExisting(base, relatives, exists, join) {
  for (const parts of relatives) {
    const candidate = join(base, ...parts);
    if (exists(candidate)) return candidate;
  }
  return null;
}

function findOnPath(join, name, extensions, pathValue, separator, exists) {
  for (const directory of (pathValue ?? '').split(separator)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, name + extension);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Windows'ta PATH'teki `bash`in WSL launcher'ına çözülmesi zararlıdır; Unix'te
 * `bash` zaten tek çalışma zamanıdır. Windows yolları büyük/küçük harf
 * duyarsızdır, `PATHEXT` büyük harf verebilir.
 */
function isWslLauncher(candidate) {
  return candidate
    .toLowerCase()
    .split(/[\\/]/)
    .includes('windowsapps');
}

/**
 * `where.exe`, Win32'nin kendi komut çözümleyicisidir. WSL'in `bash.exe`si bir
 * App Execution Alias'tır: dosya olarak 0 bayt görünür ama `fs.existsSync`
 * onu görmez, oysa süreç oluştururken ilk sıraya gelir. Tarama bu yüzden
 * gölgeyi kaçırır; `where.exe` kaçırmaz.
 */
function whereFirst(env, exists, run) {
  const where = env.SystemRoot
    ? win32.join(env.SystemRoot, 'System32', 'where.exe')
    : 'where.exe';
  if (!exists(where)) return null;
  const result = run(where, ['bash']);
  if (result.status !== 0 || !result.stdout) return null;
  return (
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

function gitRootOf(gitExe) {
  const parent = dirname(gitExe);
  return GIT_EXE_PARENTS.includes(basename(parent).toLowerCase()) ? dirname(parent) : null;
}

function windowsBash(pathValue, env, exists) {
  const join = joinFor('win32');
  const extensions = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);

  const git = findOnPath(join, 'git', extensions, pathValue, ';', exists);
  const root = git ? gitRootOf(git) : null;
  const derived = root ? firstExisting(root, BASH_FROM_GIT_ROOT, exists, join) : null;
  if (derived) return { path: derived, source: 'git' };

  for (const [envKey, rest] of GIT_WELLS) {
    const base = env[envKey];
    if (!base) continue;
    const found = firstExisting(join(base, ...rest), BASH_FROM_GIT_ROOT, exists, join);
    if (found) return { path: found, source: 'well-known' };
  }

  const onPath = findOnPath(join, 'bash', extensions, pathValue, ';', exists);
  if (onPath && !isWslLauncher(onPath)) return { path: onPath, source: 'path' };
  return null;
}

function posixBash(pathValue, exists) {
  const join = joinFor('posix');
  const onPath = findOnPath(join, 'bash', [''], pathValue, ':', exists);
  if (onPath) return { path: onPath, source: 'path' };
  const well = firstExisting('/', POSIX_BASH_WELLS, exists, join);
  return well ? { path: well, source: 'well-known' } : null;
}

/**
 * @typedef {{ ok: true, path: string, source: string, shadow: string|null, problem: null }
 *   | { ok: false, path: null, source: null, shadow: string|null, problem: string }} BashShell
 * @typedef {{ platform?: string, env?: Record<string, string|undefined>, exists?: (p: string) => boolean, run?: (c: string, a: string[]) => { status: number|null, stdout?: string } }} ShellEnv
 */

const defaultRun = (command, args) =>
  spawnSync(command, args, { encoding: 'utf8', windowsHide: true });

/** Kapıların ve `doctor`ın ortak kullandığı tek çözümleme. */
export function resolveBashShell(options = {}) {
  const { platform = process.platform, env = process.env, exists = existsSync } = options;
  return platform === 'win32'
    ? windowsBash(env.PATH ?? '', env, exists)
    : posixBash(env.PATH ?? '', exists);
}

/** PATH'in `bash`ı nereye çözülüyor; yalnız teşhis ve gölge denetimi için. */
export function pathBash(options = {}) {
  const {
    platform = process.platform,
    env = process.env,
    exists = existsSync,
    run = defaultRun,
  } = options;
  if (platform === 'win32') {
    const viaWhere = whereFirst(env, exists, run);
    if (viaWhere) return viaWhere;
  }
  const extensions =
    platform === 'win32'
      ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : [''];
  const separator = platform === 'win32' ? ';' : ':';
  return findOnPath(joinFor(platform), 'bash', extensions, env.PATH ?? '', separator, exists);
}

/** PATH'teki `bash` bir WSL launcher'ıysa yolu, değilse null. */
export function wslBashLauncher(options = {}) {
  if ((options.platform ?? process.platform) !== 'win32') return null;
  const onPath = pathBash(options);
  return onPath && isWslLauncher(onPath) ? onPath : null;
}

/**
 * Kabuğun tek kaydı. `problem` kapıyı durduran sebeptir: kullanılabilir kabuk
 * hiç yoksa dolar. `shadow` ise PATH'teki WSL launcher'ıdır — kabuk Git
 * kurulumuna sabitlendiği için kapıyı düşürmez, ama PATH'ten çıkarılmalıdır;
 * bu yüzden `doctor` bunu uyarı olarak bildirir, başarısızlık olarak değil.
 *
 * @returns {BashShell}
 */
export function bashShell(options = {}) {
  const { platform = process.platform } = options;
  const resolved = resolveBashShell(options);
  const shadow = wslBashLauncher(options);

  if (!resolved) {
    return {
      ok: false,
      path: null,
      source: null,
      shadow,
      problem:
        platform === 'win32'
          ? 'bash: Git for Windows bash bulunamadı. PATH’te `git.exe` görünür olsun ya da Git for Windows kur (https://gitforwindows.org).'
          : 'bash: PATH’te `bash` yok ve /bin/bash da bulunamadı.',
    };
  }
  return { ok: true, path: resolved.path, source: resolved.source, shadow, problem: null };
}

/**
 * PATH'teki WSL gölgesi için uyarı. Kabuk doğru çözüldüğü hâlde PATH'te
 * `bash` hâlâ WSL'e gidiyorsa bu gölge ileride başka bir çağıranı da
 * yanlış çalışma zamanına düşürebilir.
 */
export function bashShellWarning(options = {}) {
  const shell = bashShell(options);
  if (!shell.shadow) return null;
  return `bash: PATH’teki bash WSL launcher’ı (${shell.shadow}). Kabuk ${shell.path ?? 'çözülemedi'} olarak sabitlendi, ama ${shell.ok ? 'kapılar bu yüzden çalışır' : 'kapılar çalışmaz'}; gölge PATH’ten çıkarılmalı ya da Git Bash önüne alınmalı.`;
}

/** Yalnız blokajı döndürür: gölge uyarıdır, kapıyı düşürmez. */
export function bashShellProblem(options = {}) {
  return bashShell(options).problem;
}