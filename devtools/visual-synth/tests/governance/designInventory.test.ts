import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FIELD_KINDS } from '../../src/schema';

/**
 * DESIGN.md §4 primitif envanteri elle yazılır; şema ise koddur. İkisi
 * ayrışırsa belge sessizce yalan söyler — ve bunu kimse fark etmez, çünkü
 * yanlış belge derlenmez. Bu test envanteri şemaya BAĞLAR.
 */
const DESIGN = readFileSync(fileURLToPath(new URL('../../DESIGN.md', import.meta.url)), 'utf8');

/**
 * §4.1–§4.4 tablolarının ilk sütunundaki `kind` değerleri. §4.5/§4.6 kapsam
 * DIŞIDIR: onlar alan düğümü değil, boru hattı aşamalarıdır (§3).
 */
function documentedKinds(): string[] {
  const section = DESIGN.slice(DESIGN.indexOf('### 4.1'), DESIGN.indexOf('### 4.5'));
  const kinds = new Set<string>();
  for (const match of section.matchAll(/`([a-z][a-zA-Z0-9.]*)(?:\([^`]*\))?`/g)) {
    kinds.add(match[1]);
  }
  return [...kinds].sort();
}

describe('DESIGN.md primitif envanteri', () => {
  it('şemadaki her `kind` belgede yazılıdır', () => {
    const documented = new Set(documentedKinds());
    const eksik = FIELD_KINDS.filter((kind) => !documented.has(kind));
    expect(eksik).toEqual([]);
  });

  it('envanterde şemada olmayan nokta-adlı düğüm yoktur', () => {
    // Serbest metinde `freq` gibi PARAMETRE adları da backtick'lidir; onları
    // ayıklamak için yalnız ad-uzaylı (`sdf.box` gibi) adlar sınanır.
    const known = new Set<string>(FIELD_KINDS);
    const fazla = documentedKinds().filter((kind) => kind.includes('.') && !known.has(kind));
    expect(fazla).toEqual([]);
  });

  it('envanter boş bir eşleşmeyle sessizce geçemez', () => {
    expect(documentedKinds().length).toBeGreaterThan(20);
  });
});
