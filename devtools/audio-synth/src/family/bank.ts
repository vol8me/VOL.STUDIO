import { AudioParamError } from '../guard/errors';
import { checkArray, checkNumber, checkObject } from '../guard/read';
import { HASH_PATTERN, type Sha256 } from '../protocol/canonical';

export const SOUND_FAMILY_BANK_SCHEMA = 'SoundFamilyBankV1';
export const BANK_LOOKUP_CONTRACT = 'sound-family-lookup-v1';
export const BANK_CHOICE_METHOD = 'fnv1a32-mod-v1';

/**
 * Offline üretilmiş ses ailesinin çalışma zamanı sözleşmesi. Tüketici
 * `audio-synth` kodunu çalıştırmaz: bank JSON'u + asset dosyaları yeterlidir.
 *
 * Arama sözleşmesi (`sound-family-lookup-v1`):
 * 1. Tam anahtar: `variants[].key` tekildir; dizi konumu anlam taşımaz.
 * 2. Süzme: istenen her rol (`roles[eksen] === değer`) ve her etiket
 *    (`tags` içinde) tutan varyantlar, anahtara göre (UTF-16) sıralı.
 * 3. Deterministik seçim: çağıranın verdiği `token` metninin UTF-8
 *    baytları üzerinde 32-bit FNV-1a (ofset 2166136261, çarpan 16777619);
 *    indeks = özet mod süzülmüş liste uzunluğu. Durum ya da RNG tutulmaz.
 *
 * Bank YALNIZ bütün varyantlar kanonik publish kapısından geçip manifest'leri
 * doğrulandıktan sonra, en son yazılır; eksik varyantlı bir bank oluşmaz.
 */
export interface BankVariantV1 {
  readonly key: string;
  readonly variantId: string;
  readonly roles: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  /** Paket köküne göreli. */
  readonly asset: { readonly path: string; readonly bytes: number; readonly encodedHash: Sha256 };
  readonly manifest: { readonly path: string; readonly hash: Sha256 };
  readonly programHash: Sha256;
  readonly pcmHash: Sha256;
  readonly durationSeconds: number;
  /** Kodek SONRASI ölçüm (gönderilen dosya). */
  readonly loudness: {
    readonly maxMomentaryLufs: number | null;
    readonly integratedLufs: number | null;
    readonly truePeakDbtp: number | null;
  };
  /** Kaynak PCM özetinden küçük bir alt küme; perde yalnız güvenilir ölçüldüyse. */
  readonly descriptors: {
    readonly activeSeconds: number;
    readonly centroidHz: number | null;
    readonly pitchHz: number | null;
  };
}

export interface SoundFamilyBankV1 {
  readonly schema: typeof SOUND_FAMILY_BANK_SCHEMA;
  readonly lookupContract: typeof BANK_LOOKUP_CONTRACT;
  readonly package: string;
  readonly family: {
    readonly familyId: string;
    readonly version: number;
    readonly hash: Sha256;
    readonly seed: number;
    readonly variationPolicy: string;
    /** Repo-göreli aile programı yolu (doğrulama içindir, çalışma zamanı okumaz). */
    readonly path: string;
  };
  readonly quality: { readonly path: string; readonly hash: Sha256; readonly pass: true };
  readonly engine: {
    readonly rendererVersion: number;
    readonly analyzerVersion: number;
    readonly registryHash: Sha256;
  };
  readonly ordering: 'key';
  readonly choice: { readonly method: typeof BANK_CHOICE_METHOD };
  readonly roleAxes: Readonly<Record<string, readonly string[]>>;
  readonly variants: readonly BankVariantV1[];
}

function hash(value: unknown, path: string): Sha256 {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value))
    throw new AudioParamError(path, 'type', 'sha256 özeti', value);
  return value as Sha256;
}

function relative(value: unknown, path: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.startsWith('/') ||
    value.split('/').includes('..')
  ) {
    throw new AudioParamError(path, 'type', 'göreli yol', value);
  }
  return value;
}

