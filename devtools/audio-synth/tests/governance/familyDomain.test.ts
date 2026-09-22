import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROLE_AXES } from '../../src/family/program';

/**
 * Aile ve bank üretimi oyun alanından BAĞIMSIZDIR. Kanıt bir yasak kelime
 * listesi değil: (1) import sınırı — aile/arama/bank kodu yalnız paketin
 * kendi `src/` ağacını, Node yerleşiklerini ve CORE'un deterministik
 * rastgelelik modülünü görür; (2) şema — rol sözlüğü kapalı ve geneldir,
 * alan ekseni şemaya giremez (program/bank testleri adlı hatayı sınar).
 */
const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const SRC = join(PACKAGE, 'src');
const SCOPE = [
  'src/family',
  'src/search',
  'src/protocol/family.ts',
  'src/protocol/search.ts',
  'src/program/dimensions.ts',
];
const ALLOWED_EXTERNAL = new Set(['@volstudio/core/random']);

function files(path: string): string[] {
  const abs = join(PACKAGE, path);
  if (abs.endsWith('.ts')) return [abs];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(path, e.name)) : e.name.endsWith('.ts') ? [join(abs, e.name)] : [],
  );
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/^(?:import|export)[^'"]*from\s+'([^']+)'/gm)].map((m) => m[1]);
}

describe('aile/arama kodu oyun alanından bağımsız', () => {
  it('import sınırı: yalnız paket src/, node: yerleşikleri ve CORE rastgelelik', () => {
    const offenders: string[] = [];
    for (const file of SCOPE.flatMap(files)) {
      for (const spec of importsOf(file)) {
        if (spec.startsWith('node:') || ALLOWED_EXTERNAL.has(spec)) continue;
        const target = resolve(dirname(file), spec);
        if (spec.startsWith('.') && !relative(SRC, target).startsWith('..')) continue;
        offenders.push(`${relative(PACKAGE, file)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('import sınırı gerçekten tarıyor (kapsam boş değil)', () => {
    const scanned = SCOPE.flatMap(files);
    expect(scanned.length).toBeGreaterThanOrEqual(12);
    expect(scanned.flatMap(importsOf).length).toBeGreaterThan(40);
  });

  it('rol sözlüğü kapalı ve genel: eksen listesi bilinçli bir karar olmadan değişmez', () => {
    expect(ROLE_AXES).toEqual({
      intensity: ['soft', 'medium', 'hard'],
      weight: ['light', 'medium', 'heavy'],
      length: ['short', 'long'],
      speed: ['slow', 'medium', 'fast'],
      wetness: ['dry', 'wet'],
      rarity: ['common', 'alternate', 'rare'],
      onset: ['soft', 'sharp'],
    });
  });
});
