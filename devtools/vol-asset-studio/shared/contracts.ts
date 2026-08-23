/** Asset Studio istemcisi ile repo hostu arasındaki sürümlü sözleşmeler. */

export type AssetKind =
  | 'image'
  | 'audio'
  | 'font'
  | 'sprite-document'
  | 'audio-recipe'
  | 'metadata';

export type AssetRole = 'source' | 'shipped' | 'derived' | 'readonly';

/** Katman karıştırma kipleri; CORE UI ve sprite belgesi aynı listeyi kullanır. */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add';

export type GitStatus = 'clean' | 'modified' | 'untracked' | 'deleted' | 'ignored';

export const PROBLEM_CODES = [
  'asset_empty',
  'asset_too_large',
  'audio_header_invalid',
  'font_header_invalid',
  'image_decode_failed',
  'image_dimensions_missing',
  'metadata_parse_failed',
] as const;

export type ProblemCode = (typeof PROBLEM_CODES)[number];

export interface AssetRelation {
  sourceId?: string;
  derivedIds?: string[];
  recipeId?: string;
  relatedIds?: string[];
}

export interface ImageMetadata {
  width: number;
  height: number;
  hasAlpha: boolean;
}

export interface AssetSummary {
  /** Dosya yollarından türetilen fakat istemcinin anlam yüklememesi gereken kimlik. */
  id: string;
  /** Repo köküne göre POSIX biçimli yol. */
  path: string;
  rootId: string;
  name: string;
  kind: AssetKind;
  format: string;
  role: AssetRole;
  bytes: number;
  modifiedAt: string;
  revision: string;
  gitStatus?: GitStatus;
  relation?: AssetRelation;
  image?: ImageMetadata;
  problemCodes: ProblemCode[];
}

export interface AssetRootSummary {
  id: string;
  path: string;
  role: AssetRole;
  kinds: AssetKind[];
  available: boolean;
}

export interface ProjectResponse {
  schemaVersion: 1;
  name: string;
  roots: AssetRootSummary[];
  access: {
    network: 'loopback' | 'lan';
    requiresToken: boolean;
  };
}

export interface CatalogResponse {
  revision: number;
  assets: AssetSummary[];
}

export interface AudioMetadata {
  codec: string;
  durationSeconds: number;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  bitRate?: number;
}

export type AssetEvent =
  | { type: 'created'; revision: number; asset: AssetSummary }
  | { type: 'changed'; revision: number; asset: AssetSummary }
  | { type: 'deleted'; revision: number; assetId: string }
  | { type: 'resync'; revision: number };

/**
 * Sunucunun üretebileceği bütün hata kodları.
 *
 * Tip değil DİZİ: istemci hangi kodu çevirebildiğini kendi elle tuttuğu bir
 * listeden okuyordu; sunucuya yeni kod eklendiğinde o liste sessizce geride
 * kalıyor ve kullanıcı genel "istek başarısız" metnini görüyordu. Kapı artık
 * bu tek listeyi hem istemciye hem i18n parite testine veriyor.
 */
export const API_ERROR_CODES = [
  'asset_not_found',
  'asset_conflict',
  'asset_too_large',
  'asset_readonly',
  'path_outside_workspace',
  'unsupported_format',
  'decode_failed',
  'invalid_request',
  'range_not_satisfiable',
  'configuration_invalid',
  'authentication_required',
  'editor_lease_required',
  'editor_lease_conflict',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    details?: Record<string, unknown>;
  };
}

/** `GET /assets/:id/raster` yanıt başlıklarının gövdesiz özeti. */
export interface RasterInfo {
  width: number;
  height: number;
  revision: string;
  /** İlk normalize kaydında düşecek metadata alanları (icc, exif…). */
  strippedMetadata: string[];
}

export interface SaveTargetRequest {
  assetId: string;
  /** İstemcinin düzenlemeye başladığı revizyon; disk bundan farklıysa kayıt düşer. */
  expectedRevision: string;
  width: number;
  height: number;
  /** Ham RGBA'nın multipart parça adı. */
  payloadPart: string;
}

export interface SaveTransactionRequest {
  transactionId: string;
  targets: SaveTargetRequest[];
}

export interface SaveTargetResult {
  assetId: string;
  revision: string;
  bytes: number;
}

export interface SaveTransactionResponse {
  transactionId: string;
  results: SaveTargetResult[];
}

export interface LeaseResponse {
  clientId: string;
  mode: 'editor' | 'readonly';
  leaseId?: string;
  expiresAt?: string;
}

export interface SessionResponse {
  authenticated: true;
  expiresAt: string;
}
