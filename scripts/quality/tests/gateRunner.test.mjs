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

/** İki paket: `b` → `a` bağımlı. `a` ve `b` ayrı test/e2e makbuzu taşır. */
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

test('ilk koşuda her şey koşar; ikincide girdisi değişmeyen aşamalar atlanır', async () => {
  const r = fixture();
  try {
    const first = recorder();
    const report = await run(r, 'fast', first.execute);
    assert.equal(report.status, 'passed');
    assert.deepEqual(first.ran.sort(), ['contract', 'lint', 'node-pin', 'test a', 'test b']);

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
    assert.deepEqual(next.ran.sort(), ['contract', 'node-pin'], 'lint ve testler belgeyi okumaz');
  } finally {
    r.cleanup();
  }
});

test('paket değişimi yalnız o paketi ve onu kapanışında taşıyanları çalıştırır', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);

    r.write('b/y.txt', '2');
    const onlyB = recorder();
    await run(r, 'fast', onlyB.execute);
    assert.ok(onlyB.ran.includes('test b'));
    assert.ok(!onlyB.ran.includes('test a'), 'a, b’ye bağımlı değil');

    r.write('a/x.txt', '2');
    const both = recorder();
    await run(r, 'fast', both.execute);
    assert.ok(both.ran.includes('test a') && both.ran.includes('test b'), 'b, a’ya bağımlı');
  } finally {
    r.cleanup();
  }
});

test('düşen aşama sonraki dalgaları durdurur ve makbuzunu siler', async () => {
  const r = fixture();
  try {
    await run(r, 'fast', recorder().execute);
    assert.equal(listReceipts(r.root, 'lint', null).length, 1);

    r.write('a/x.txt', '2');
    const failing = recorder({ lint: () => ({ code: 1, output: 'lint düştü' }) });
    const report = await run(r, 'fast', failing.execute);
    assert.equal(report.status, 'failed');
    assert.deepEqual(
      report.failures.map((failure) => failure.stage),
      ['lint'],
    );
    assert.ok(!failing.ran.includes('test a'), 'test dalgası düşen aşamadan sonra başlamaz');
    assert.equal(listReceipts(r.root, 'lint', null).length, 1, 'eski geçiş geri alma için kalır');
    const again = recorder({ lint: () => ({ code: 1, output: 'yine düştü' }) });
    await run(r, 'fast', again.execute);
    assert.ok(again.ran.includes('lint'), 'düşen girdi için makbuz yok, aşama yeniden koşar');
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
    assert.deepEqual(forced.ran.sort(), ['contract', 'lint', 'node-pin', 'test a', 'test b']);

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
    assert.ok(signoff.ran.includes('contract') && signoff.ran.includes('coverage-audio'));
    assert.ok(report.stages.every((stage) => stage.status !== 'cached'));
  } finally {
    r.cleanup();
  }
});

test('koşu sırasında ağaç değişirse makbuz yazılmaz', async () => {
  const r = fixture();
  try {
    const racing = recorder({
      lint: () => {
        r.write('a/x.txt', 'koşu sırasında düzenlendi');
        return { code: 0, output: '' };
      },
    });
    const report = await run(r, 'quick', racing.execute);
    assert.equal(report.status, 'passed');
    assert.equal(listReceipts(r.root, 'lint', null).length, 0, 'yarışan aşama makbuz bırakmaz');
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
    assert.ok(at('node-pin') < at('contract'));
    assert.ok(at('lint') < at('build'));
    assert.ok(at('build') < at('rust'));
    assert.ok(at('rust') < at('e2e a'));
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

test('aynı girdiyle --fresh koşuda düşen aşamanın makbuzu silinir', async () => {
  const r = fixture();
  try {
    await run(r, 'quick', recorder().execute);
    assert.equal(listReceipts(r.root, 'lint', null).length, 1);
    const flaky = recorder({ lint: () => ({ code: 1, output: 'kararsız' }) });
    const report = await run(r, 'quick', flaky.execute, { fresh: true });
    assert.equal(report.status, 'failed');
    assert.equal(listReceipts(r.root, 'lint', null).length, 0, 'aynı girdi artık güvenilmez');
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
