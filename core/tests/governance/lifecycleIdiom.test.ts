import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CORE'da TEK bir yaşam döngüsü idiomu olsun.
 *
 * `DisposableScope` yazıldı ve testleriyle doğrulandı, ama benimsenmedi:
 * yedi bileşen kendi `(() => void)[]` dizisini elle yönetiyordu. İki idiomun
 * yan yana yaşaması yalnızca stil sorunu değildi — düz dizi versiyonu
 * `for (const cleanup of this.cleanups) cleanup();` ile kapanıyor, yani BİR
 * cleanup fırlatırsa kalan her şey sızıyordu. `DisposableScope` bunu izole
 * eder, ters sırada kapatır ve ikinci `dispose()`u no-op yapar.
 *
 * Bu bekçi yeni bir bileşenin sessizce eski idioma dönmesini engeller.
 *
 * Kapsam CORE ile sınırlı DEĞİL: `DisposableScope` CORE'un public API'sinde ve
 * oyunlar da onu tüketir. Kural yalnızca CORE'da uygulansaydı aynı sızıntı
 * oyun tarafında serbest kalırdı (gerçekten de `AbilityLoadout` öyle kalmıştı).
 */
const SCANNED_ROOTS = [
  join(import.meta.dirname, '../../src'),
  join(import.meta.dirname, '../../../games/vol-hell/src'),
  join(import.meta.dirname, '../../../devtools/vol-ui/src'),
];

/** Elle yönetilen temizlik dizisi kalıpları. */
const AD_HOC_PATTERNS: ReadonlyArray<{ pattern: RegExp; what: string }> = [
  {
    pattern: /:\s*\(\(\) => void\)\[\]/,
    what: 'elle yönetilen `(() => void)[]` temizlik dizisi',
  },
  {
    pattern: /for \(const \w+ of this\.\w*[Cc]leanups\) \w+\(\)/,
    what: 'temizlik dizisini düz `for` ile boşaltma (ilk hatada durur, kalanı sızdırır)',
  },
];

/**
 * Gerekçeli muafiyet. `DisposableScope`in KENDİSİ ve testleri doğal olarak
 * bu kalıplara benzer kod içerebilir.
 */
const EXEMPT: ReadonlyArray<{ prefix: string; reason: string }> = [
  {
    prefix: 'lifecycle/',
    reason: 'Primitifin kendi uygulaması — bu kuralı O tanımlıyor.',
  },
];

function walk(root: string, dir: string, visit: (relPath: string, source: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      walk(root, fullPath, visit);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;
    visit(relative(root, fullPath), readFileSync(fullPath, 'utf-8'));
  }
}

function walkAll(visit: (relPath: string, source: string) => void): void {
  for (const root of SCANNED_ROOTS) walk(root, root, visit);
}

describe('CORE yaşam döngüsü idiomu', () => {
  it('elle yönetilen temizlik dizisi kalmamalı — DisposableScope kullanılır', () => {
    const violations: string[] = [];

    walkAll((relPath, source) => {
      if (EXEMPT.some((entry) => relPath.startsWith(entry.prefix))) return;

      // Yorum satırları atlanır: bu kararı AÇIKLAYAN dokümantasyon, kalıbı
      // tarif etmek zorunda.
      const code = source
        .split('\n')
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
        })
        .join('\n');

      for (const { pattern, what } of AD_HOC_PATTERNS) {
        if (pattern.test(code)) violations.push(`${relPath}: ${what}`);
      }
    });

    expect(violations).toEqual([]);
  });

  it('her muafiyet gerekçe taşır', () => {
    for (const { selector, reason } of EXEMPT.map((e) => ({
      selector: e.prefix,
      reason: e.reason,
    }))) {
      expect(reason.length, `${selector} gerekçesiz`).toBeGreaterThan(20);
    }
  });
});
