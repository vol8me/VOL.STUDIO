import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const stylesPath = resolve(import.meta.dirname, '../src/styles.css');
const stylesContent = readFileSync(stylesPath, 'utf-8');

/** CSS kaynağındaki tüm class selector'leri çıkarır. */
function extractClassSelectors(css: string): string[] {
  // Yorumları temizle — içindeki dosya adları (.ts vb.) yanlış match verir
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors: string[] = [];
  const regex = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let match;
  while ((match = regex.exec(cleaned)) !== null) {
    selectors.push(match[1]);
  }
  return [...new Set(selectors)];
}

describe('vol-ui BEM naming', () => {
  it('tüm class isimleri vol- prefix taşımalı', () => {
    const classes = extractClassSelectors(stylesContent);
    const violations = classes.filter((cls) => !cls.startsWith('vol-'));

    // core UI component'leri vol- prefix kullanır — showcase özel class'ları da öyle olmalı
    expect(violations).toEqual([]);
  });

  it("vol-showcase- class'ları BEM yapısına uygun olmalı", () => {
    const classes = extractClassSelectors(stylesContent).filter((cls) =>
      cls.startsWith('vol-showcase-'),
    );

    // En az bir tane olmalı
    expect(classes.length).toBeGreaterThan(0);

    // Her class en az bir -- veya __ içerebilir ama zorunlu değil
    // Sadece vol- prefix ve kebab-case yeterli
    for (const cls of classes) {
      expect(cls).toMatch(
        /^vol-showcase-[a-z0-9]+(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$/,
      );
    }
  });
});
