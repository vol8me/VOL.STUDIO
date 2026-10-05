import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validateQualityConfig,
  validateQualityWorkspaceParity,
  validateActiveGameBudgets,
  COVERAGE_KEYS,
} from '../config.mjs';

/**
 * `quality.json` kalite kapılarının tek doğruluk kaynağı: paket `vitest.config.ts`
 * ve `workspace-contract.mjs` onu okur. Şeması doğrulanmazsa bir yazım hatası
 * (`floor` → `flor`) bekçiyi `TypeError: Cannot convert undefined or null to
 * object` ile düşürüyordu — kapı kırılıyordu ama hatayı okuyan kişi
 * `quality.json`a bakması gerektiğini anlayamıyordu.
 */
const REAL_CONFIG = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../quality.json'), 'utf-8'),
);

function validPackage() {
  return { lines: 80, statements: 80, branches: 70, functions: 75 };
}

function validConfig() {
  return {
    floor: { lines: 50, statements: 50, branches: 50, functions: 40 },
    packages: { '@volstudio/core': validPackage() },
  };
}

describe('quality.json şema doğrulaması', () => {
  it('repodaki gerçek quality.json geçerlidir', () => {
    assert.deepEqual(validateQualityConfig(REAL_CONFIG), []);
  });

  it('belge rolü ve bütçesi aynı quality şemasında doğrulanır', () => {
    const broken = structuredClone(REAL_CONFIG);
    broken.documentation.paths[0].role = 'unlimited';
    assert.ok(
      validateQualityConfig(broken).some((problem) => problem.includes('documentation.paths')),
    );
  });

  it('floor anahtarındaki yazım hatası teşhis edilebilir mesaj verir', () => {
    // Gerçek senaryo: `floor` yerine `flor` yazıldı.
    const broken = validConfig();
    broken.flor = broken.floor;
    delete broken.floor;

    const problems = validateQualityConfig(broken);
    assert.equal(problems.length, 1);
    assert.ok(problems[0].includes('floor'));
    assert.ok(problems[0].includes('nesne olmalı'));
  });

  it('eksik metrikler TEK TEK ve HEPSİ birden bildirilir', () => {
    // İlk hatada durmak, bozuk bir dosyayı düzeltmeyi n turluk bir döngüye
    // çevirir; sorunlar toplanır.
    const broken = validConfig();
    broken.packages = { '@volstudio/core': { lines: 80 } };

    const problems = validateQualityConfig(broken);
    assert.equal(problems.length, 3);
    for (const key of ['statements', 'branches', 'functions']) {
      assert.ok(problems.some((p) => p.includes(key)));
    }
  });

  it('metrik sayı değilse ya da yüzde aralığı dışındaysa yakalanır', () => {
    const broken = validConfig();
    broken.packages = {
      '@volstudio/core': { ...validPackage(), lines: '80', branches: 140 },
    };

    const problems = validateQualityConfig(broken);
    assert.equal(
      problems.some((p) => p.includes('lines') && p.includes('sayı olmalı')),
      true,
    );
    assert.ok(problems.some((p) => p.includes('branches') && p.includes('0-100')));
  });

  it('tanınmayan metrik adı yakalanır (sessizce yok sayılmaz)', () => {
    // `lines` yerine `line` yazmak eşiği sessizce devre dışı bırakırdı.
    const broken = validConfig();
    broken.packages = { '@volstudio/core': { ...validPackage(), line: 90 } };

    const problems = validateQualityConfig(broken);
    assert.ok(problems.some((p) => p.includes('line') && p.includes('tanınmayan')));
  });

  it('gerekçesiz muafiyet reddedilir', () => {
    const broken = validConfig();
    broken.exempt = { '@volstudio/vol-ui': '' };

    const problems = validateQualityConfig(broken);
    assert.ok(problems.some((p) => p.includes('Sessiz muafiyet yok')));
  });

  it('aynı paket hem muaf hem eşikli olamaz', () => {
    const broken = validConfig();
    broken.exempt = { '@volstudio/core': 'gerekçe' };

    const problems = validateQualityConfig(broken);
    assert.ok(problems.some((p) => p.includes('belirsiz')));
  });

  it('boş packages reddedilir — eşiksiz repo kapsam gerilemesini yakalamaz', () => {
    const broken = validConfig();
    broken.packages = {};

    assert.ok(validateQualityConfig(broken).some((p) => p.includes('boş')));
  });

  it('COVERAGE_KEYS gerçek config ile senkron', () => {
    // Bekçi ile veri ayrışırsa doğrulama anlamsızlaşır.
    const packages = REAL_CONFIG.packages;
    for (const [name, block] of Object.entries(packages)) {
      assert.deepEqual(Object.keys(block).sort(), [...COVERAGE_KEYS].sort(), name);
    }
  });

  it('coverageShape geçersiz tipleri ve boş gerekçeleri reddeder', () => {
    const broken = validConfig();
    broken.coverageShape = 'string';
    assert.ok(validateQualityConfig(broken).some((p) => p.includes('coverageShape: nesne olmalı')));

    const brokenNumbers = validConfig();
    brokenNumbers.coverageShape = { minLines: -5, floorPct: 150 };
    const problems = validateQualityConfig(brokenNumbers);
    assert.ok(problems.some((p) => p.includes('minLines') && p.includes('pozitif tam sayı')));
    assert.ok(problems.some((p) => p.includes('floorPct') && p.includes('0-100')));

    const brokenAck = validConfig();
    brokenAck.coverageShape = { acknowledged: { 'some/file.ts': '   ' } };
    assert.ok(validateQualityConfig(brokenAck).some((p) => p.includes('Sessiz muafiyet yok')));
  });

  it('bundle bütçesinde yanlış metrik sessizce atlanmaz', () => {
    const broken = validConfig();
    broken.bundles = { 'games/sample-game': { app: 140, vendor: 370, cs: 25 } };
    const problems = validateQualityConfig(broken);
    assert.ok(problems.some((p) => p.includes('bundles') && p.includes('cs')));
    assert.ok(problems.some((p) => p.includes('css')));
  });

  it('aktif oyunun boş performans kapıları reddedilir', () => {
    const config = validConfig();
    assert.deepEqual(validateActiveGameBudgets(config, ['games/sample-game']), [
      'games/sample-game: aktif oyun için bundle bütçesi yok',
      'games/sample-game: aktif oyun için scaling bütçesi yok',
    ]);
  });

  it('ölçekleme tarifi ve oranı geçerli olmalı', () => {
    const config = validConfig();
    config.scaling = { 'games/sample-game': { snapshot40Over10: 0 } };
    const problems = validateQualityConfig(config);
    assert.ok(problems.some((problem) => problem.includes('$measure')));
    assert.ok(problems.some((problem) => problem.includes('snapshot40Over10')));
  });

  it('kapsam koşularının birleşimi her eşikli aktif paketi ölçer', () => {
    const broken = validConfig();
    broken.coverageRuns = {
      coverage: { exclude: ['@volstudio/core'] },
      'coverage-audio': { only: ['@volstudio/yeni'] },
    };
    assert.ok(
      validateQualityWorkspaceParity(broken, ['@volstudio/core']).some((p) =>
        p.includes('@volstudio/core: hiçbir kapsam koşusu'),
      ),
    );
  });

  it('workspace ile quality kayıtlarının iki yönlü paritesini korur', () => {
    const config = validConfig();

    assert.deepEqual(validateQualityWorkspaceParity(config, ['@volstudio/core']), []);

    assert.deepEqual(
      validateQualityWorkspaceParity(config, ['@volstudio/core', '@volstudio/yeni']),
      [
        '@volstudio/yeni: workspace paketi quality.json içinde eşik veya gerekçeli muafiyet taşımıyor.',
      ],
    );

    assert.deepEqual(validateQualityWorkspaceParity(config, []), [
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
    );

    const shadowed = Object.keys(manifest.scripts).filter((name) => PNPM_BUILTINS.includes(name));

    assert.deepEqual(
      shadowed,
      [],
      'Bu script adları pnpm yerleşik komutları tarafından gölgelenir ve ' +
        '`pnpm <ad>` onlara ULAŞMAZ. Sonuna bir ek koy (ör. "doctor:env").',
    );
  });
});
