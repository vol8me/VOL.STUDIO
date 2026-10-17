import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Paket belgeleri (README, DESIGN, TODO) dosyaları, betikleri ve dizinleri
 * ADLARIYLA anlatır. Bir dosya taşınınca ya da betik silinince belge sessizce
 * yalan söylemeye başlar ve bir sonraki oturum çözülmüş işin peşine düşer.
 * Bu kapı belgedeki yolları ve `pnpm` betik adlarını gerçek ağaca bağlar.
 */
const PACKAGE = join(import.meta.dirname, '../..');
const REPO = join(PACKAGE, '../..');
const DOCS = ['README.md', 'DESIGN.md', 'TODO.md'] as const;

/**
 * Belgede adı geçen ama bu ağaçta OLMAYAN yollar ve nedenleri. Tarihsel ya da
 * frozen ağaca ait bir anlatım burada gerekçesiyle durur; aşağıdaki ters kapı
 * listenin bayat kalmasına izin vermez.
 */
const HISTORICAL = new Map<string, string>();

const PATH_PATTERN =
  /`((?:src|scripts|tests|core|devtools|games|canaries|reference|audio-[a-z]+)\/[A-Za-z0-9_./-]*[A-Za-z0-9_])`/g;

function documentedPaths(file: string): string[] {
  const text = readFileSync(join(PACKAGE, file), 'utf8');
  return [...new Set([...text.matchAll(PATH_PATTERN)].map((match) => match[1]))];
}

function resolves(path: string): boolean {
  const clean = path.replace(/\/$/, '');
  return (
    existsSync(join(PACKAGE, clean)) ||
    existsSync(join(REPO, clean)) ||
    existsSync(join(PACKAGE, 'src', clean))
  );
}

const scripts = Object.keys(
  (JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { scripts: object }).scripts,
);

describe('paket belgelerinin referansları', () => {
  it.each(DOCS)('%s içindeki her yol gerçek ağaçta vardır', (file) => {
    const missing = documentedPaths(file).filter(
      (path) => !resolves(path) && !HISTORICAL.has(path),
    );
    expect(missing).toEqual([]);
  });

  it('tarihsel istisnalar gerçekten tarihsel (ağaçta yok, belgede var)', () => {
    const everywhere = new Set(DOCS.flatMap(documentedPaths));
    for (const [path, reason] of HISTORICAL) {
      expect(everywhere.has(path), `${path}: ${reason}`).toBe(true);
      expect(resolves(path), `${path} artık var; istisna gereksiz`).toBe(false);
    }
  });

  it.each(DOCS)('%s içinde adı geçen her paket betiği package.json’da vardır', (file) => {
    const text = readFileSync(join(PACKAGE, file), 'utf8');
    const named = [...text.matchAll(/pnpm (?:--filter \S+ )?(audio:[a-z-]+|demo:[a-z-]+)/g)].map(
      (match) => match[1],
    );
    expect(named.filter((name) => !scripts.includes(name))).toEqual([]);
  });

  it('README yapı listesi paketin her üst düzey girdisini anlatır', () => {
    const readme = readFileSync(join(PACKAGE, 'README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('## Yapı'), readme.indexOf('## Doktrin'));
    const ignored = new Set([
      'node_modules',
      'coverage',
      'package.json',
      'tsconfig.json',
      'vitest.config.ts',
    ]);
    const entries = readdirSync(PACKAGE).filter(
      (name) => !name.startsWith('.') && !ignored.has(name) && !name.endsWith('.md'),
    );
    const undocumented = entries.filter(
      (name) => !section.includes(`\`${name}`) && !section.includes(`${name}/`),
    );
    expect(undocumented).toEqual([]);
  });
});