/** Yapısal doğrulama; bağlar (manifest, asset, aile) protokol katmanında sınanır. */
export function validateBank(value: unknown): SoundFamilyBankV1 {
  const o = checkObject(value, 'bank', [
    'schema',
    'lookupContract',
    'package',
    'family',
    'quality',
    'engine',
    'ordering',
    'choice',
    'roleAxes',
    'variants',
  ]);
  if (o.schema !== SOUND_FAMILY_BANK_SCHEMA)
    throw new AudioParamError('schema', 'type', `"${SOUND_FAMILY_BANK_SCHEMA}" olmalı`, o.schema);
  if (o.lookupContract !== BANK_LOOKUP_CONTRACT)
    throw new AudioParamError('lookupContract', 'version', BANK_LOOKUP_CONTRACT, o.lookupContract);
  if (o.ordering !== 'key') throw new AudioParamError('ordering', 'type', "'key'", o.ordering);
  const family = checkObject(o.family, 'family', [
    'familyId',
    'version',
    'hash',
    'seed',
    'variationPolicy',
    'path',
  ]);
  hash(family.hash, 'family.hash');
  relative(family.path, 'family.path');
  const quality = checkObject(o.quality, 'quality', ['path', 'hash', 'pass']);
  hash(quality.hash, 'quality.hash');
  if (quality.pass !== true)
    throw new AudioParamError(
      'quality.pass',
      'combination',
      'bank yalnız geçen kalite raporuyla yazılır',
      quality.pass,
    );
  const keys: string[] = [];
  checkArray(o.variants, 'variants').forEach((v, i) => {
    const at = `variants[${i}]`;
    const vo = checkObject(v, at, [
      'key',
      'variantId',
      'roles',
      'tags',
      'asset',
      'manifest',
      'programHash',
      'pcmHash',
      'durationSeconds',
      'loudness',
      'descriptors',
    ]);
    if (typeof vo.key !== 'string') throw new AudioParamError(`${at}.key`, 'type', 'metin', vo.key);
    keys.push(vo.key);
    const asset = checkObject(vo.asset, `${at}.asset`, ['path', 'bytes', 'encodedHash']);
    relative(asset.path, `${at}.asset.path`);
    checkNumber(asset.bytes, `${at}.asset.bytes`, { min: 1, integer: true });
    hash(asset.encodedHash, `${at}.asset.encodedHash`);
    const manifest = checkObject(vo.manifest, `${at}.manifest`, ['path', 'hash']);
    relative(manifest.path, `${at}.manifest.path`);
    hash(manifest.hash, `${at}.manifest.hash`);
    hash(vo.programHash, `${at}.programHash`);
    hash(vo.pcmHash, `${at}.pcmHash`);
  });
  const sorted = [...keys].sort();
  if (keys.some((k, i) => k !== sorted[i]) || new Set(keys).size !== keys.length) {
    throw new AudioParamError(
      'variants',
      'combination',
      'varyantlar anahtara göre sıralı ve tekil olmalı',
      keys,
    );
  }
  return value as SoundFamilyBankV1;
}

/** Sözleşmedeki 32-bit FNV-1a (UTF-8). */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface BankQuery {
  readonly roles?: Readonly<Record<string, string>>;
  readonly tags?: readonly string[];
}

export function filterVariants(bank: SoundFamilyBankV1, query: BankQuery = {}): BankVariantV1[] {
  return bank.variants
    .filter(
      (v) =>
        Object.entries(query.roles ?? {}).every(([axis, value]) => v.roles[axis] === value) &&
        (query.tags ?? []).every((t) => v.tags.includes(t)),
    )
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Referans uygulama; tüketici aynı sözleşmeyi kendi kodunda uygular. */
export function chooseVariant(
  bank: SoundFamilyBankV1,
  query: BankQuery,
  token: string,
): BankVariantV1 | null {
  const candidates = filterVariants(bank, query);
  return candidates.length === 0 ? null : candidates[fnv1a32(token) % candidates.length];
}
