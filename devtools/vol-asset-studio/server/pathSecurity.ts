import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { AssetStudioError } from './errors.js';

const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/;

/** İki mutlak yol arasında tam segment sınırıyla containment denetimi yapar. */
export function isPathInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return (
    difference === '' ||
    (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference))
  );
}

/** Config veya API içindeki repo-göreli yolun güvenli biçimini doğrular. */
export function assertSafeRelativePath(value: unknown, field = 'path'): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.startsWith('/') ||
    isAbsolute(value) ||
    WINDOWS_ABSOLUTE_PATTERN.test(value)
  ) {
    throw new AssetStudioError('path_outside_workspace', 400, { field });
  }

  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new AssetStudioError('path_outside_workspace', 400, { field });
  }

  return segments.join('/');
}

async function nearestExistingPath(candidate: string): Promise<string> {
  let cursor = candidate;
  while (true) {
    try {
      await lstat(cursor);
      return cursor;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
    }
  }
}

/**
 * Var olmayan bir hedefte dahi en yakın mevcut ebeveyni canonicalize eder.
 * Böylece ara klasördeki symlink üzerinden repo dışına çıkış açık kalmaz.
 */
export async function assertCanonicalContainment(
  canonicalParent: string,
  candidate: string,
): Promise<void> {
  const existing = await nearestExistingPath(candidate);
  const canonicalExisting = await realpath(existing);
  if (!isPathInside(canonicalParent, canonicalExisting)) {
    throw new AssetStudioError('path_outside_workspace', 403);
  }
}

export interface ResolvedWorkspaceRoot {
  configuredPath: string;
  absolutePath: string;
  canonicalPath?: string;
  available: boolean;
}

/** Yapılandırılmış asset kökünü repo sınırları içinde çözer. */
export async function resolveWorkspaceRoot(
  canonicalRepoRoot: string,
  configuredPath: string,
): Promise<ResolvedWorkspaceRoot> {
  const safePath = assertSafeRelativePath(configuredPath, 'root.path');
  const absolutePath = resolve(canonicalRepoRoot, safePath);
  if (!isPathInside(canonicalRepoRoot, absolutePath)) {
    throw new AssetStudioError('path_outside_workspace', 403, { field: 'root.path' });
  }

  await assertCanonicalContainment(canonicalRepoRoot, absolutePath);
  try {
    const canonicalPath = await realpath(absolutePath);
    if (!isPathInside(canonicalRepoRoot, canonicalPath)) {
      throw new AssetStudioError('path_outside_workspace', 403, { field: 'root.path' });
    }
    return { configuredPath: safePath, absolutePath, canonicalPath, available: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return { configuredPath: safePath, absolutePath, available: false };
  }
}

/** Mevcut bir dosyayı hem lexical hem realpath sınırıyla doğrular. */
export async function resolveExistingAsset(
  root: ResolvedWorkspaceRoot,
  relativePath: string,
): Promise<string> {
  if (!root.available || root.canonicalPath === undefined) {
    throw new AssetStudioError('asset_not_found', 404);
  }

  const safePath = assertSafeRelativePath(relativePath, 'asset.path');
  const candidate = resolve(root.canonicalPath, safePath);
  if (!isPathInside(root.canonicalPath, candidate)) {
    throw new AssetStudioError('path_outside_workspace', 403);
  }

  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AssetStudioError('asset_not_found', 404, undefined, { cause: error });
    }
    throw error;
  }

  if (!isPathInside(root.canonicalPath, canonicalCandidate)) {
    throw new AssetStudioError('path_outside_workspace', 403);
  }
  return canonicalCandidate;
}
