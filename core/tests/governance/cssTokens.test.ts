import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tanımsız CSS custom property bekçisi.
 *
 * `var(--vol-color-accent)` gibi var olmayan bir token HATA VERMEZ: tarayıcı
 * onu sessizce boş bırakır, kural düşer ve kimse fark etmez. Stylelint bunu
 * yakalamaz çünkü sözdizimi geçerlidir. Bu bekçi repodaki her `--vol-*`
 * kullanımının bir yerde TANIMLANDIĞINI doğrular.
 */
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'dist-server',
  'coverage',
  '.git',
  'target',
  'test-results',
  'playwright-report',
]);

function collectFiles(directory: string, suffix: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collectFiles(path, suffix, found);
    else if (entry.endsWith(suffix)) found.push(path);
  }
  return found;
}

describe('CSS token bütünlüğü', () => {
  it('kullanılan her --vol-* / --studio-* tokeni tanımlıdır', () => {
    const files = collectFiles(REPO_ROOT, '.css');
    expect(files.length).toBeGreaterThan(0);

    const defined = new Set<string>();
    // Bazı tokenler CSS'te değil ÇALIŞMA ZAMANINDA atanır (ölçü, ilerleme,
    // açı gibi canlı değerler). `setProperty` çağrısı da bir tanımdır.
    for (const file of collectFiles(REPO_ROOT, '.ts')) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/setProperty\([^)]*?(--(?:vol|studio)-[a-z0-9-]+)/g)) {
        defined.add(match[1]);
      }
    }
    const used = new Map<string, string[]>();
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(--(?:vol|studio)-[a-z0-9-]+)\s*:/g)) {
        defined.add(match[1]);
      }
      for (const match of source.matchAll(/var\(\s*(--(?:vol|studio)-[a-z0-9-]+)/g)) {
        const token = match[1];
        const sites = used.get(token) ?? [];
        sites.push(relative(REPO_ROOT, file));
        used.set(token, sites);
      }
    }

    const missing = [...used.entries()]
      .filter(([token]) => !defined.has(token))
      // `var(--x, yedek)` biçiminde yedeği olan kullanımlar bilerek
      // tanımsız olabilir; bu tarama yedeksiz kullanımları hedefler.
      .map(([token, sites]) => `${token} → ${[...new Set(sites)].join(', ')}`);

    expect(missing, `Tanımsız CSS tokenleri:\n${missing.join('\n')}`).toEqual([]);
  });
});
