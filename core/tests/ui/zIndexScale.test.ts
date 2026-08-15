import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Katman (z-index) ölçeği tek doğruluk kaynağı olarak theme.css'te tanımlı
 * (bkz. theme.css yorumu). Bu test iki şeyi kilitler: (1) ölçek katmanları
 * gerçekten ARTAN sırada (aksi halde ölçeğin kendisi tutarsız olur), (2) sayfa
 * seviyesi floating/overlay component'leri hardcoded sayı yerine bu token'ları
 * kullanıyor — aksi halde tam da düzeltilen hata (Modal'dan yüksek RadialMenu,
 * Tooltip/CommandPalette/Popup'ın aynı değerde çakışması) sessizce geri gelir.
 */
const theme = readFileSync(resolve(import.meta.dirname, '../../src/ui/theme.css'), 'utf-8');
const overlays = readFileSync(resolve(import.meta.dirname, '../../src/ui/overlays.css'), 'utf-8');
const controls = readFileSync(resolve(import.meta.dirname, '../../src/ui/controls.css'), 'utf-8');
const debugCss = readFileSync(resolve(import.meta.dirname, '../../src/ui/debug.css'), 'utf-8');

const TIERS = ['root', 'float', 'toast', 'dialog', 'dialog-content', 'loading', 'debug'] as const;

function tierValue(name: (typeof TIERS)[number]): number {
  const match = new RegExp(`--vol-z-${name}:\\s*(\\d+);`).exec(theme);
  expect(match, `--vol-z-${name} theme.css'te tanımlı değil`).not.toBeNull();
  return Number(match![1]);
}

describe('Katman (z-index) ölçeği', () => {
  it('tüm tier’lar theme.css’te tanımlı ve ARTAN sırada', () => {
    const values = TIERS.map(tierValue);
    for (let i = 1; i < values.length; i++) {
      expect(
        values[i],
        `--vol-z-${TIERS[i]} (${values[i]}) öncekinden (--vol-z-${TIERS[i - 1]}=${
          values[i - 1]
        }) büyük olmalı`,
      ).toBeGreaterThan(values[i - 1]);
    }
  });

  it('--vol-z-debug diğer tüm tier’lardan kesinlikle yüksek', () => {
    const debug = tierValue('debug');
    for (const name of TIERS) {
      if (name === 'debug') continue;
      expect(debug).toBeGreaterThan(tierValue(name));
    }
  });

  const consumers: Array<[selector: string, token: string, css: string]> = [
    ['.vol-modal', '--vol-z-dialog', overlays],
    ['.vol-command-palette', '--vol-z-dialog', overlays],
    ['.vol-tooltip', '--vol-z-dialog-content', overlays],
    ['.vol-popup', '--vol-z-dialog-content', overlays],
    ['.vol-rich-tooltip', '--vol-z-dialog-content', overlays],
    ['.vol-loading', '--vol-z-loading', overlays],
    ['.vol-radial-menu', '--vol-z-float', controls],
    ['.vol-diagnostics-panel', '--vol-z-debug', debugCss],
  ];

  it.each(consumers)(
    '%s ölçekten %s token’ını tüketir (hardcoded sayı DEĞİL)',
    (selector, token, css) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
      expect(block, `${selector} bulunamadı`).not.toBeNull();
      expect(block![1]).toMatch(new RegExp(`z-index:\\s*var\\(${token}\\)`));
    },
  );

  it('Tooltip/Popup/RichTooltip (dialog-content), Modal/CommandPalette’den (dialog) YÜKSEK', () => {
    // Bir Modal İÇİNDEKİ butonun tooltip'i modalın arkasında kalmamalı.
    expect(tierValue('dialog-content')).toBeGreaterThan(tierValue('dialog'));
  });
});
