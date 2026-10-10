import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from '../command.mjs';
import { listReceipts } from '../gateCache.mjs';
import { runGate, waveSaving } from '../gateRunner.mjs';

const GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

const JUSTFILE = [
  'quick: node-pin contract lint',
  'fast: quick test',
  'high: quick build rust e2e',
  'signoff: high coverage-audio',
  '',
].join('\n');

/** Aşamanın `fast` kapısındaki bütün öğeleri: iki contract takımı, üç lint, iki test. */
const FAST = [
  'contract cli',
  'contract node-test',
  'lint a',
  'lint b',
  'lint rest',
  'node-pin',
  'test a',
  'test b',
];

/**
 * İki paket: `b` → `a` bağımlı. Her paket bir Rust crate'i taşır; `b` crate'i `a`'ya path
 * bağımlıdır. Bu yüzden `a`daki değişim iki crate'i, `b`dekisi yalnız `b`yi etkiler.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'vol-gate-runner-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write('justfile', JUSTFILE);
  write(
    'workspace-lifecycle.json',
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { packageName: '@volstudio/a', path: 'a', status: 'active' },
        { packageName: '@volstudio/b', path: 'b', status: 'active' },
      ],
    }),
  );
  const manifest = (name, deps) =>
    JSON.stringify({
      name,
      dependencies: deps,
      scripts: { test: 'x', 'test:e2e': 'x' },
    });
  write('a/package.json', manifest('@volstudio/a', {}));
  write('b/package.json', manifest('@volstudio/b', { '@volstudio/a': 'workspace:*' }));
  write('a/Cargo.toml', '[package]\nname = "a"\n');
  write('b/Cargo.toml', '[package]\nname = "b"\n\n[dependencies]\na = { path = "../a" }\n');
  write('Cargo.toml', '[workspace]\nmembers = ["a", "b"]\n');
  write('Cargo.lock', '# kilit\n');
  write('a/x.txt', '1');
  write('b/y.txt', '1');
  write('docs/note.md', 'belge');
  write('README.md', 'belge');
  write('eslint.config.mjs', 'export default [];');
  write('.gitignore', 'dist/\n');
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      env: GIT_ENV,
      encoding: 'utf8',
    });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { root, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Koşan öğeleri sayan sahte yürütücü. */
function recorder(overrides = {}) {
  const ran = [];
  const execute = async (item) => {
    ran.push(item.label);
    const hook = overrides[item.label];
    if (hook) return hook(item);
    return { code: 0, output: '' };
  };
  return { ran, execute };
}

const run = (r, gate, execute, extra = {}) => runGate({ root: r.root, gate, execute, ...extra });
const receipts = (r, stage, unit) => listReceipts(r.root, stage, unit).length;

test('ilk koşuda her şey koşar; ikincide girdisi değişmeyen aşamalar atlanır', async () => {
  const r = fixture();
  try {
    const first = recorder();
    const report = await run(r, 'fast', first.execute);
    assert.equal(report.status, 'passed');
    assert.deepEqual(first.ran.sort(), FAST);

    const second = recorder();
    const again = await run(r, 'fast', second.execute);
    assert.equal(again.status, 'passed');
    assert.deepEqual(second.ran, ['node-pin'], 'yalnız önbelleksiz aşama yeniden koşar');
    assert.ok(again.stages.some((stage) => stage.stage === 'lint' && stage.status === 'cached'));
  } finally {
    r.cleanup();
  }
});

test('belge değişimi yalnız belgeyi okuyan aşamayı çalıştırır', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    r.write('docs/note.md', 'değişti');
    const next = recorder();
    await run(r, 'fast', next.execute);
    assert.deepEqual(
      next.ran.sort(),
      ['contract cli', 'contract node-test', 'node-pin'],
      'lint ve testler belgeyi okumaz',
    );
  } finally {
    r.cleanup();
  }
});

test('paket değişimi yalnız o paketin birimlerini ve onu kapanışında taşıyanları çalıştırır', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);

    r.write('b/y.txt', '2');
    const onlyB = recorder();
    await run(r, 'fast', onlyB.execute);
    assert.ok(onlyB.ran.includes('test b') && onlyB.ran.includes('lint b'));
    assert.ok(
      !onlyB.ran.includes('test a') && !onlyB.ran.includes('lint a'),
      'a, b’ye bağımlı değil',
    );

    r.write('a/x.txt', '2');
    const both = recorder();
    await run(r, 'fast', both.execute);
    for (const label of ['test a', 'test b', 'lint a', 'lint b']) {
      assert.ok(both.ran.includes(label), `${label}: b, a’ya bağımlı`);
    }
  } finally {
    r.cleanup();
  }
});

