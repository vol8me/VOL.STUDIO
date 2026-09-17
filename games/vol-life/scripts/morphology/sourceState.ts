import { execFileSync } from 'node:child_process';

/**
 * Clean-source zorunluluğu (E12). Kirli ağaçta koşulan bir araştırma
 * EXPLORATION'dır: sonuçları okunabilir ama promotion üretemez, çünkü hangi
 * kaynaktan çıktığı yeniden üretilemez.
 *
 * Sağlayıcı ENJEKTE EDİLEBİLİR; testler hem sahte sağlayıcıyla hem geçici
 * gerçek bir depoyla koşar.
 */
export interface GitProvider {
  /** `git rev-parse HEAD` karşılığı. */
  revision(): string;
  /** `git status --porcelain` karşılığı; her satır bir yol taşır. */
  porcelainStatus(): string;
}

export interface SourceState {
  readonly revision: string;
  readonly dirty: boolean;
  /** Kirliliği doğuran yollar; boş değilse gerekçe görünür olur. */
  readonly dirtyPaths: readonly string[];
  /** Kirli ağaç promotion üretemez. */
  readonly eligibleForPromotion: boolean;
}

/** Araştırma çıktısının kendisi kirlilik sayılmaz; koşu onu zaten üretir. */
export const DEFAULT_IGNORED_PREFIXES: readonly string[] = ['research-out'];

export function createGitProvider(cwd: string): GitProvider {
  const run = (args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    revision: () => run(['rev-parse', 'HEAD']).trim(),
    porcelainStatus: () => run(['status', '--porcelain']),
  };
}

export function readSourceState(
  provider: GitProvider,
  ignoredPrefixes: readonly string[] = DEFAULT_IGNORED_PREFIXES,
): SourceState {
  const revision = provider.revision().trim();
  if (!/^[0-9a-f]{7,40}$/.test(revision)) {
    throw new RangeError(`Git revizyonu okunamadı: ${revision}`);
  }
  const dirtyPaths = parsePorcelain(provider.porcelainStatus(), ignoredPrefixes);
  const dirty = dirtyPaths.length > 0;
  return { revision, dirty, dirtyPaths, eligibleForPromotion: !dirty };
}

/**
 * Porcelain satırı `XY <yol>` biçimindedir; yeniden adlandırmada `eski -> yeni`
 * taşır ve İKİ yol da kirliliğe sayılır — yalnız hedefe bakmak, yok sayılan bir
 * dizine taşınan kirli bir dosyayı gizlerdi.
 */
function parsePorcelain(status: string, ignoredPrefixes: readonly string[]): string[] {
  const paths: string[] = [];
  for (const line of status.split('\n')) {
    if (line.trim().length === 0) continue;
    const body = line.slice(3).trim();
    const candidates = body.includes(' -> ') ? body.split(' -> ') : [body];
    for (const raw of candidates) {
      const path = raw.replace(/^"|"$/g, '');
      if (ignoredPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
        continue;
      }
      paths.push(path);
    }
  }
  return paths;
}
