import { describe, expect, it } from 'vitest';
import {
  parseAuditionCatalog,
  serializeAuditionCatalog,
  validateAuditionCatalog,
} from '@/config/auditionCatalog';
import { particleConfig } from '@/config/particles';
import { candidateVariant, catalogEntry, sampleCatalog } from '../support/auditionCatalogFixture';

const RADIUS = particleConfig.radiusUnits;

describe('audition kataloğu şeması', () => {
  it('geçerli katalog tur atar', () => {
    const catalog = sampleCatalog();
    const parsed = parseAuditionCatalog(serializeAuditionCatalog(catalog), RADIUS);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.seeds).toEqual([11, 22, 33]);
  });

  /* Digest genomdan yeniden hesaplanır: elle düzenlenen katalog yalan söyleyemez. */
  it('digest genomla uyuşmazsa reddeder', () => {
    const catalog = sampleCatalog();
    const entries = [
      { ...catalog.entries[0], digest: 'f'.repeat(16) },
      ...catalog.entries.slice(1),
    ];
    expect(() => validateAuditionCatalog({ ...catalog, entries }, RADIUS)).toThrow(RangeError);
  });

  it('tohum sayısı üç değilse reddeder', () => {
    const catalog = sampleCatalog();
    expect(() => validateAuditionCatalog({ ...catalog, seeds: [1, 2] }, RADIUS)).toThrow(
      RangeError,
    );
    expect(() => validateAuditionCatalog({ ...catalog, seeds: [1, 2, 2] }, RADIUS)).toThrow(
      RangeError,
    );
  });

  it('kısa liste 3–8 aday sınırını aşamaz', () => {
    const catalog = sampleCatalog();
    expect(() =>
      validateAuditionCatalog({ ...catalog, entries: catalog.entries.slice(0, 2) }, RADIUS),
    ).toThrow(RangeError);
    const many = Array.from({ length: 9 }, (_, index) =>
      catalogEntry(candidateVariant(0.8 + index / 100)),
    );
    expect(() => validateAuditionCatalog({ ...catalog, entries: many }, RADIUS)).toThrow(
      RangeError,
    );
  });

  it('aynı digest iki kez bulunamaz', () => {
    const catalog = sampleCatalog();
    const entries = [catalog.entries[0], catalog.entries[0], catalog.entries[1]];
    expect(() => validateAuditionCatalog({ ...catalog, entries }, RADIUS)).toThrow(RangeError);
  });

  it('bilinmeyen şema sürümü reddedilir', () => {
    const catalog = sampleCatalog();
    expect(() => validateAuditionCatalog({ ...catalog, schemaVersion: 99 }, RADIUS)).toThrow(
      RangeError,
    );
  });
});
