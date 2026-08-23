import { constants } from 'node:fs';
import { lstat, open, realpath, type FileHandle } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AssetRecord } from './catalog.js';
import { AssetStudioError } from './errors.js';
import { isPathInside, resolveExistingAsset } from './pathSecurity.js';

export interface VerifiedAssetFile {
  handle: FileHandle;
  size: number;
}

function identityMatches(
  record: AssetRecord,
  candidate: Awaited<ReturnType<FileHandle['stat']>>,
): boolean {
  return (
    record.identity.device === candidate.dev &&
    record.identity.inode === candidate.ino &&
    record.identity.changedAtMs === candidate.ctimeMs &&
    record.identity.size === candidate.size
  );
}

/**
 * Katalogdan sonra dosyanın symlink ile değiştirilmesini ve stale revision
 * üzerinden başka içerik okunmasını engelleyen doğrulanmış descriptor açar.
 */
export async function openVerifiedAsset(record: AssetRecord): Promise<VerifiedAssetFile> {
  if (record.root.canonicalPath === undefined) {
    throw new AssetStudioError('asset_not_found', 404);
  }

  const canonicalCandidate = await resolveExistingAsset(record.root, record.relativeToRoot);
  if (canonicalCandidate !== record.absolutePath) {
    throw new AssetStudioError('asset_conflict', 409);
  }
  const lexicalCandidate = resolve(record.root.canonicalPath, record.relativeToRoot);
  const lexicalStat = await lstat(lexicalCandidate);
  if (lexicalStat.isSymbolicLink()) {
    throw new AssetStudioError('asset_conflict', 409);
  }

  let handle: FileHandle;
  try {
    handle = await open(lexicalCandidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ELOOP')
      throw new AssetStudioError('asset_conflict', 409, undefined, { cause: error });
    if (code === 'ENOENT')
      throw new AssetStudioError('asset_not_found', 404, undefined, { cause: error });
    throw error;
  }

  try {
    const descriptorStat = await handle.stat();
    if (!descriptorStat.isFile() || !identityMatches(record, descriptorStat)) {
      throw new AssetStudioError('asset_conflict', 409);
    }

    // Linux'te descriptorın gerçek hedefi yarışsız doğrulanır. Diğer
    // platformlarda açık descriptor kimliği + yukarıdaki canonical denetim kalır.
    try {
      const descriptorPath = await realpath(`/proc/self/fd/${handle.fd}`);
      if (!isPathInside(record.root.canonicalPath, descriptorPath)) {
        throw new AssetStudioError('path_outside_workspace', 403);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (error instanceof AssetStudioError) throw error;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
    return { handle, size: descriptorStat.size };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
