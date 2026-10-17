/**
 * Offline üretilmiş ses ailesinin (`SoundFamilyBankV1`) çalışma zamanı
 * okuyucusu. Üretici tarafı audio-synth'tir; tüketici onun kodunu çalıştırmaz,
 * yalnız bank JSON'unu ve asset dosyalarını okur.
 *
 * Arama sözleşmesi `sound-family-lookup-v1`:
 * 1. Tam anahtar: `variants[].key` tekildir.
 * 2. Süzme: istenen her rol (`roles[eksen] === değer`) ve her etiket tutan
 *    varyantlar, anahtara göre (UTF-16) sıralı.
 * 3. Deterministik seçim: `token` metninin UTF-8 baytları üzerinde 32-bit
 *    FNV-1a; indeks = özet mod süzülmüş liste uzunluğu. Durum ya da RNG yok.
 */
export const SOUND_FAMILY_BANK_SCHEMA = 'SoundFamilyBankV1';
export const SOUND_FAMILY_LOOKUP_CONTRACT = 'sound-family-lookup-v1';
const CHOICE_METHOD = 'fnv1a32-mod-v1';

export interface SoundFamilyVariant {
  readonly key: string;
  readonly roles: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  /** Paket köküne göreli asset yolu (`public/assets/audio/...`). */
  readonly path: string;
  readonly durationSeconds: number;
}

export interface SoundFamilyQuery {
  readonly roles?: Readonly<Record<string, string>>;
  readonly tags?: readonly string[];
}

/** 32-bit FNV-1a, metnin UTF-8 baytları üzerinde (ofset 2166136261, çarpan 16777619). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function fail(reason: string): never {
  throw new Error(`SoundFamilyBank: ${reason}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} nesne olmalı`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${path} boş olmayan metin olmalı`);
  return value;
}

function relativePath(value: unknown, path: string): string {
  const result = text(value, path);
  if (result.startsWith('/') || result.split('/').includes('..')) {
    fail(`${path} paket-göreli yol olmalı: ${result}`);
  }
  return result;
}

function parseVariant(value: unknown, index: number): SoundFamilyVariant {
  const path = `variants[${index}]`;
  const variant = record(value, path);
  const roles = record(variant.roles ?? {}, `${path}.roles`);
  for (const [axis, role] of Object.entries(roles)) text(role, `${path}.roles.${axis}`);
  const tags = variant.tags ?? [];
  if (!Array.isArray(tags)) fail(`${path}.tags dizi olmalı`);
  const duration = variant.durationSeconds;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    fail(`${path}.durationSeconds pozitif sayı olmalı`);
  }
  return {
    key: text(variant.key, `${path}.key`),
    roles: roles as Record<string, string>,
    tags: tags.map((tag, tagIndex) => text(tag, `${path}.tags[${tagIndex}]`)),
    path: relativePath(record(variant.asset, `${path}.asset`).path, `${path}.asset.path`),
    durationSeconds: duration,
  };
}

/**
 * Doğrulanmış, değişmez aile bankı. Yapı bozuksa ya da sözleşme sürümü
 * tanınmıyorsa kurulmaz: sessizce yanlış sesi çalmak yerine açılışta düşer.
 */
export class SoundFamilyBank {
  readonly familyId: string;
  readonly variants: readonly SoundFamilyVariant[];
  private readonly byKey: ReadonlyMap<string, SoundFamilyVariant>;

  private constructor(familyId: string, variants: SoundFamilyVariant[]) {
    this.familyId = familyId;
    this.variants = [...variants].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    this.byKey = new Map(this.variants.map((variant) => [variant.key, variant]));
  }

  static parse(value: unknown): SoundFamilyBank {
    const doc = record(value, 'bank');
    if (doc.schema !== SOUND_FAMILY_BANK_SCHEMA) fail(`şema ${String(doc.schema)} tanınmıyor`);
    if (doc.lookupContract !== SOUND_FAMILY_LOOKUP_CONTRACT) {
      fail(`arama sözleşmesi ${String(doc.lookupContract)} tanınmıyor`);
    }
    if (record(doc.choice, 'choice').method !== CHOICE_METHOD) fail('seçim yöntemi tanınmıyor');
    const familyId = text(record(doc.family, 'family').familyId, 'family.familyId');
    if (!Array.isArray(doc.variants) || doc.variants.length === 0) fail('varyant yok');
    const variants = doc.variants.map(parseVariant);
    const keys = new Set<string>();
    for (const variant of variants) {
      if (keys.has(variant.key)) fail(`anahtar iki kez var: ${variant.key}`);
      keys.add(variant.key);
    }
    return new SoundFamilyBank(familyId, variants);
  }

  /** Tam anahtarla varyant. */
  variant(key: string): SoundFamilyVariant | undefined {
    return this.byKey.get(key);
  }

  /** Rolleri ve etiketleri tutan varyantlar, anahtara göre sıralı. */
  filter(query: SoundFamilyQuery = {}): readonly SoundFamilyVariant[] {
    const roles = Object.entries(query.roles ?? {});
    const tags = query.tags ?? [];
    return this.variants.filter(
      (variant) =>
        roles.every(([axis, role]) => variant.roles[axis] === role) &&
        tags.every((tag) => variant.tags.includes(tag)),
    );
  }

  /** Deterministik seçim: aynı token ve sorgu her zaman aynı varyantı verir. */
  choose(token: string, query: SoundFamilyQuery = {}): SoundFamilyVariant | undefined {
    const candidates = this.filter(query);
    if (candidates.length === 0) return undefined;
    return candidates[fnv1a32(token) % candidates.length];
  }
}
