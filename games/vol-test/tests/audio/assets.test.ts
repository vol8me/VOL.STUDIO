import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { audioUrl, blastPath, FAMILIES } from '@/audio/assets';
import { AUDIO } from '@/config/audio';
import { WEAPON_STYLES } from '@/config/tank';

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

  it('top ailesi yalnız kabuk ve ağır mermiye kalır; diğer her stilin kendi atış dosyası vardır', () => {
    const own = WEAPON_STYLES.filter((style) => AUDIO.shotAsset[style] !== undefined);
    expect(WEAPON_STYLES.filter((style) => !own.includes(style))).toEqual(['shell', 'slug']);
    for (const style of own) {
      const file = `${AUDIO.loopAssetRoot}/${AUDIO.shotAsset[style]}.ogg`;
      expect(existsSync(resolve(packageRoot, file))).toBe(true);
    }
  });

  it('döngü ve olay sesleri gönderilir', () => {
    const names = [
      'engine-idle',
      'engine-drive',
      'engine-surge',
      'tracks',
      'legs',
      'steps',
      'fans',
      'bounds',
      'servo',
      'skid',
      'boost',
      ...Object.values(AUDIO.eventAsset),
    ];
    for (const name of names) {
      expect(existsSync(resolve(packageRoot, `${AUDIO.loopAssetRoot}/${name}.ogg`))).toBe(true);
    }
  });

  it('public önekini çalışma zamanı URL’sine taşımaz', () => {
    expect(audioUrl('public/assets/audio/ui/steel/pause.ogg')).toBe(
      `${import.meta.env.BASE_URL}assets/audio/ui/steel/pause.ogg`,
    );
  });
});
