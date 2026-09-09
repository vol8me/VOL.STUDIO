import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateCoverageShape } from '../coverageShape.mjs';

function fixture(t, packages) {
  const root = mkdtempSync(join(tmpdir(), 'vol-cov-shape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [pkgDir, files] of Object.entries(packages)) {
    const pkgRoot = join(root, pkgDir);
    mkdirSync(join(pkgRoot, 'coverage'), { recursive: true });
    writeFileSync(join(pkgRoot, 'package.json'), '{"name":"test"}');
    let lcov = '';
    for (const [filePath, { total, covered }] of Object.entries(files)) {
      lcov += `SF:${filePath}\n`;
      for (let i = 1; i <= total; i++) {
        const hit = i <= covered ? 1 : 0;
        lcov += `DA:${i},${hit}\n`;
      }
      lcov += 'end_of_record\n';
    }
    writeFileSync(join(pkgRoot, 'coverage', 'lcov.info'), lcov);
  }
  return root;
}

test('büyük ve düşük kapsamlı dosya gerekçesizse kapı düşer', (t) => {
  const root = fixture(t, {
    'games/a': {
      'src/big.ts': { total: 120, covered: 20 },
    },
  });

  const problems = validateCoverageShape(root, { minLines: 100, floorPct: 50, acknowledged: {} });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /games\/a\/src\/big\.ts/);
  assert.match(problems[0], /taban %50/);
});

test('gerekçeli dosya geçer', (t) => {
  const root = fixture(t, {
    'games/a': {
      'src/big.ts': { total: 120, covered: 20 },
    },
  });

  const problems = validateCoverageShape(root, {
    minLines: 100,
    floorPct: 50,
    acknowledged: {
      'games/a/src/big.ts': 'Phaser sahnesi: mock maliyeti yüksek.',
    },
  });
  assert.deepEqual(problems, []);
});

test('dosya tabanın üstüne çıkınca ölü muafiyet bildirilir', (t) => {
  const root = fixture(t, {
    'games/a': {
      'src/big.ts': { total: 120, covered: 90 },
    },
  });

  const problems = validateCoverageShape(root, {
    minLines: 100,
    floorPct: 50,
    acknowledged: {
      'games/a/src/big.ts': 'eski gerekçe',
    },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ölü gerekçe kaldırılmalı/);
});

test('kısa dosya eşik dışıdır (gürültü engellenir)', (t) => {
  const root = fixture(t, {
    'games/a': {
      'src/small.ts': { total: 40, covered: 0 },
    },
  });

  assert.deepEqual(
    validateCoverageShape(root, { minLines: 100, floorPct: 50, acknowledged: {} }),
    [],
  );
});

test('hiçbir lcov.info yoksa kapı uyarır', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-cov-shape-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const problems = validateCoverageShape(root, {});
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Hiçbir pakette `coverage\/lcov\.info` yok/);
});

test('gerçek repoda her aşım GEREKÇELİ', () => {
  const root = join(import.meta.dirname, '../../..');
  const quality = JSON.parse(readFileSync(join(root, 'quality.json'), 'utf8'));
  const problems = validateCoverageShape(root, quality.coverageShape);
  assert.deepEqual(problems, []);
});
