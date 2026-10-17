import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Yükleme ekranı zayıf cihazlarda (Deck, tablet) açılış sırasında çizilir: o sırada GPU/CPU yüklenme işine
 * lazımdır. Bu yüzden stil dosyasında pahalı boyama yolları yasaktır; hareket yalnız transform/opacity ile.
 */
const css = readFileSync(
  resolve(__dirname, '../../../src/ui/overlays/loading.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('yükleme ekranı stil bütçesi', () => {
  it('parlama (drop-shadow/blur), maske ve conic-gradient içermez', () => {
    expect(css).not.toMatch(/drop-shadow\(/);
    expect(css).not.toMatch(/\bblur\(/);
    expect(css).not.toMatch(/\bmask\s*:/);
    expect(css).not.toMatch(/conic-gradient\(/);
  });

  it('animasyonlar yalnız transform ve opacity anahtar karelerini kullanır', () => {
    const keyframes = [
      ...css.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\n\})\s*(?=@|\n\/|\n\.|$)/g),
    ];
    expect(keyframes.length).toBeGreaterThan(5);
    for (const [, body] of keyframes) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const prop of props) expect(['transform', 'opacity']).toContain(prop);
    }
  });

  it('hareket azaltılmışta süs animasyonları kapanır', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});