test('düşen birim sonraki dalgaları durdurur ve makbuzunu siler', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    assert.equal(receipts(r, 'lint', '@volstudio/a'), 1);

    r.write('a/x.txt', '2');
    const failing = recorder({ 'lint a': () => ({ code: 1, output: 'lint düştü' }) });
    const report = await run(r, 'fast', failing.execute);
    assert.equal(report.status, 'failed');
    assert.deepEqual(
      report.failures.map((failure) => failure.stage),
      ['lint'],
    );
    assert.equal(report.failures[0].entry.item.label, 'lint a');
    assert.ok(!failing.ran.includes('test a'), 'test dalgası düşen aşamadan sonra başlamaz');
    assert.equal(receipts(r, 'lint', '@volstudio/a'), 1, 'eski geçiş geri alma için kalır');
    const again = recorder({ 'lint a': () => ({ code: 1, output: 'yine düştü' }) });
    await run(r, 'fast', again.execute);
    assert.ok(again.ran.includes('lint a'), 'düşen girdi için makbuz yok, birim yeniden koşar');
  } finally {
    r.cleanup();
  }
});

test('aynı aşamanın geçen birimi düşen kardeşine rağmen makbuzunu korur', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    r.write('b/y.txt', '2');
    const failing = recorder({ 'contract cli': () => ({ code: 1, output: 'kırmızı' }) });
    const report = await run(r, 'fast', failing.execute);
    assert.equal(report.status, 'failed');

    // Ağaç aynı: yalnız düşen takım yeniden koşar; geçen kardeş ve lint makbuzdan atlanır.
    // Düşen dalgadan sonrası hiç koşmadığı için `test b` hâlâ makbuzsuzdur.
    const next = recorder();
    await run(r, 'fast', next.execute);
    assert.deepEqual(next.ran.sort(), ['contract cli', 'node-pin', 'test b']);
  } finally {
    r.cleanup();
  }
});

test('--fresh makbuzu yok sayar ama yine de makbuz yazar', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    const forced = recorder();
    await run(r, 'fast', forced.execute, { fresh: true });
    assert.deepEqual(forced.ran.sort(), FAST);

    const after = recorder();
    await run(r, 'fast', after.execute);
    assert.deepEqual(after.ran, ['node-pin'], 'taze koşunun makbuzu sonrakini atlatır');
  } finally {
    r.cleanup();
  }
});

test('signoff hiçbir makbuza güvenmez', async () => {
  const r = fixture();
  try {
    await run(r, 'high', recorder().execute);
    const signoff = recorder();
    const report = await run(r, 'signoff', signoff.execute);
    assert.equal(report.fresh, true);
    assert.ok(signoff.ran.includes('contract node-test') && signoff.ran.includes('coverage-audio'));
    assert.ok(report.stages.every((stage) => stage.status !== 'cached'));
  } finally {
    r.cleanup();
  }
});

test('koşu sırasında ağaç değişirse makbuz yazılmaz', async () => {
  const r = fixture();
  try {
    const racing = recorder({
      'lint a': () => {
        r.write('a/x.txt', 'koşu sırasında düzenlendi');
        return { code: 0, output: '' };
      },
    });
    const report = await run(r, 'quick', racing.execute);
    assert.equal(report.status, 'passed');
    assert.equal(receipts(r, 'lint', '@volstudio/a'), 0, 'yarışan aşama makbuz bırakmaz');
    assert.ok(report.notes.some((note) => note.includes('ağaç koşu sırasında değişti')));
  } finally {
    r.cleanup();
  }
});

test('yapı çıktısı (yok sayılan dizin) makbuzu geçersiz kılmaz', async () => {
  const r = fixture();
  try {
    await run(r, 'quick', recorder().execute);
    r.write('dist/bundle.js', 'çıktı');
    const next = recorder();
    await run(r, 'quick', next.execute);
    assert.deepEqual(next.ran, ['node-pin']);
  } finally {
    r.cleanup();
  }
});

test('aşamalar plan sırasında koşar: statik dalga build’den, build rust’tan önce', async () => {
  const r = fixture();
  try {
    const order = [];
    const execute = async (item) => {
      order.push(item.label);
      return { code: 0, output: '' };
    };
    await run(r, 'high', execute);
    const at = (label) => order.indexOf(label);
    assert.ok(at('node-pin') < at('contract cli'));
    assert.ok(at('lint a') < at('build'));
    assert.ok(at('build') < at('rust a'));
    assert.ok(at('rust a') < at('e2e a'));
  } finally {
    r.cleanup();
  }
});

test('önbellek kazancı birlikte koşan aşamaların sürelerini toplamaz', () => {
  const cached = (ms) => ({ items: [{ status: 'cached', savedMs: ms, durationMs: 0 }] });
  const ran = (ms) => ({ items: [{ status: 'passed', durationMs: ms }] });
  assert.equal(waveSaving([cached(90_000), cached(50_000)], 0), 90_000, 'en uzun aşama kadar');
  assert.equal(waveSaving([cached(90_000), ran(60_000)], 60_000), 30_000, 'koşan aşamayla fark');
  assert.equal(waveSaving([ran(10_000), ran(8_000)], 10_000), 0, 'atlanan yoksa kazanç yok');
});

test('önbellek kazancı aşama içi eşzamanlılığı hesaba katar', () => {
  const entry = (ms) => ({ status: 'cached', savedMs: ms, durationMs: 0 });
  const stage = (concurrency, ...times) => ({ concurrency, items: times.map(entry) });
  assert.equal(waveSaving([stage(1, 60_000, 50_000)], 0), 110_000, 'art arda: süreler toplanır');
  assert.equal(waveSaving([stage(2, 60_000, 50_000)], 0), 60_000, 'iki şerit: en uzun birim');
  assert.equal(waveSaving([stage(2, 60_000, 50_000, 40_000)], 0), 90_000, '60 | 50+40');
});

