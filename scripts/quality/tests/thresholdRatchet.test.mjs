import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { validateQualityConfig } from '../config.mjs';
import {
  compareThresholds,
  resolveRatchetBase,
  thresholdEntries,
  validateThresholdRatchet,
} from '../thresholdRatchet.mjs';

function config(overrides = {}) {
  return {
    floor: { lines: 50, statements: 50, branches: 50, functions: 40 },
    packages: {
      '@volstudio/core': { lines: 90, statements: 90, branches: 84, functions: 91 },
      '@volstudio/tauri-v2': { lines: 93, statements: 93, branches: 90, functions: 100 },
    },
    exempt: {},
    coverageShape: { minLines: 100, floorPct: 50 },
    ...overrides,
  };
}

function withPackage(base, name, patch) {
  const next = structuredClone(base);
  next.packages[name] = { ...next.packages[name], ...patch };
  return next;
}

describe('eşik ratchet: karşılaştırma', () => {
  it('aynı ya da yükselen eşik sorun üretmez', () => {
    const base = config();
    const raised = withPackage(base, '@volstudio/core', { lines: 94, branches: 86 });
    assert.deepEqual(compareThresholds(base, base), []);
    assert.deepEqual(compareThresholds(base, raised), []);
  });

  it('paket eşiğinin düşürülmesi anahtar, eski ve yeni değerle reddedilir', () => {
    const base = config();
    const lowered = withPackage(base, '@volstudio/core', { lines: 60 });
    const problems = compareThresholds(base, lowered, { label: 'origin/dev@abc' });
    assert.equal(problems.length, 1);
    assert.match(
      problems[0],
      /^packages\["@volstudio\/core"\]\.lines: 90 → 60 \(origin\/dev@abc\)/,
    );
    assert.match(problems[0], /ratchetExceptions/);
  });

  it('tek metriğin düşmesi diğer metrikleri etkilemez', () => {
    const base = config();
    const lowered = withPackage(base, '@volstudio/tauri-v2', { functions: 80, branches: 95 });
    const problems = compareThresholds(base, lowered);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /tauri-v2"\]\.functions: 100 → 80/);
  });

  it('floor tabanının düşürülmesi reddedilir', () => {
    const base = config();
    const lowered = { ...base, floor: { ...base.floor, branches: 30 } };
    const problems = compareThresholds(base, lowered);
    assert.match(problems.join('\n'), /^floor\.branches: 50 → 30/);
  });

  it('paket eşiği kaydının silinmesi reddedilir; yeni paket sorun değildir', () => {
    const base = config();
    const removed = structuredClone(base);
    delete removed.packages['@volstudio/tauri-v2'];
    const problems = compareThresholds(base, removed);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^packages\["@volstudio\/tauri-v2"\]: kapsam eşiği kaydı silindi/);

    const added = withPackage(base, '@volstudio/new', {
      lines: 10,
      statements: 10,
      branches: 10,
      functions: 10,
    });
    assert.deepEqual(compareThresholds(base, added), []);
  });

  it('yeni muafiyet reddedilir; var olan muafiyet sorun değildir', () => {
    const base = config({ exempt: { '@volstudio/old': 'gerekçe' } });
    const same = structuredClone(base);
    assert.deepEqual(compareThresholds(base, same), []);

    const added = config({ exempt: { '@volstudio/old': 'gerekçe', '@volstudio/new': 'başka' } });
    const problems = compareThresholds(base, added);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^exempt\["@volstudio\/new"\]: yeni muafiyet eklendi/);
  });

  it('atlama bütçesi artarsa ya da yeni pozitif anahtar eklenirse reddedilir; düşme ve sıfır serbesttir', () => {
    const base = config({
      skipBudget: { e2e: { 'a/webkit/main': 16 }, contract: { 'node-test': 2 } },
    });
    const lowered = structuredClone(base);
    lowered.skipBudget.e2e['a/webkit/main'] = 10;
    lowered.skipBudget.e2e['a/chromium/main'] = 0;
    assert.deepEqual(compareThresholds(base, lowered), []);

    const raised = structuredClone(base);
    raised.skipBudget.e2e['a/webkit/main'] = 17;
    const problems = compareThresholds(base, raised);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^skipBudget\["e2e"\]\["a\/webkit\/main"\]: 16 → 17/);

    const added = structuredClone(base);
    added.skipBudget.e2e['b/webkit/main'] = 1;
    const addedProblems = compareThresholds(base, added);
    assert.equal(addedProblems.length, 1);
    assert.match(
      addedProblems[0],
      /^skipBudget\["e2e"\]\["b\/webkit\/main"\]: yeni atlama bütçesi 1/,
    );

    added.ratchetExceptions = [
      { key: 'skipBudget["e2e"]["b/webkit/main"]', to: 1, reason: 'Yeni motor şeridi.' },
    ];
    assert.deepEqual(compareThresholds(base, added), []);
  });

  it('taban hiç atlama bütçesi taşımıyorsa ilk benimseme gevşeme sayılmaz', () => {
    const base = config();
    const adopted = config({ skipBudget: { e2e: { 'a/webkit/main': 16 } } });
    assert.deepEqual(compareThresholds(base, adopted), []);
  });

  it('şekil sınırı gevşerse reddedilir (minLines artar, floorPct düşer)', () => {
    const base = config();
    const loosened = { ...base, coverageShape: { minLines: 200, floorPct: 30 } };
    const problems = compareThresholds(base, loosened);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /coverageShape\.minLines: 100 → 200/);
    assert.match(problems[1], /coverageShape\.floorPct: 50 → 30/);
  });

  it('gerekçeli ve değeri eşleşen istisna düşürmeyi kabul eder', () => {
    const base = config();
    const lowered = withPackage(base, '@volstudio/core', { lines: 60 });
    lowered.ratchetExceptions = [
      { key: 'packages["@volstudio/core"].lines', to: 60, reason: 'Paket ikiye bölündü.' },
    ];
    assert.deepEqual(compareThresholds(base, lowered), []);
  });

  it('istisna yalnız bildirdiği değer için geçerlidir; daha da düşen eşik yine reddedilir', () => {
    const base = config();
    const lowered = withPackage(base, '@volstudio/core', { lines: 40 });
    lowered.ratchetExceptions = [
      { key: 'packages["@volstudio/core"].lines', to: 60, reason: 'Paket ikiye bölündü.' },
    ];
    assert.equal(compareThresholds(base, lowered).length, 1);
  });

  it('gerekçesiz istisna ve başka anahtarın istisnası düşürmeyi aklamaz', () => {
    const base = config();
    const lowered = withPackage(base, '@volstudio/core', { lines: 60 });
    lowered.ratchetExceptions = [
      { key: 'packages["@volstudio/core"].lines', to: 60, reason: '   ' },
      { key: 'packages["@volstudio/core"].branches', to: 60, reason: 'başka metrik' },
    ];
    assert.equal(compareThresholds(base, lowered).length, 1);
  });

  it('silinen paket kaydı için `to: null` istisnası kabul edilir', () => {
    const base = config();
    const removed = structuredClone(base);
    delete removed.packages['@volstudio/tauri-v2'];
    removed.ratchetExceptions = [
      { key: 'packages["@volstudio/tauri-v2"]', to: null, reason: 'Paket emekli edildi.' },
    ];
    assert.deepEqual(compareThresholds(base, removed), []);
  });

  it('eşik düzleştirmesi sayı olmayan ya da eksik değerleri kayıt yapmaz', () => {
    const entries = thresholdEntries({ floor: { lines: 'elli' }, packages: { a: { lines: 70 } } });
    assert.deepEqual([...entries.keys()], ['packages["a"]', 'packages["a"].lines']);
  });
});

