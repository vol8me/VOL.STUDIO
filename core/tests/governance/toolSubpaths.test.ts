import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as Ui from '../../src/ui/index';
import * as Lifecycle from '../../src/lifecycle/index';
import * as I18n from '../../src/i18n/index';
import * as Fonts from '../../src/fonts/index';

describe('Phaser taşımayan araç alt-yolları', () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8'),
  ) as { exports: Record<string, unknown> };

  it('package exports UI, CSS, lifecycle, i18n ve fonts yüzeylerini açıkça tanımlar', () => {
    expect(packageJson.exports).toMatchObject({
      './ui': { import: './src/ui/index.ts', types: './src/ui/index.ts' },
      './ui/styles.css': './src/ui/theme.css',
      './lifecycle': { import: './src/lifecycle/index.ts', types: './src/lifecycle/index.ts' },
      './i18n': { import: './src/i18n/index.ts', types: './src/i18n/index.ts' },
      './fonts': { import: './src/fonts/index.ts', types: './src/fonts/index.ts' },
    });
  });

  it('alt-yollar beklenen bağımsız APIleri gerçekten ihraç eder', () => {
    expect(Ui.SplitPane).toBeDefined();
    expect(Ui.CanvasViewportController).toBeDefined();
    expect(Ui.CommandHistory).toBeDefined();
    expect(Ui.Toolbar).toBeDefined();
    expect(Lifecycle.DisposableScope).toBeDefined();
    expect(I18n.I18n).toBeDefined();
    expect(Fonts.FontManager).toBeDefined();
    expect(Fonts.VOL_FONTS).toBeDefined();
  });

  it('alt-yol barrel dosyaları oyun runtime veya Phaser import etmez', () => {
    const files = [
      '../../src/ui/index.ts',
      '../../src/lifecycle/index.ts',
      '../../src/i18n/index.ts',
      '../../src/fonts/index.ts',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(import.meta.dirname, file), 'utf8');
      expect(source).not.toMatch(/from ['"](?:\.\.\/)*Game|from ['"]phaser|from ['"]games\//);
    }
  });
});
