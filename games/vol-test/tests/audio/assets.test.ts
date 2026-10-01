import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioUrl, blastPath, FAMILIES } from '@/audio/assets';

const packageRoot = resolve(import.meta.dirname, '../..');

describe('gönderilen ses bankaları', () => {
  it('her aile varyantını gerçek bir yeni tema assetine bağlar', () => {
    for (const family of Object.values(FAMILIES)) {
      for (const variant of family.variants) {
        expect(variant.path).toContain('/sfx/steel/');
        expect(existsSync(resolve(packageRoot, variant.path))).toBe(true);
      }
    }
  });

  it('her patlama anahtarının üç mesafe dosyasını bulur', () => {
    for (const variant of FAMILIES.blast.variants) {
      expect(blastPath(variant.key, 'near')).toBe(variant.path);
      for (const distance of ['near', 'mid', 'far'] as const) {
        const path = blastPath(variant.key, distance);
        expect(path).toContain('/sfx/steel/');
        expect(existsSync(resolve(packageRoot, path))).toBe(true);
      }
    }
    expect(() => blastPath('missing', 'near')).toThrow('Patlama varyantı bulunamadı');
  });

  it('public önekini çalışma zamanı URL’sine taşımaz', () => {
    expect(audioUrl('public/assets/audio/ui/steel/pause.ogg')).toBe(
      `${import.meta.env.BASE_URL}assets/audio/ui/steel/pause.ogg`,
    );
  });
});
