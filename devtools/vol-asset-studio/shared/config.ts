import type { AssetKind, AssetRole } from './contracts.js';

export interface AssetStudioLimits {
  maxAssetBytes?: number;
  maxImagePixels?: number;
  maxThumbnailSize?: number;
}

export interface AssetRootConfig {
  id: string;
  path: string;
  role: AssetRole;
  kinds: AssetKind[];
  ignore?: string[];
}

export interface AssetStudioProjectConfig {
  schemaVersion: 1;
  name?: string;
  roots: AssetRootConfig[];
  ignore: string[];
  limits?: AssetStudioLimits;
}

export const DEFAULT_LIMITS: Required<AssetStudioLimits> = {
  maxAssetBytes: 256 * 1024 * 1024,
  maxImagePixels: 32 * 1024 * 1024,
  maxThumbnailSize: 512,
};
