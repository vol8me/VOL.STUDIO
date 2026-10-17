import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as core from '../../src/index';

/**
 * `core/docs/*.md` primitifleri ADLARIYLA anlatır. Bir export yeniden
 * adlandırılır ya da silinirse belge sessizce yalan söylemeye başlar: yanlış
 * doküman derlenmez, test edilmez, kimse fark etmez. Bu kapı belgedeki başlık
 * adlarını gerçek yüzeye bağlar.
 */
const DOCS_DIR = join(import.meta.dirname, '../../docs');

/**
 * Belgelerde adı geçip yüzeyde OLMAYAN, ama kasıtlı olan başlıklar. Bugün
 * BOŞ — her başlık gerçek bir export'a düşüyor. Bir kalem eklenirse neden
 * export olmadığını yazar, ve aşağıdaki ters kapı onu ölü kalmaktan korur.
 */
const NOT_EXPORTED = new Map<string, string>();

/** `### \`Ad\`` ya da `### \`fn(...)\`` biçimindeki başlıkların sembol adı. */
function documentedSymbols(file: string): string[] {
  const text = readFileSync(join(DOCS_DIR, file), 'utf8');
  const names: string[] = [];
  for (const match of text.matchAll(/^#{2,3} `([A-Za-z_$][A-Za-z0-9_$]*)/gm)) {
    names.push(match[1]);
  }
  return names;
}

const DOC_FILES = readdirSync(DOCS_DIR).filter((name) => name.endsWith('.md'));

describe('core/docs sembol parite', () => {
  it('belge dizini boş değildir', () => {
    expect(DOC_FILES.length).toBeGreaterThan(0);
  });

  it.each(DOC_FILES)('%s içindeki her sembol başlığı CORE yüzeyinde vardır', (file) => {
    const surface = new Set(Object.keys(core));
    const eksik = documentedSymbols(file).filter(
      (name) => !surface.has(name) && !NOT_EXPORTED.has(name),
    );
    expect(eksik).toEqual([]);
  });

  it('music-engine.md API tablosundaki her metot MusicEngine üzerinde vardır', () => {
    const text = readFileSync(join(DOCS_DIR, 'music-engine.md'), 'utf8');
    const table = text.slice(text.indexOf('## MusicEngine API'), text.indexOf('## Çapraz Geçiş'));
    const documented = [...table.matchAll(/^\|\s*`([A-Za-z_$][A-Za-z0-9_$]*)\(/gm)].map(
      (m) => m[1],
    );
    expect(documented.length).toBeGreaterThan(5);
    const eksik = documented.filter(
      (name) =>
        typeof (core.MusicEngine.prototype as unknown as Record<string, unknown>)[name] !==
        'function',
    );
    expect(eksik).toEqual([]);
  });

  it('muafiyet listesi ölü kalmaz: muaf bir ad yüzeye girerse muafiyet düşer', () => {
    const surface = new Set(Object.keys(core));
    const gereksiz = [...NOT_EXPORTED.keys()].filter((name) => surface.has(name));
    expect(gereksiz).toEqual([]);
  });
});
