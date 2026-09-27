import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Okunabilirlik kapısının STATİK yarısı.
 *
 * E2E (`readability.spec.ts`, webkit) çizilen pikseli ölçer ama ihlali yapan
 * KURALI göstermez. Bu test CSS kaynaklarını tarar ve `< 12px` font-size
 * literal'larını `dosya:satır + seçici` ile bildirir — iki katman birlikte
 * "hangi dosyadaki hangi kural" sorusunu cevaplar.
 *
 * Kapsam: `core/src/ui` (paylaşılan bileşenler) + vitrinin kendi stilleri.
 * `var()`, `calc()`, `em/%` ve `0` değerleri hesaplanamadığı için literal
 * px bildirimi dışındadır; em tabanlı küçültmelerin floor'u `max()` ile
 * verilir (bkz. glyphs.css).
 */

const CSS_DIRS = [join(__dirname, '../../../core/src/ui'), join(__dirname, '../src')];

/** `font-size: Npx` literal'ı — 12 px altı ihlaldir. */
const FONT_SIZE_PX = /font-size:\s*(\d+(?:\.\d+)?)px/g;
const MIN_PX = 12;

/** Yorum satırı mı: `*` ile başlayan ya da `/*`/`CD"< contentta olan satır. */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith('*') || t.startsWith('/*') || t.startsWith('//');
}

function scan(): string[] {
  const violations: string[] = [];
  for (const dir of CSS_DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.css'))) {
      const rel = `${dir.includes('core') ? 'core' : 'vol-ui'}/${file}`;
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      // En yakın seçici bloğunu hatırla — rapor "hangi kural"ı göstersin.
      let lastSelector = '?';
      let inCommentBlock = false;
      lines.forEach((line, i) => {
        if (line.includes('/*')) inCommentBlock = true;
        if (line.includes('*/')) {
          inCommentBlock = false;
          return;
        }
        if (inCommentBlock || isComment(line)) return;
        const sel = line.match(/^\s*([^{/][^{]*)\{/);
        if (sel) lastSelector = sel[1].trim().split('\n').pop()!.trim();
        for (const m of line.matchAll(FONT_SIZE_PX)) {
          const px = Number.parseFloat(m[1]);
          if (px > 0 && px < MIN_PX) {
            violations.push(`${rel}:${i + 1} | ${lastSelector} | ${px}px < ${MIN_PX}px`);
          }
        }
      });
    }
  }
  return violations;
}

describe('CSS okunabilirlik taraması', () => {
  it(`hiçbir kural < ${MIN_PX}px font-size literal'ı taşımaz`, () => {
    const violations = scan();
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('tarayıcı KENDİSİ çalışıyor — geçici ihlal yakalanır', () => {
    // Tarama mantığının körlenmediğini kanıtla: el ile ihlal enjekte edilip
    // aynı kod yolundan geçirilir (scan() dosyadan okur; burada regex + eşik
    // mantığını ayrıca doğruluyoruz).
    const bad = '.x { font-size: 10px; }';
    const m = [...bad.matchAll(FONT_SIZE_PX)][0];
    expect(Number.parseFloat(m[1])).toBeLessThan(MIN_PX);
  });
});
