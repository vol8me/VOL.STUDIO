import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('Forge gerçek kabuk entegrasyonu', () => {
  it('UIRoot tıklama engelini uygulama kökünde açıkça geri alır', () => {
    const coreBase = read('../../../../core/src/ui/base.css');
    const forgeStyles = read('../../src/styles.css');

    expect(coreBase).toMatch(/\.vol-ui-root\s*\{[^}]*pointer-events:\s*none/s);
    expect(forgeStyles).toMatch(/\.vf-app\s*\{[^}]*pointer-events:\s*auto/s);
  });

  it('CORE font dosyalarını yayınlar ve FontManager ile yükler', () => {
    const viteConfig = read('../../vite.config.ts');
    const main = read('../../src/main.ts');

    expect(viteConfig).toContain('../../core/public');
    expect(main).toContain('new FontManager');
    expect(main).toContain("VOL_FONTS['Exo 2']");
    expect(main).toContain('VOL_FONTS.Jura');
  });

  it('Forge yüzeyinde 12px altı bilgi metni bırakmaz', () => {
    const styles = read('../../src/styles.css');
    expect(styles).not.toMatch(/font-size:\s*(?:[0-9]|1[01])px/);
    expect(styles).not.toContain('monospace');
  });

  it('tek ekran sözleşmesinde kip ve Tabs kalıntısı yoktur', () => {
    const editor = read('../../src/Editor.ts');
    const styles = read('../../src/styles.css');
    expect(editor).not.toMatch(/\bTabs\b|advanced|data-mode/);
    expect(styles).not.toMatch(/advanced|vf-bottom|vol-tabs/);
  });
});
