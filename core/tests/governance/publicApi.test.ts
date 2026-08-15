import { describe, expect, it } from 'vitest';
import * as CoreExports from '../../src/index';

/**
 * CORE public API'sinin VOL.HELL (veya başka bir tüketici) terminolojisi
 * taşımadığını doğrular.
 *
 * Kapsam BİLİNÇLİ olarak dar tutulmuştur: yalnızca `core/src/index.ts`'in
 * export ettiği isimler taranır, dosya İÇERİKLERİ değil. Ham bir substring
 * taraması (`core/src/**`) yanlış pozitif üretir — `audio/synth/waveforms.ts`
 * gibi dosyalar "wave" kelimesini meşru bir DSP teriminde taşır. Aynı sebeple
 * `'wave'` ve `'card'` bu listede YOK: `WaveCounter` (round/dalga sayacı) ve
 * `CardTile`/`CardPicker` (jenerik seçim kartı UI'ı) zaten CORE'un kendi
 * export yüzeyinde meşru, domain-nötr isimler taşıyor.
 */
const FORBIDDEN_DOMAIN_TERMS = ['enemy', 'boss', 'flux', 'spark', 'volhell'] as const;

describe('CORE public API domain-neutral kalmalı', () => {
  it('export edilen isimler VOL.HELL terminolojisi taşımamalı', () => {
    const exportNames = Object.keys(CoreExports);
    expect(exportNames.length).toBeGreaterThan(0);

    const violations = exportNames.flatMap((name) => {
      const lower = name.toLowerCase();
      const hit = FORBIDDEN_DOMAIN_TERMS.find((term) => lower.includes(term));
      return hit ? [`"${name}" export'u domain terimi "${hit}" taşıyor`] : [];
    });

    expect(violations).toEqual([]);
  });

  it('core/src hiçbir yerden games/* veya @volstudio/vol-* import etmemeli', async () => {
    // Statik dosya taraması: import zamanında zaten hata verirdi, ama bu test
    // niyeti açıkça belgeler ve gelecekte yanlışlıkla eklenecek bir importu
    // (görünüşte zararsız bir tip importu bile olsa) CI'da hemen yakalar.
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    const srcRoot = join(__dirname, '../../src');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.endsWith('.ts')) continue;
        const content = readFileSync(fullPath, 'utf-8');
        if (/from\s+['"](\.\.\/)*games\/|@volstudio\/vol-/.test(content)) {
          offenders.push(fullPath);
        }
      }
    };

    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
