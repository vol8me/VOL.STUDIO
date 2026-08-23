import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { isPathInside } from './pathSecurity.js';

/** Kaynak (`server/`) ve derlenmiş (`dist-server/server/`) konumlarını birleştirir. */
export function packageRootFromRuntime(): string {
  const parent = resolve(import.meta.dirname, '..');
  return basename(parent) === 'dist-server' ? resolve(parent, '..') : parent;
}

/**
 * Platformun kullanıcı cache kökü altındaki Asset Studio dizini.
 *
 * Cache, thumbnail ve recovery dosyaları Git çalışma ağacına GİRMEZ: repo
 * içinde tutulsalardı watcher kendi ürettiği dosyalarla tetiklenir, `git status`
 * kirlenir ve derived artefaktlar yanlışlıkla commit edilebilirdi.
 */
export function assetStudioCacheDirectory(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const home = env.HOME ?? env.USERPROFILE ?? homedir();
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    return join(base, 'vol-asset-studio', 'cache');
  }
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'vol-asset-studio');
  return join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'vol-asset-studio');
}

/**
 * Cache kökünü seçer ve repo dışında kalmasını garanti eder.
 *
 * `XDG_CACHE_HOME` repo içine bakacak biçimde ayarlanmışsa (CI kabukları ve
 * sandbox'lar bunu yapabilir) cache repoyu kirletirdi; o durumda geçici dizine
 * düşülür, istek yolu hiçbir zaman düşmez.
 */
export function resolveCacheRoot(canonicalRepoRoot: string, env?: NodeJS.ProcessEnv): string {
  const preferred = assetStudioCacheDirectory(env);
  if (!isPathInside(canonicalRepoRoot, preferred)) return preferred;
  return join(tmpdir(), 'vol-asset-studio', 'cache');
}
