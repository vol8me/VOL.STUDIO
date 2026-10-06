import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  BASELINE_SCHEMA,
  compareBaselines,
  countLeaves,
  countStatic,
  deviceCells,
  readPerfSummary,
  validateBaseline,
} from '../uiBaseline.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const baseline = (over = {}) => ({
  schema: BASELINE_SCHEMA,
  label: 'ilk-kayit',
  counts: {
    tabs: 2,
    testedTabs: 2,
    showcaseKeys: { en: 5, tr: 5 },
    coreKeys: { en: 3, tr: 3 },
    directConsumers: { classes: 17, helpers: 4 },
  },
  bundles: { pkg: { appBytes: 1000, vendorBytes: 5000, cssBytes: 300 } },
  screens: { chromium: { buttons: HASH_A }, webkit: { buttons: HASH_A } },
  motion: {
    chromium: { buttons: { 'no-preference': { looping: ['spin'] }, reduce: { looping: [] } } },
  },
  devices: deviceCells(),
  ...over,
});

test('yaprak sayımı iç düğümleri saymaz', () => {
  assert.equal(countLeaves({ a: 'x', b: { c: 'y', d: { e: 'z' } } }), 3);
  assert.equal(countLeaves('metin'), 1);
  assert.equal(countLeaves({}), 0);
});

test('depodaki başlangıç sayımı yeniden üretilir: sekme, anahtar, doğrudan tüketici', () => {
  const counts = countStatic(ROOT);
  assert.equal(counts.tabs, 12);
  assert.equal(counts.testedTabs, counts.tabs, 'E2E sekme listesi ürün sekmeleriyle aynı olmalı');
  assert.equal(counts.showcaseKeys.en, counts.showcaseKeys.tr);
  assert.equal(counts.showcaseKeys.en, 830);
  assert.equal(counts.coreKeys.en, counts.coreKeys.tr);
  assert.equal(counts.coreKeys.en, 63);
  assert.equal(counts.directConsumers.classes, 17);
});

test('cihaz hücreleri: Steam Deck ve ölçümsüz cihazlar gerekçeli NOT-RUN', () => {
  const cells = deviceCells();
  assert.equal(cells.steamDeck.status, 'NOT-RUN');
  assert.match(cells.steamDeck.reason, /bağlı değil/);
  for (const name of ['androidTablet', 'samsung', 'android16']) {
    assert.equal(cells[name].status, 'NOT-RUN', name);
    assert.ok(cells[name].reason.length > 10, name);
  }
  // Kayıt cihaz kimliği taşımaz.
  assert.doesNotMatch(JSON.stringify(cells), /serial|seri|adb|[0-9a-f]{12,}/i);
});

test('geçerli kayıt ihlal üretmez', () => {
  assert.deepEqual(validateBaseline(baseline()), []);
});

test('bozuk kayıt reddedilir: şema, etiket, sayım, bayt, özet, gerekçesiz NOT-RUN, Deck hücresi', () => {
  const problems = validateBaseline({
    schema: 'x',
    label: 'Büyük Harf',
    counts: {
      tabs: 3,
      testedTabs: 2,
      showcaseKeys: { en: 5, tr: 6 },
      coreKeys: { en: 1, tr: 2 },
    },
    bundles: { pkg: { appBytes: 1.5, vendorBytes: -1, cssBytes: 'x' } },
    screens: { chromium: { buttons: 'kısa' } },
    devices: { androidTablet: { status: 'NOT-RUN' } },
  });
  for (const pattern of [
    /şema/,
    /etiket/,
    /sekme sayısı 3 ≠ test edilen 2/,
    /vitrin EN\/TR/,
    /CORE EN\/TR/,
    /appBytes/,
    /vendorBytes/,
    /cssBytes/,
    /sha256 değil/,
    /NOT-RUN gerekçesiz/,
    /Steam Deck hücresi yok/,
  ])
    assert.ok(
      problems.some((problem) => pattern.test(problem)),
      String(pattern),
    );
});

test('aynı kayıtlar karşılaştırılınca fark ve kötüleşme yoktur', () => {
  assert.deepEqual(compareBaselines(baseline(), baseline()), { changes: [], regressions: [] });
});

