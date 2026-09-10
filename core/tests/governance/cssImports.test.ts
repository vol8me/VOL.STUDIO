import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * CORE stilinin tüketiciye tek giriş noktası `theme.css`tir
 * (`@volstudio/core/ui/styles.css`). Bölünen ya da yeni eklenen bir stil
 * dosyası oraya ya da onu kullanan bileşene bağlanmazsa derleme hata vermez:
 * bileşen sessizce stilsiz görünür.
 */
const SRC_DIR = resolve(import.meta.dirname, '../../src');
const UI_DIR = join(SRC_DIR, 'ui');

const theme = readFileSync(join(UI_DIR, 'theme.css'), 'utf8');
const themeImports = [...theme.matchAll(/@import url\('\.\/([^']+)'\);/g)].map((m) => m[1]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : entry.name.endsWith('.ts')
      ? [join(dir, entry.name)]
      : [],
  );
}

const componentImports = new Set(
  sourceFiles(SRC_DIR).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/import\s+['"][^'"]*\/([\w-]+\.css)['"]/g)].map(
      (m) => m[1],
    ),
  ),
);

describe('CORE stil girişi', () => {
  it('theme.css’in içe aktardığı her dosya vardır ve tekrar etmez', () => {
    expect(themeImports.filter((name) => !existsSync(join(UI_DIR, name)))).toEqual([]);
    expect(new Set(themeImports).size).toBe(themeImports.length);
  });

  it('ui altında sahipsiz stil dosyası yoktur', () => {
    const orphans = readdirSync(UI_DIR)
      .filter((name) => name.endsWith('.css') && name !== 'theme.css')
      .filter((name) => !themeImports.includes(name) && !componentImports.has(name));
    expect(orphans).toEqual([]);
  });
});
