import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildKit, kitCatalogSource } from '../../scripts/art/kit';

const DIR = join(import.meta.dirname, '../../src/art/kit');

describe('sanat üreteci (scripts/art)', () => {
  const kit = buildKit();

  it('üretim belirlenimcidir: iki çalıştırma aynı metni verir', () => {
    expect(buildKit()).toEqual(kit);
  });

  it('klasördeki SVG dosyaları üretecin çıktısıdır; fazlalık ya da eksik dosya yoktur', () => {
    const onDisk = readdirSync(DIR)
      .filter((name) => name.endsWith('.svg'))
      .map((name) => name.slice(0, -'.svg'.length))
      .sort();
    expect(onDisk).toEqual(Object.keys(kit).sort());
    for (const [name, text] of Object.entries(kit))
      expect(
        readFileSync(join(DIR, `${name}.svg`), 'utf8'),
        `${name}: pnpm art çalıştırılmalı`,
      ).toBe(text);
  });

  it('üretilmiş katalog dosyası SVG kümesinden türer (elle yazılan kimlik listesi yoktur)', () => {
    expect(readFileSync(join(DIR, 'catalog.ts'), 'utf8')).toBe(kitCatalogSource(kit));
  });

  it('her SVG kendi gradyan kimliklerini önekler: iki dosya aynı kimliği paylaşmaz', () => {
    const owner = new Map<string, string>();
    for (const [name, text] of Object.entries(kit))
      for (const match of text.matchAll(/\sid="([^"]+)"/g)) {
        const previous = owner.get(match[1]);
        expect(previous, `${match[1]}: ${previous} ile ${name}`).toBeUndefined();
        owner.set(match[1], name);
      }
  });

  it('viewBox ile width/height eşittir ve kesirli tuval yoktur', () => {
    for (const [name, text] of Object.entries(kit)) {
      const box = /viewBox="0 0 ([\d.]+) ([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(text);
      expect(box, name).not.toBeNull();
      expect(box?.[1], name).toBe(box?.[3]);
      expect(box?.[2], name).toBe(box?.[4]);
      expect(Number.isInteger(Number(box?.[1])) && Number.isInteger(Number(box?.[2])), name).toBe(
        true,
      );
    }
  });
});