test('aynı girdiyle --fresh koşuda düşen birimin makbuzu silinir', async () => {
  const r = fixture();
  try {
    await run(r, 'quick', recorder().execute);
    assert.equal(receipts(r, 'lint', '@volstudio/a'), 1);
    const flaky = recorder({ 'lint a': () => ({ code: 1, output: 'kararsız' }) });
    const report = await run(r, 'quick', flaky.execute, { fresh: true });
    assert.equal(report.status, 'failed');
    assert.equal(receipts(r, 'lint', '@volstudio/a'), 0, 'aynı girdi artık güvenilmez');
    assert.equal(receipts(r, 'lint', '@volstudio/b'), 1, 'kardeş birimin makbuzu kalır');
  } finally {
    r.cleanup();
  }
});

test('değişikliği geri almak eski makbuzu geri getirir', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    r.write('b/y.txt', 'başka');
    await run(r, 'fast', recorder().execute);
    r.write('b/y.txt', '1');
    const back = recorder();
    await run(r, 'fast', back.execute);
    assert.deepEqual(back.ran, ['node-pin'], 'önceki girdiye dönüş her aşamayı atlatır');
  } finally {
    r.cleanup();
  }
});

test('aşamanın birimleri eşzamanlılık sınırı kadar birlikte koşar', async () => {
  const r = fixture();
  try {
    let active = 0;
    let peak = 0;
    const execute = async (item) => {
      if (item.stage === 'contract') {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 30));
        active -= 1;
      }
      return { code: 0, output: '' };
    };
    await run(r, 'quick', execute);
    assert.equal(peak, 2, 'contract’ın iki takımı birlikte koşmalı');
  } finally {
    r.cleanup();
  }
});

test('eşzamanlılığı 1 olan aşamanın birimleri art arda koşar ve düşende durur', async () => {
  const r = fixture();
  try {
    let active = 0;
    let peak = 0;
    const started = [];
    const execute = async (item) => {
      if (item.stage !== 'rust') return { code: 0, output: '' };
      started.push(item.label);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return item.label === 'rust a'
        ? { code: 1, output: 'cargo kırmızı' }
        : { code: 0, output: '' };
    };
    const report = await run(r, 'high', execute);
    assert.equal(peak, 1, 'cargo hedef dizinini paylaşır; crate’ler art arda koşar');
    assert.deepEqual(started, ['rust a'], 'düşen crate’ten sonra sıradaki başlamaz');
    assert.equal(report.status, 'failed');
  } finally {
    r.cleanup();
  }
});

test('crate değişimi yalnız o crate’i ve ona path bağımlı olanları çalıştırır', async () => {
  const r = fixture();
  try {
    await run(r, 'high', recorder().execute);

    r.write('b/y.txt', '2');
    const onlyB = recorder();
    await run(r, 'high', onlyB.execute);
    const rust = onlyB.ran.filter((label) => label.startsWith('rust'));
    assert.deepEqual(rust, ['rust b'], 'a, b’ye bağımlı değil');

    r.write('a/x.txt', '2');
    const both = recorder();
    await run(r, 'high', both.execute);
    assert.deepEqual(
      both.ran.filter((label) => label.startsWith('rust')),
      ['rust a', 'rust b'],
      'b, a’ya path bağımlı',
    );

    r.write('Cargo.lock', '# başka kilit\n');
    const lock = recorder();
    await run(r, 'high', lock.execute);
    assert.deepEqual(lock.ran.filter((label) => label.startsWith('rust')).sort(), [
      'rust a',
      'rust b',
    ]);
  } finally {
    r.cleanup();
  }
});

test('atlanan birimler aşama başına tek olayla bildirilir', async () => {
  const r = fixture();
  try {
    await run(r, 'quick', recorder().execute);
    r.write('b/y.txt', '2');
    const events = [];
    await run(r, 'quick', recorder().execute, { emit: (event) => events.push(event) });
    const cached = events.filter((event) => event.type === 'cached' && event.stage === 'lint');
    assert.equal(cached.length, 1);
    assert.deepEqual(
      cached[0].items.map((item) => item.label),
      ['lint a'],
    );
  } finally {
    r.cleanup();
  }
});

test('aynı aşamada birden fazla birim düşerse hepsi raporlanır', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    r.write('a/x.txt', '2');
    const failing = recorder({
      'lint a': () => ({ code: 1, output: 'a düştü' }),
      'lint b': () => ({ code: 1, output: 'b düştü' }),
    });
    const report = await run(r, 'fast', failing.execute);
    assert.equal(report.status, 'failed');
    assert.deepEqual(
      report.failures.map((failure) => failure.entry.item.label),
      ['lint a', 'lint b'],
      'eşzamanlı düşen iki birimden biri sessizce kaybolmaz',
    );
  } finally {
    r.cleanup();
  }
});
