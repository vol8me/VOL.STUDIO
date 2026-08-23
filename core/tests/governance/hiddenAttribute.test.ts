import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `hidden` attribute'u koruma bekçisi.
 *
 * `[hidden] { display: none }` bir UA stilidir ve yazar stillerindeki her
 * `display` bildirimi onu ezer. Bu yüzden CORE tek merkezi bir kural taşır;
 * kural kaldırılırsa `element.hidden = true` yapan her bileşen sessizce
 * görünür kalır ve hiçbir test bunu yakalamaz.
 */
describe('hidden attribute koruması', () => {
  it('CORE temel stili global [hidden] kuralını taşır', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../src/ui/base.css'), 'utf8');
    const rule = /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/;

    expect(rule.test(source), '`[hidden] { display: none !important }` kuralı kayboldu').toBe(true);
  });

  it('theme.css tüketiciye base.css ile birlikte gelir', () => {
    // Kural yalnız `base.css` içindedir; `theme.css` onu içe aktarmazsa
    // tüketiciler kuralı hiç almaz.
    const theme = readFileSync(resolve(import.meta.dirname, '../../src/ui/theme.css'), 'utf8');
    expect(theme).toContain('base.css');
  });
});
