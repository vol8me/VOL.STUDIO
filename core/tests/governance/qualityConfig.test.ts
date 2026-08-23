import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateQualityConfig,
  validateQualityWorkspaceParity,
  COVERAGE_KEYS,
} from '../../../scripts/quality/config.mjs';

/**
 * `quality.json` kalite kapılarının tek doğruluk kaynağı: paket `vitest.config.ts`
 * ve `workspace-contract.mjs` onu okur. Şeması doğrulanmazsa bir yazım hatası
 * (`floor` → `flor`) bekçiyi `TypeError: Cannot convert undefined or null to
 * object` ile düşürüyordu — kapı kırılıyordu ama hatayı okuyan kişi
 * `quality.json`a bakması gerektiğini anlayamıyordu.
 */
const REAL_CONFIG = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../quality.json'), 'utf-8'),
) as Record<string, unknown>;

function validPackage(): Record<string, number> {
  return { lines: 80, statements: 80, branches: 70, functions: 75 };
}

function validConfig(): Record<string, unknown> {
  return {
    floor: { lines: 50, statements: 50, branches: 50, functions: 40 },
    packages: { '@volstudio/core': validPackage() },
  };
}

describe('quality.json şema doğrulaması', () => {
  it('repodaki gerçek quality.json geçerlidir', () => {
    expect(validateQualityConfig(REAL_CONFIG)).toEqual([]);
  });

  it('floor anahtarındaki yazım hatası teşhis edilebilir mesaj verir', () => {
    // Gerçek senaryo: `floor` yerine `flor` yazıldı.
    const broken = validConfig();
    broken.flor = broken.floor;
    delete broken.floor;

    const problems = validateQualityConfig(broken);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('floor');
    expect(problems[0]).toContain('nesne olmalı');
  });

  it('eksik metrikler TEK TEK ve HEPSİ birden bildirilir', () => {
    // İlk hatada durmak, bozuk bir dosyayı düzeltmeyi n turluk bir döngüye
    // çevirir; sorunlar toplanır.
    const broken = validConfig();
    broken.packages = { '@volstudio/core': { lines: 80 } };

    const problems = validateQualityConfig(broken);
    expect(problems).toHaveLength(3);
    for (const key of ['statements', 'branches', 'functions']) {
      expect(problems.some((p: string) => p.includes(key))).toBe(true);
    }
  });

  it('metrik sayı değilse ya da yüzde aralığı dışındaysa yakalanır', () => {
    const broken = validConfig();
    broken.packages = {
      '@volstudio/core': { ...validPackage(), lines: '80', branches: 140 },
    };

    const problems = validateQualityConfig(broken);
    expect(problems.some((p: string) => p.includes('lines') && p.includes('sayı olmalı'))).toBe(
      true,
    );
    expect(problems.some((p: string) => p.includes('branches') && p.includes('0-100'))).toBe(true);
  });

  it('tanınmayan metrik adı yakalanır (sessizce yok sayılmaz)', () => {
    // `lines` yerine `line` yazmak eşiği sessizce devre dışı bırakırdı.
    const broken = validConfig();
    broken.packages = { '@volstudio/core': { ...validPackage(), line: 90 } };

    const problems = validateQualityConfig(broken);
    expect(problems.some((p: string) => p.includes('line') && p.includes('tanınmayan'))).toBe(true);
  });

  it('gerekçesiz muafiyet reddedilir', () => {
    const broken = validConfig();
    broken.exempt = { '@volstudio/vol-ui': '' };

    const problems = validateQualityConfig(broken);
    expect(problems.some((p: string) => p.includes('Sessiz muafiyet yok'))).toBe(true);
  });

  it('aynı paket hem muaf hem eşikli olamaz', () => {
    const broken = validConfig();
    broken.exempt = { '@volstudio/core': 'gerekçe' };

    const problems = validateQualityConfig(broken);
    expect(problems.some((p: string) => p.includes('belirsiz'))).toBe(true);
  });

  it('boş packages reddedilir — eşiksiz repo kapsam gerilemesini yakalamaz', () => {
    const broken = validConfig();
    broken.packages = {};

    expect(validateQualityConfig(broken).some((p: string) => p.includes('boş'))).toBe(true);
  });

  it('COVERAGE_KEYS gerçek config ile senkron', () => {
    // Bekçi ile veri ayrışırsa doğrulama anlamsızlaşır.
    const packages = REAL_CONFIG.packages as Record<string, Record<string, number>>;
    for (const [name, block] of Object.entries(packages)) {
      expect(Object.keys(block).sort(), name).toEqual([...COVERAGE_KEYS].sort());
    }
  });

  it('workspace ile quality kayıtlarının iki yönlü paritesini korur', () => {
    const config = validConfig();

    expect(validateQualityWorkspaceParity(config, ['@volstudio/core'])).toEqual([]);

    expect(validateQualityWorkspaceParity(config, ['@volstudio/core', '@volstudio/yeni'])).toEqual([
      '@volstudio/yeni: workspace paketi quality.json içinde eşik veya gerekçeli muafiyet taşımıyor.',
    ]);

    expect(validateQualityWorkspaceParity(config, [])).toEqual([
      '@volstudio/core: quality.json kaydı bayat; karşılık gelen bir workspace paketi bulunamadı.',
    ]);
  });
});

describe('pnpm script adları yerleşik komutlarla çakışmamalı', () => {
  /**
   * `pnpm doctor` pnpm'in KENDİ komutudur ve aynı adlı script'i gölgeler:
   * `"doctor": "just doctor"` yazılıydı ama `pnpm doctor` ona hiç ulaşmıyordu.
   * "just doctor ✓" diye raporlanan çıktı başka bir komuta aitti.
   *
   * Bu, "duplikasyon" gibi görünüp aslında bir ÇÖZÜM olan `doctor:env`in
   * yanlışlıkla silinmesine yol açtı. Bekçi, gölgelenen bir adın geri
   * eklenmesini engeller.
   */
  const PNPM_BUILTINS = [
    'doctor',
    'install',
    'add',
    'remove',
    'update',
    'link',
    'unlink',
    'list',
    'outdated',
    'why',
    'audit',
    'publish',
    'pack',
    'store',
    'exec',
    'dlx',
    'init',
    'import',
    'prune',
    'rebuild',
    'root',
    'bin',
    'env',
    'licenses',
    'patch',
    'deploy',
    'setup',
    'fetch',
    'server',
  ];

  it('kök package.json script adları pnpm yerleşiklerini gölgelemez', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf-8'),
    ) as { scripts: Record<string, string> };

    const shadowed = Object.keys(manifest.scripts).filter((name) => PNPM_BUILTINS.includes(name));

    expect(
      shadowed,
      'Bu script adları pnpm yerleşik komutları tarafından gölgelenir ve ' +
        '`pnpm <ad>` onlara ULAŞMAZ. Sonuna bir ek koy (ör. "doctor:env").',
    ).toEqual([]);
  });
});
