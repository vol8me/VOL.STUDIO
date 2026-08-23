import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  DEFAULT_LIMITS,
  type AssetKind,
  type AssetRole,
  type AssetStudioProjectConfig,
} from '../shared/index.js';
import { AssetStudioError } from './errors.js';
import { assertSafeRelativePath, isPathInside } from './pathSecurity.js';

const ASSET_KINDS = new Set<AssetKind>([
  'image',
  'audio',
  'font',
  'sprite-document',
  'audio-recipe',
  'metadata',
]);
const ASSET_ROLES = new Set<AssetRole>(['source', 'shipped', 'derived', 'readonly']);
const ROOT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LIMIT_KEYS = ['maxAssetBytes', 'maxImagePixels', 'maxThumbnailSize'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(issues: string[], path: string): void {
  issues.push(path);
}

function unknownKeys(
  issues: string[],
  value: Record<string, unknown>,
  allowed: readonly string[],
  prefix = '',
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issue(issues, prefix === '' ? key : `${prefix}.${key}`);
  }
}

/** Hata metni yerine sorunlu alan yollarını döndüren katı v1 doğrulayıcı. */
export function validateProjectConfig(value: unknown): AssetStudioProjectConfig {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new AssetStudioError('configuration_invalid', 500, { issues: ['$'] });
  }

  unknownKeys(issues, value, ['schemaVersion', 'name', 'roots', 'ignore', 'limits']);

  if (value.schemaVersion !== 1) issue(issues, 'schemaVersion');
  if (value.name !== undefined && (typeof value.name !== 'string' || value.name.trim() === '')) {
    issue(issues, 'name');
  }

  const roots = value.roots;
  if (!Array.isArray(roots) || roots.length === 0) issue(issues, 'roots');
  const rootIds = new Set<string>();
  if (Array.isArray(roots)) {
    roots.forEach((root, index) => {
      const prefix = `roots.${index}`;
      if (!isRecord(root)) {
        issue(issues, prefix);
        return;
      }
      unknownKeys(issues, root, ['id', 'path', 'role', 'kinds', 'ignore'], prefix);
      if (typeof root.id !== 'string' || !ROOT_ID_PATTERN.test(root.id) || rootIds.has(root.id)) {
        issue(issues, `${prefix}.id`);
      } else {
        rootIds.add(root.id);
      }
      try {
        assertSafeRelativePath(root.path, `${prefix}.path`);
      } catch {
        issue(issues, `${prefix}.path`);
      }
      if (typeof root.role !== 'string' || !ASSET_ROLES.has(root.role as AssetRole)) {
        issue(issues, `${prefix}.role`);
      }
      if (
        !Array.isArray(root.kinds) ||
        root.kinds.length === 0 ||
        root.kinds.some(
          (kind) => typeof kind !== 'string' || !ASSET_KINDS.has(kind as AssetKind),
        ) ||
        new Set(root.kinds).size !== root.kinds.length
      ) {
        issue(issues, `${prefix}.kinds`);
      }
      if (
        root.ignore !== undefined &&
        (!Array.isArray(root.ignore) || root.ignore.some((entry) => typeof entry !== 'string'))
      ) {
        issue(issues, `${prefix}.ignore`);
      }
    });
  }

  if (!Array.isArray(value.ignore) || value.ignore.some((entry) => typeof entry !== 'string')) {
    issue(issues, 'ignore');
  }

  if (value.limits !== undefined) {
    if (!isRecord(value.limits)) {
      issue(issues, 'limits');
    } else {
      unknownKeys(issues, value.limits, LIMIT_KEYS, 'limits');
      for (const key of LIMIT_KEYS) {
        const candidate = value.limits[key];
        if (
          candidate !== undefined &&
          (!Number.isSafeInteger(candidate) || (candidate as number) <= 0)
        ) {
          issue(issues, `limits.${key}`);
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new AssetStudioError('configuration_invalid', 500, { issues: [...new Set(issues)] });
  }

  return value as unknown as AssetStudioProjectConfig;
}

export interface LoadedProjectConfig {
  repoRoot: string;
  configPath: string;
  project: AssetStudioProjectConfig;
  limits: typeof DEFAULT_LIMITS;
}

export async function loadProjectConfig(
  repoRootInput: string,
  configPathInput = 'asset-studio.json',
): Promise<LoadedProjectConfig> {
  const repoRoot = await realpath(repoRootInput);
  const configCandidate = resolve(repoRoot, configPathInput);
  if (!isPathInside(repoRoot, configCandidate)) {
    throw new AssetStudioError('path_outside_workspace', 403, { field: 'config' });
  }

  let configPath: string;
  let raw: string;
  try {
    configPath = await realpath(configCandidate);
    if (!isPathInside(repoRoot, configPath)) {
      throw new AssetStudioError('path_outside_workspace', 403, { field: 'config' });
    }
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    if (error instanceof AssetStudioError) throw error;
    throw new AssetStudioError(
      'configuration_invalid',
      500,
      { issues: ['config'] },
      { cause: error },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new AssetStudioError(
      'configuration_invalid',
      500,
      { issues: ['config.json'] },
      { cause: error },
    );
  }

  const project = validateProjectConfig(parsed);
  return {
    repoRoot,
    configPath,
    project,
    limits: { ...DEFAULT_LIMITS, ...project.limits },
  };
}
