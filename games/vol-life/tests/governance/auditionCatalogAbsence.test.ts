import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serializeAuditionCatalog } from '@/config/auditionCatalog';
import { AUDITION_CATALOG_PATH } from '@/app/auditionCatalog';
import { sampleCatalog } from '../support/auditionCatalogFixture';

/**
 * F5: audition kataloğu ÜRETİM DERLEMESİNDE bulunmaz.
 *
 * Test katalogu gerçekten yazar ve İKİ derleme koşar: üretim derlemesi ile
 * DEV bayraklı derleme. Katalog yolunun dev derlemesinde görünüp üretimde
 * görünmemesi, yokluğun `import.meta.env.DEV` kapısından geldiğini kanıtlar;
 * tek derlemeyle koşan bir test, hiçbir şey bulamayan bozuk bir taramadan
 * ayırt edilemezdi.
 *
 * `NODE_ENV` AÇIKÇA verilir: vitest onu `test` yapar ve Vite o derlemeyi
 * üretim saymaz — miras alınan ortam, sürüm derlemesini ölçmemize engeldir.
 */
const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const TEMP_TEST_DIR = join(PACKAGE_ROOT, 'node_modules/.cache/audition-absence-test');
const TEMP_CATALOG_FILE = join(TEMP_TEST_DIR, 'temp-catalog.json');
const PRODUCTION_DIR = 'dist-audition-prod';
const DEV_FLAGGED_DIR = 'dist-audition-dev';
const MARKER = 'audition-katalog-sızıntı-işareti';

function build(outDir: string, nodeEnv: string): void {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: PACKAGE_ROOT,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: nodeEnv },
  });
}

function filesUnder(outDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else found.push(path);
    }
  };
  walk(join(PACKAGE_ROOT, outDir));
  return found;
}

function filesContaining(outDir: string, needle: string): string[] {
  return filesUnder(outDir)
    .filter((path) => readFileSync(path, 'utf8').includes(needle))
    .map((path) => path.slice(PACKAGE_ROOT.length + 1));
}

beforeAll(() => {
  mkdirSync(TEMP_TEST_DIR, { recursive: true });
  const catalog = sampleCatalog();
  const entries = [{ ...catalog.entries[0], risks: [MARKER] }, ...catalog.entries.slice(1)];
  writeFileSync(TEMP_CATALOG_FILE, serializeAuditionCatalog({ ...catalog, entries }), 'utf8');
  build(PRODUCTION_DIR, 'production');
  build(DEV_FLAGGED_DIR, 'development');
}, 600_000);

afterAll(() => {
  for (const dir of [PRODUCTION_DIR, DEV_FLAGGED_DIR]) {
    rmSync(join(PACKAGE_ROOT, dir), { recursive: true, force: true });
  }
  rmSync(TEMP_TEST_DIR, { recursive: true, force: true });
});

describe('audition kataloğu üretim derlemesinde yok', () => {
  it('tarama çalışıyor — derlemede olan dize bulunuyor', () => {
    expect(filesUnder(PRODUCTION_DIR).length).toBeGreaterThan(0);
    expect(filesContaining(PRODUCTION_DIR, 'life:hud.audition').length).toBeGreaterThan(0);
  });

  it('katalog içeriği hiçbir üretim çıktısında yok', () => {
    expect(filesContaining(PRODUCTION_DIR, MARKER)).toEqual([]);
    expect(filesContaining(PRODUCTION_DIR, sampleCatalog().entries[0].digest)).toEqual([]);
  });

  it('katalog yolu ve dev genom girişi üretim derlemesine girmiyor', () => {
    expect(filesContaining(PRODUCTION_DIR, AUDITION_CATALOG_PATH)).toEqual([]);
    expect(filesContaining(PRODUCTION_DIR, 'research-out')).toEqual([]);
    expect(filesContaining(PRODUCTION_DIR, 'VITE_LIFE_AUDITION_GENOME')).toEqual([]);
  });

  /* Kabul oturumu paneli de araştırma yüzeyidir: üretimde kurulmaz. */
  it('kabul oturumu paneli üretim derlemesinde yok', () => {
    expect(filesContaining(PRODUCTION_DIR, 'vol-life-research__nav')).toEqual([]);
    expect(filesContaining(PRODUCTION_DIR, 'life:research.camera')).toEqual([]);
    expect(filesContaining(DEV_FLAGGED_DIR, 'vol-life-research__nav').length).toBeGreaterThan(0);
  });

  /* Z2 ölçüm kancası da geliştirme aracıdır (görev: "ölçüm kodu üretim bundle'ına girmez"). */
  it('kayıt ölçüm kancası üretim derlemesinde yok', () => {
    expect(filesContaining(PRODUCTION_DIR, '__volLifeStorage')).toEqual([]);
    expect(filesContaining(PRODUCTION_DIR, 'vol-life:snapshot-encode')).toEqual([]);
    expect(filesContaining(DEV_FLAGGED_DIR, '__volLifeStorage').length).toBeGreaterThan(0);
  });

  it('katalog dosyası çıktı ağacına kopyalanmıyor', () => {
    expect(existsSync(join(PACKAGE_ROOT, PRODUCTION_DIR, AUDITION_CATALOG_PATH))).toBe(false);
  });

  /* Yokluğun kaynağı DEV kapısıdır: dev bayraklı derlemede aynı yol GÖRÜNÜR. */
  it('dev bayraklı derlemede katalog yolu görünür', () => {
    expect(filesContaining(DEV_FLAGGED_DIR, AUDITION_CATALOG_PATH).length).toBeGreaterThan(0);
    expect(filesContaining(DEV_FLAGGED_DIR, 'VITE_LIFE_AUDITION_GENOME').length).toBeGreaterThan(0);
  });
});
