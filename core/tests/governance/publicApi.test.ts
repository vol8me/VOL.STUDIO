import { describe, expect, it } from 'vitest';
import * as CoreExports from '../../src/index';

/**
 * CORE public API'sinin VOL.HELL (veya başka bir tüketici) terminolojisi
 * taşımadığını doğrular.
 *
 * Kapsam BİLİNÇLİ olarak dar tutulmuştur: yalnızca `core/src/index.ts`'in
 * export ettiği isimler taranır, dosya İÇERİKLERİ değil. Ham bir substring
 * taraması (`core/src/**`) yanlış pozitif üretir; dosya içeriğindeki
 * "wave" veya "card" kelimeleri meşru domain-nötr terimlerde geçebilir.
 * Aynı sebeple `'wave'` ve `'card'` bu listede YOK: `WaveCounter`
 * (round/dalga sayacı) ve `CardTile`/`CardPicker` (jenerik seçim kartı UI'ı)
 * zaten CORE'un kendi export yüzeyinde meşru, domain-nötr isimler taşıyor.
 */
const FORBIDDEN_DOMAIN_TERMS = ['enemy', 'boss', 'flux', 'spark', 'volhell'] as const;

/**
 * Dosyayı yorum satırları ÇIKARILMIŞ hâlde okur.
 *
 * Bu kuralları AÇIKLAYAN dokümantasyonun kuralı ihlal etmiş sayılması saçmadır
 * (`Diagnostics`in "singleton DEĞİLDİR" diyen JSDoc'u tam da bunu yapıyordu).
 * Atlama satır bazlıdır (`//`, `/*`, ` * ` ile başlayanlar) — kasıtlı olarak
 * tokenizer yazılmadı; kod satırının SONUNDAKİ bir yorum hâlâ taranır, yani
 * hata yönü fazla-raporlamadır.
 */
async function readCode(fullPath: string): Promise<string> {
  const { readFileSync } = await import('node:fs');
  return readFileSync(fullPath, 'utf-8')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

/** `core/src` altındaki tüm `.ts` dosyalarını gezer. */
async function walkCoreSrc(visit: (relPath: string, code: string) => void): Promise<void> {
  const { readdirSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const srcRoot = join(__dirname, '../../src');

  const walk = async (dir: string): Promise<void> => {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.endsWith('.ts')) continue;
      visit(relative(srcRoot, fullPath), await readCode(fullPath));
    }
  };

  await walk(srcRoot);
}

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

  /**
   * Sözlük (vocabulary) bekçisi.
   *
   * Export ADI taraması yetmez: `StatKey = 'damage' | 'speed' | ...` gibi bir
   * tip, adında hiçbir yasaklı terim taşımadan CORE'a bir oyunun sözlüğünü
   * sokar ve tüketiciyi ona bağlar (bu gerçekten oldu: `StatKey`/`STAT_KEYS`/
   * `StatBaseValues` CORE'dan ihraç ediliyordu ve VOL.HELL onları oradan
   * import ediyordu). Bu yüzden değer seviyesinde, DOSYA İÇERİĞİ taranır.
   *
   * Kapsam bilinçli olarak dar: aranan şey tek tek kelimeler değil, oyunun
   * stat/eylem sözlüğünü oluşturan string LİTERALLERİ. Yanlış pozitifleri
   * önlemek için yalnızca tırnak içindeki tam eşleşmeler sayılır — `fire()`
   * ses preseti (bir ses arketipi, oyun fiili değil) ya da `waveforms.ts`
   * içindeki DSP terimleri bu taramaya takılmaz.
   *
   * Yorum satırları atlanır: bu kuralı AÇIKLAYAN dokümantasyonun kuralı
   * ihlal etmiş sayılması saçmadır. Atlama satır bazlıdır (`//`, `/*`, ` * `
   * ile başlayan satırlar) — kasıtlı olarak tokenizer yazılmadı; kod satırının
   * SONUNDAKİ bir yorum hâlâ taranır, yani hata yönü fazla-raporlamadır.
   */
  it('core/src içinde oyunun stat/eylem sözlüğü string literali olarak bulunmamalı', async () => {
    // VOL.HELL'in sözlüğü. Mekanizma CORE'da, bu kelimeler oyunda yaşar
    // (games/vol-hell/src/config/stats.ts, games/vol-hell/src/config/input.ts).
    const GAME_VOCABULARY = ['damage', 'fireRate', 'dash'] as const;

    /**
     * Gerekçeli muafiyet. Boş bırakılmaz: her giriş NEDEN muaf olduğunu
     * yazmak zorundadır, aksi halde bekçi zamanla anlamsızlaşır.
     */
    const EXEMPT: ReadonlyArray<{ prefix: string; reason: string }> = [];

    const offenders: string[] = [];
    await walkCoreSrc((relPath, code) => {
      for (const term of GAME_VOCABULARY) {
        if (!new RegExp(`['"\`]${term}['"\`]`).test(code)) continue;
        if (EXEMPT.some((entry) => relPath.startsWith(entry.prefix))) continue;
        offenders.push(`${relPath} → "${term}"`);
      }
    });

    expect(offenders).toEqual([]);
  });

  /**
   * CORE, tüketicisine GLOBAL bir örnek dayatmamalı.
   *
   * `Diagnostics.getInstance()` tam olarak bunu yapıyordu: ölçüm bağımlılığı
   * imzalarda görünmüyordu (gizli global) ve tek process'te ikinci bir çalışma
   * zamanı — core doğrulaması + oyun + showcase yan yana — imkânsızdı. Tek
   * örnek tercihi TÜKETİCİNİN kararıdır; VOL.HELL onu kendi `app/services.ts`
   * modülünde tutuyor.
   */
  it('CORE sınıfları static getInstance/reset singleton kalıbı taşımamalı', async () => {
    const offenders: string[] = [];
    await walkCoreSrc((relPath, code) => {
      if (/static\s+(getInstance|instance)\b/.test(code)) offenders.push(relPath);
    });

    expect(offenders).toEqual([]);
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
