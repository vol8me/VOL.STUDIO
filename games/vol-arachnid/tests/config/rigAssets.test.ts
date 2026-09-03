import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { arachnidMetadata, arachnidPartUrls } from '@/config/rigAssets';

/**
 * Rig asset'lerinin DİSK paritesi.
 *
 * Parçalar bir dönem `import.meta.glob` ile toplanıyordu: eksik bir PNG
 * derlemede görülürdü. Asset'ler bu paketin `public/` ağacına taşındıktan sonra
 * o garanti bundler'da değil BURADA yaşıyor — metadata'nın vaat ettiği her
 * dosya gerçekten gönderiliyor mu?
 *
 * Fazlalık da hatadır: yeniden adlandırılmış bir parçanın eskisi `public/`
 * altında kalırsa hem bundle'ı şişirir hem bir sonraki okuyucuyu yanıltır.
 * `rig:sync` fazlalığı zaten siler; bu kapı silmenin gerçekten olduğunu söyler.
 */
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const PARTS_DIR = join(PACKAGE_ROOT, 'public/assets/rig/arachnid/parts');

describe('rig asset paritesi', () => {
  it('metadata’daki her parçanın PNG’si gönderilmiş', () => {
    const missing = arachnidMetadata.parts
      .filter((part) => !existsSync(join(PACKAGE_ROOT, 'public', part.file)))
      .map((part) => part.partId);

    expect(missing).toEqual([]);
    expect(arachnidMetadata.parts.length).toBeGreaterThan(0);
  });

  it('public/ altında metadata’da geçmeyen artık PNG yok', () => {
    const expected = new Set(arachnidMetadata.parts.map((part) => basename(part.file)));
    const orphans = readdirSync(PARTS_DIR)
      .filter((file) => file.endsWith('.png') && !expected.has(file))
      .sort();

    expect(orphans).toEqual([]);
  });

  it('parça URL’leri statik asset yolunu gösterir, devtools ağacını değil', () => {
    const urls = Object.values(arachnidPartUrls);

    expect(urls).toHaveLength(arachnidMetadata.parts.length);
    for (const url of urls) {
      expect(url.startsWith('assets/rig/arachnid/parts/'), url).toBe(true);
      expect(url.endsWith('.png'), url).toBe(true);
    }
  });

  it('gönderilen metadata önizleme TAŞIMAZ — yazarlık referansı çalışma zamanına girmez', () => {
    expect(arachnidMetadata.previews).toEqual([]);
  });

  it('her parça kimliği tektir; URL eşlemesi çakışmaz', () => {
    const ids = arachnidMetadata.parts.map((part) => part.partId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(arachnidPartUrls)).toHaveLength(ids.length);
  });
});
