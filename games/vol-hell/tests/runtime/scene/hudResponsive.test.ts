import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themePath = resolve(import.meta.dirname, '../../../../../core/src/ui/theme.css');
const themeContent = readFileSync(themePath, 'utf-8');

const stylesPath = resolve(import.meta.dirname, '../../../src/styles.css');
const stylesContent = readFileSync(stylesPath, 'utf-8');

const scenePath = resolve(import.meta.dirname, '../../../src/runtime/scene/GameScene.ts');
const sceneContent = readFileSync(scenePath, 'utf-8');

const hudStatsPath = resolve(import.meta.dirname, '../../../src/runtime/ui/HUDStats.ts');
const hudStatsContent = readFileSync(hudStatsPath, 'utf-8');

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

  it("HUD slot'ları CSS'te --vol-space-md kullanır — sabit piksel değil", () => {
    const slotBlock = /\.vol-hud__slot\s*\{([^}]*)\}/.exec(stylesContent);
    expect(slotBlock, '.vol-hud__slot tanımlı olmalı').not.toBeNull();
    expect(slotBlock![1]).toContain('var(--vol-space-md)');

    const statsBlock = /\.vol-hud-stats\s*\{([^}]*)\}/.exec(stylesContent);
    expect(statsBlock, '.vol-hud-stats tanımlı olmalı').not.toBeNull();
    expect(statsBlock![1]).toContain('var(--vol-space-md)');
  });

  it('HUD stilleri TS içinde satır içi yazılmaz — tasarım sistemi baypas edilmez', () => {
    // O21: style.cssText ve sabit piksel top/left atamaları CSS'e taşındı.
    expect(hudStatsContent).not.toContain('style.cssText');
    expect(sceneContent).not.toContain('style.position');
    expect(sceneContent).not.toContain('style.top');
    expect(sceneContent).not.toContain('style.left');
  });

  it('HUD ölçüleri config üzerinden CSS custom property olarak verilir', () => {
    expect(sceneContent).toContain('--vol-hud-bar-width');
    expect(sceneContent).toContain('--vol-hud-dash-offset');
    expect(stylesContent).toContain('var(--vol-hud-bar-width)');
    expect(stylesContent).toContain('var(--vol-hud-dash-offset)');
  });
});