describe('eşik ratchet: şema', () => {
  const valid = () => ({
    floor: { lines: 50, statements: 50, branches: 50, functions: 40 },
    packages: { a: { lines: 80, statements: 80, branches: 70, functions: 75 } },
  });

  it('atlama bütçesi: geçerli biçim kabul edilir, bozuk değer ve boş aşama reddedilir', () => {
    const ok = valid();
    ok.skipBudget = { e2e: { 'a/webkit/main': 16 }, contract: { 'node-test': 0 } };
    assert.deepEqual(validateQualityConfig(ok), []);

    const bad = valid();
    bad.skipBudget = { e2e: { 'a/webkit/main': -1, 'a/chromium': 1.5 }, contract: {}, lint: 'x' };
    const problems = validateQualityConfig(bad);
    assert.ok(problems.some((p) => p.includes('["a/webkit/main"]') && p.includes('tam sayı')));
    assert.ok(problems.some((p) => p.includes('["a/chromium"]')));
    assert.ok(
      problems.some((p) => p.includes('skipBudget["contract"]') && p.includes('boş olmayan')),
    );
    assert.ok(problems.some((p) => p.includes('skipBudget["lint"]')));

    const wrong = valid();
    wrong.skipBudget = [];
    assert.ok(validateQualityConfig(wrong).some((p) => p.startsWith('skipBudget: nesne')));
  });

  it('geçerli istisna kabul edilir', () => {
    const raw = valid();
    raw.ratchetExceptions = [{ key: 'packages["a"].lines', to: 70, reason: 'gerekçe' }];
    assert.deepEqual(validateQualityConfig(raw), []);
  });

  it('gerekçesiz, anahtarsız ya da değersiz istisna reddedilir', () => {
    const raw = valid();
    raw.ratchetExceptions = [
      { key: 'packages["a"].lines', to: 70, reason: '' },
      { key: '', to: 70, reason: 'x' },
      { key: 'floor.lines', to: 'elli', reason: 'x' },
      'metin',
    ];
    const problems = validateQualityConfig(raw);
    assert.ok(problems.some((p) => p.includes('ratchetExceptions[0].reason')));
    assert.ok(problems.some((p) => p.includes('ratchetExceptions[1].key')));
    assert.ok(problems.some((p) => p.includes('ratchetExceptions[2].to')));
    assert.ok(problems.some((p) => p.includes('ratchetExceptions[3]: nesne olmalı')));
  });

  it('dizi olmayan istisna listesi reddedilir', () => {
    const raw = valid();
    raw.ratchetExceptions = {};
    assert.ok(validateQualityConfig(raw).some((p) => p.startsWith('ratchetExceptions: dizi')));
  });
});

