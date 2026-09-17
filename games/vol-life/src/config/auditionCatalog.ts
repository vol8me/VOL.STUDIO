import {
  digestSubstrateCandidate,
  parseSubstrateCandidate,
  type SubstrateCandidate,
} from '@/config/candidate';

/**
 * Development audition kataloğu (F5).
 *
 * Katalog `research-out` altında yaşayan bir ARAŞTIRMA çıktısıdır; üretim
 * derlemesine girmez ve girmediği build testiyle kanıtlanır. Şema burada
 * durur çünkü hem katalogu yazan araştırma betiği hem de onu okuyan dev
 * yükleyici aynı doğrulamayı kullanmak zorundadır: iki ayrı ayrıştırıcı,
 * katalogun digest'iyle gösterdiği genomun sessizce ayrışmasına izin verirdi.
 */
export const AUDITION_CATALOG_SCHEMA_VERSION = 1;

/** Her aday AYNI üç tohumla gösterilir; tohum adaya göre seçilmez. */
export const AUDITION_SEED_COUNT = 3;
export const AUDITION_MIN_ENTRIES = 3;
export const AUDITION_MAX_ENTRIES = 8;

export interface AuditionCatalogEntry {
  readonly digest: string;
  readonly genome: string;
  readonly family: string;
  readonly primaryReason: string;
  readonly phaseDistribution: Readonly<Record<string, number>>;
  readonly metrics: Readonly<Record<string, number>>;
  readonly risks: readonly string[];
  /** Uzun koşu özeti F7'de dolar; audition katalogu ondan önce yazılabilir. */
  readonly longRun?: Readonly<Record<string, number>>;
}

export interface AuditionCatalog {
  readonly schemaVersion: number;
  readonly corpusId: string;
  readonly seeds: readonly number[];
  readonly sourceRevision: string;
  readonly sourceDirty: boolean;
  readonly entries: readonly AuditionCatalogEntry[];
}

export interface AuditionCatalogCandidate extends AuditionCatalogEntry {
  readonly candidate: SubstrateCandidate;
}

export function validateAuditionCatalog(
  catalog: AuditionCatalog,
  particleRadiusUnits: number,
): void {
  if (catalog.schemaVersion !== AUDITION_CATALOG_SCHEMA_VERSION) {
    throw new RangeError(`Katalog şema sürümü desteklenmiyor: ${catalog.schemaVersion}`);
  }
  if (catalog.seeds.length !== AUDITION_SEED_COUNT) {
    throw new RangeError(`Katalog ${AUDITION_SEED_COUNT} tohum taşımalı: ${catalog.seeds.length}`);
  }
  for (const seed of catalog.seeds) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError(`Katalog tohumu uint32 olmalı: ${seed}`);
    }
  }
  if (new Set(catalog.seeds).size !== catalog.seeds.length) {
    throw new RangeError('Katalog tohumları benzersiz olmalı.');
  }
  if (
    catalog.entries.length < AUDITION_MIN_ENTRIES ||
    catalog.entries.length > AUDITION_MAX_ENTRIES
  ) {
    throw new RangeError(
      `Kısa liste ${AUDITION_MIN_ENTRIES}–${AUDITION_MAX_ENTRIES} aday olmalı: ${catalog.entries.length}`,
    );
  }
  if (new Set(catalog.entries.map((entry) => entry.digest)).size !== catalog.entries.length) {
    throw new RangeError('Katalogda aynı digest iki kez bulunamaz.');
  }
  for (const entry of catalog.entries) resolveCatalogEntry(entry, particleRadiusUnits);
}

/**
 * Girişin digest'i genomdan YENİDEN hesaplanır. Katalog elle düzenlenebilir
 * bir dosyadır; digest'i genomla uyuşmayan bir giriş, ekranda bambaşka bir
 * adayı o adayın kimliğiyle gösterirdi.
 */
export function resolveCatalogEntry(
  entry: AuditionCatalogEntry,
  particleRadiusUnits: number,
): AuditionCatalogCandidate {
  const candidate = parseSubstrateCandidate(entry.genome, particleRadiusUnits);
  const digest = digestSubstrateCandidate(candidate);
  if (digest !== entry.digest) {
    throw new RangeError(`Katalog digest'i genomla uyuşmuyor: ${entry.digest} ≠ ${digest}`);
  }
  return { ...entry, candidate };
}

export function parseAuditionCatalog(
  serialized: string,
  particleRadiusUnits: number,
): AuditionCatalog {
  const catalog = JSON.parse(serialized) as AuditionCatalog;
  validateAuditionCatalog(catalog, particleRadiusUnits);
  return catalog;
}

export function serializeAuditionCatalog(catalog: AuditionCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