test('bundle büyümesi kötüleşmedir, küçülmesi yalnız farktır', () => {
  const grown = baseline({
    bundles: { pkg: { appBytes: 1010, vendorBytes: 5000, cssBytes: 300 } },
  });
  const shrunk = baseline({
    bundles: { pkg: { appBytes: 900, vendorBytes: 5000, cssBytes: 300 } },
  });
  const up = compareBaselines(baseline(), grown);
  assert.equal(up.regressions.length, 1);
  assert.match(up.regressions[0], /appBytes: 1000 → 1010 \(\+10 B\)/);
  const down = compareBaselines(baseline(), shrunk);
  assert.equal(down.changes.length, 1);
  assert.deepEqual(down.regressions, []);
});

test('ekran özeti değişimi kötüleşmedir; motor ölçüsünün yitimi de', () => {
  const changed = baseline({
    screens: { chromium: { buttons: HASH_B }, webkit: { buttons: HASH_A } },
  });
  const result = compareBaselines(baseline(), changed);
  assert.deepEqual(result.regressions, ['ekran chromium/buttons: piksel özeti değişti']);
  const lost = baseline({ screens: { chromium: { buttons: HASH_A } } });
  const loss = compareBaselines(baseline(), lost);
  assert.ok(loss.regressions.some((line) => /ekranlar webkit: yeni kayıtta yok/.test(line)));
});

test('hareket azaltma: mevcut kusur kötüleşme değil, YENİ süren animasyon kötüleşmedir', () => {
  const withDefect = baseline({
    motion: {
      chromium: {
        buttons: { 'no-preference': { looping: ['spin'] }, reduce: { looping: ['spin'] } },
      },
    },
  });
  // İlk kayıttaki kusur her karşılaştırmada alarm vermez.
  assert.deepEqual(compareBaselines(withDefect, withDefect).regressions, []);
  const worse = baseline({
    motion: {
      chromium: {
        buttons: {
          'no-preference': { looping: ['spin', 'pulse'] },
          reduce: { looping: ['spin', 'pulse'] },
        },
      },
    },
  });
  const result = compareBaselines(withDefect, worse);
  assert.equal(result.regressions.length, 1);
  assert.match(result.regressions[0], /yeni sürekli animasyon \(pulse\)/);
});

test('cihaz durum değişimi ve sayım farkı fark olarak raporlanır', () => {
  const devices = deviceCells();
  const measured = baseline({
    devices: { ...devices, steamDeck: { status: 'measured', note: 'cihaz bağlandı' } },
    counts: { ...baseline().counts, tabs: 3, testedTabs: 3 },
  });
  const result = compareBaselines(baseline(), measured);
  assert.ok(result.changes.some((line) => /cihaz steamDeck: NOT-RUN → measured/.test(line)));
  assert.ok(result.changes.some((line) => /sayım tabs: 2 → 3/.test(line)));
  assert.deepEqual(result.regressions, []);
});

test('ui-perf kaydı yoksa NOT-RUN, varsa özet okunur', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-baseline-'));
  try {
    assert.equal(readPerfSummary(root).status, 'NOT-RUN');
    const directory = join(root, 'devtools/vol-showcase/records/ui-perf');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'chromium-latency.json'),
      JSON.stringify({
        report: {
          hz: 60,
          timerResolutionMs: 0.1,
          scopes: { inputPointer: { distribution: { p95: 31 } }, inputKeyboard: {} },
        },
        verdict: { verdict: 'incomplete' },
      }),
    );
    const summary = readPerfSummary(root);
    assert.equal(summary.status, 'measured');
    assert.deepEqual(summary.records['chromium-latency'], {
      verdict: 'incomplete',
      hz: 60,
      timerResolutionMs: 0.1,
      inputPointerP95Ms: 31,
      inputKeyboardP95Ms: null,
      tabSwitchJsP95Ms: null,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI: bilinmeyen komut kullanım hatasıyla 2 döner, olmayan kayıt 2 döner', () => {
  const cli = join(ROOT, 'scripts/quality/cli/ui-baseline.mjs');
  const usage = spawnSync(process.execPath, [cli], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /Kullanım/);
  const missing = spawnSync(process.execPath, [cli, 'compare', 'yok-bir', 'yok-iki'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /kayıt yok/);
});