describe('eşik ratchet: git tabanı', () => {
  function repoWith(t, baseConfig) {
    const root = mkdtempSync(join(tmpdir(), 'vol-ratchet-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q', '-b', 'dev');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    writeFileSync(join(root, 'quality.json'), JSON.stringify(baseConfig));
    git('add', '-A');
    git('commit', '-q', '-m', 'taban');
    return root;
  }

  it('çalışma ağacındaki düşürme taban dala göre yakalanır', (t) => {
    const base = config();
    const root = repoWith(t, base);
    const lowered = withPackage(base, '@volstudio/core', { statements: 70 });
    const result = validateThresholdRatchet(root, lowered, { refs: ['dev'] });
    assert.equal(result.note, null);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /statements: 90 → 70 \(dev@[0-9a-f]{8}\)/);
  });

  it('değişmemiş eşikler temiz geçer ve taban blob kimliği verilir', (t) => {
    const base = config();
    const root = repoWith(t, base);
    const result = validateThresholdRatchet(root, base, { refs: ['dev'] });
    assert.deepEqual(result.problems, []);
    assert.match(result.base.blob, /^[0-9a-f]{40}$/);
    assert.equal(resolveRatchetBase(root, ['dev']).blob, result.base.blob);
  });

  it('taban ref yoksa NOT-RUN notu verir ve sorun üretmez', (t) => {
    const root = repoWith(t, config());
    const result = validateThresholdRatchet(root, config(), { refs: ['origin/yok'] });
    assert.deepEqual(result.problems, []);
    assert.equal(result.base, null);
    assert.match(result.note, /NOT-RUN/);
  });

  it('ref var ama içinde quality.json yoksa sıradakine geçer', (t) => {
    const base = config();
    const root = repoWith(t, base);
    execFileSync('git', ['checkout', '-q', '-b', 'bos'], { cwd: root });
    execFileSync('git', ['rm', '-q', 'quality.json'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'sil'], { cwd: root });
    const resolved = resolveRatchetBase(root, ['bos', 'dev']);
    assert.ok(resolved);
    assert.equal(resolved.ref, 'dev');
  });
});
