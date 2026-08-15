import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Dokunmatik minimum hedef boyutu üç dosyaya bölünmüş: token tanımı
 * (`theme.css`, yalnızca `pointer: coarse` altında) ve tüketimi
 * (`primitives.css` — Button/Checkbox, `layout.css` — Tabs). Bu dosyalar
 * ayrışırsa (token silinir ama kullanım kalır, ya da tersi) dokunmatik
 * hedef sessizce devre dışı kalır — jsdom layout/paint hesaplamadığı için
 * bu bir davranış testiyle yakalanamaz, bu yüzden yapısal (metin tabanlı)
 * doğrulama.
 */
const theme = readFileSync(resolve(import.meta.dirname, '../../src/ui/theme.css'), 'utf-8');
const primitives = readFileSync(
  resolve(import.meta.dirname, '../../src/ui/primitives.css'),
  'utf-8',
);
const layout = readFileSync(resolve(import.meta.dirname, '../../src/ui/layout.css'), 'utf-8');

describe('Dokunmatik hedef token senkronu', () => {
  it('--vol-hit-target-min yalnızca pointer:coarse altında bir değer taşır', () => {
    // Bilinçli tasarım: varsayılan (mouse) :root'ta HİÇ tanımlanmaz, bu yüzden
    // min-height/min-width'te `auto`ya düşer — masaüstü görünümü etkilenmez.
    expect(theme).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*:root\s*\{[^}]*--vol-hit-target-min:\s*\d+px/,
    );

    const beforeMediaQuery = theme.split('@media (pointer: coarse)')[0];
    expect(beforeMediaQuery).not.toMatch(/--vol-hit-target-min:/);
  });

  const consumers: Array<[selector: string, css: string]> = [
    ['.vol-button', primitives],
    ['.vol-checkbox', primitives],
    ['.vol-tabs__tab', layout],
  ];

  it.each(consumers)(
    '%s min-height VE min-width ile --vol-hit-target-min tüketir',
    (selector, css) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
      expect(block, `${selector} bulunamadı`).not.toBeNull();
      expect(block![1]).toMatch(/min-height:\s*var\(--vol-hit-target-min,\s*auto\)/);
      expect(block![1]).toMatch(/min-width:\s*var\(--vol-hit-target-min,\s*auto\)/);
    },
  );

  it('.vol-button ve .vol-checkbox artık görünmez ::before overlay KULLANMIYOR', () => {
    // Önceki tasarım (::before + max(100%, token)) sıkı gruplu component'lerde
    // (ör. button-group gap, tab list gap) komşularla örtüşebiliyordu — gerçek
    // kutu boyutuna (min-height/min-width) geçildi, bkz. yukarıdaki test.
    expect(primitives).not.toMatch(/\.vol-button::before/);
    expect(primitives).not.toMatch(/\.vol-checkbox::before/);
  });
});
