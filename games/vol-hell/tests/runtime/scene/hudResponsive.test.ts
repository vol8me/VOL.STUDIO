import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themePath = resolve(import.meta.dirname, '../../../../../core/src/ui/theme.css');
const themeContent = readFileSync(themePath, 'utf-8');

const scenePath = resolve(import.meta.dirname, '../../../src/runtime/scene/GameScene.ts');
const sceneContent = readFileSync(scenePath, 'utf-8');

describe('HUD responsive — --vol-space-md', () => {
  it('theme.css --vol-space-md değişkeni tanımlı', () => {
    expect(themeContent).toContain('--vol-space-md:');
  });

  it('theme.css --vol-space-xs/sm/lg/xl değişkenleri tanımlı', () => {
    const required = [
      '--vol-space-xs',
      '--vol-space-sm',
      '--vol-space-md',
      '--vol-space-lg',
      '--vol-space-xl',
    ];
    for (const v of required) {
      expect(themeContent, `${v} tanımlı olmalı`).toContain(v + ':');
    }
  });

  it("GameScene HUD container'ları --vol-space-md kullanır — sabit piksel değil", () => {
    expect(sceneContent).toContain('var(--vol-space-md)');
    // Sabit piksel top/left kullanılmamış olmalı (position: absolute ile)
    const absoluteLines = sceneContent
      .split('\n')
      .filter((l) => l.includes('style.top') || l.includes('style.left'));
    for (const line of absoluteLines) {
      if (line.includes('position')) continue;
      // top/left değerleri ya var(--...) ya calc(var(--...)) olmalı — sabit px olmamalı
      expect(line).toMatch(/var\(--vol/);
    }
  });
});
