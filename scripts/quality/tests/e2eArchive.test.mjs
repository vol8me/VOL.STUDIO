import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pruneOld, runE2E } from '../../../devtools/vol-showcase/scripts/e2e.mjs';

const DAY = 24 * 60 * 60 * 1000;
const ENGINES = ['chromium', 'webkit'];

// Gerçek Node alt süreçleri: Playwright, Vite ve tarayıcı hiç başlatılmaz.
// Reporter JSON'unda Windows yolu JSON.stringify ile escape edilir; taşınmış
// arşivdeki trace'e işaret edip etmediği JSON parse SONRASI doğrulanır.
const FAKE_CLI = String.raw`
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const mode = readFileSync(join(base, 'mode.txt'), 'utf8').trim();
const project = process.argv.find((arg) => arg.startsWith('--project='))?.slice(10);
const lane = process.env.VOL_UI_E2E_LANE || 'selected';
const failed = mode === 'fail-all' || mode === 'fail-selected' ||
  (mode === 'fail-main-chromium' && lane === 'main' && project === 'chromium');
const output = process.env.VOL_UI_E2E_OUTPUT_DIR;
const reportFile = process.env.VOL_UI_E2E_REPORT_FILE;
const testDir = join(output, 'fixture-' + project + '-' + lane);
mkdirSync(testDir, { recursive: true });
const trace = join(testDir, 'trace.zip');
writeFileSync(trace, Buffer.from('trace:' + project + ':' + lane));
const report = {
  suites: [{ title: 'fixture', specs: [{
    title: 'subprocess archive', file: 'tests/e2e/archive.spec.ts', line: 12,
    ok: !failed,
    tests: [{ projectName: project, status: failed ? 'unexpected' : 'expected',
      results: [{ errors: failed ? [{ message: 'fixture failure', stack: 'fixture stack' }] : [],
        attachments: [{ name: 'trace', path: trace, contentType: 'application/zip' }] }],
    }],
  }] }],
  errors: failed ? [{ message: 'fixture runner error' }] : [],
};
if (mode !== 'fail-no-report') writeFileSync(reportFile, JSON.stringify(report));
mkdirSync(join(base, 'ledger'), { recursive: true });
writeFileSync(join(base, 'ledger', project + '-' + lane + '.json'), JSON.stringify({
  project, lane, port: process.env.VOL_UI_E2E_PORT, argv: process.argv.slice(2), output, reportFile,
}));
process.exit(failed || mode === 'fail-no-report' ? 7 : 0);
`;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-e2e-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cli = join(root, 'fake-playwright.mjs');
  writeFileSync(cli, FAKE_CLI);
  const cacheRoot = join(root, 'cache');
  const failures = join(cacheRoot, 'failures');
  const runs = join(cacheRoot, 'runs');
  const setMode = (mode) => writeFileSync(join(root, 'mode.txt'), mode);
  const invoke = (args = []) =>
    runE2E(
      {
        projects: ENGINES,
        ports: { chromium: 5181, webkit: 5182 },
        playwrightCli: cli,
        repoRoot: root,
        cacheRoot,
      },
      args,
    );
  const runNames = () => readdirSync(failures).sort();
  const record = (name) => JSON.parse(readFileSync(join(root, 'ledger', name + '.json'), 'utf8'));
  return { root, cacheRoot, failures, runs, setMode, invoke, runNames, record };
}

function checkArchived(failures, runId, project, lane) {
  const archive = join(failures, runId, project + '-' + lane);
  const context = JSON.parse(readFileSync(join(archive, 'error-context.json'), 'utf8'));
  const report = JSON.parse(readFileSync(join(archive, 'report.json'), 'utf8'));
  const attachment = report.suites[0].specs[0].tests[0].results[0].attachments[0];
  assert.equal(context.engine, project);
  assert.equal(context.lane, lane);
  assert.equal(context.exitCode, 7);
  assert.equal(context.reporter, 'report.json');
  assert.equal(context.failedTests[0].location.file, 'tests/e2e/archive.spec.ts');
  assert.equal(context.failedTests[0].errors[0].message, 'fixture failure');
  assert.equal(context.runnerErrors[0].message, 'fixture runner error');
  assert.deepEqual(context.traces, [
    join('test-results', 'fixture-' + project + '-' + lane, 'trace.zip'),
  ]);
  assert.equal(
    attachment.path,
    join(archive, context.traces[0]),
    'JSON attachment arşive bağlanmalı',
  );
  assert.equal(readFileSync(attachment.path, 'utf8'), 'trace:' + project + ':' + lane);
  return archive;
}

test('iki motorun seçili hata izi ve JSON ekleri korunur; sonraki başarılı koşu bunları silmez', async (t) => {
  const f = fixture(t);
  f.setMode('fail-selected');
  assert.equal(await f.invoke(['dialogPatterns.spec.ts']), 7);
  const [failureRun] = f.runNames();
  assert.ok(failureRun, 'hata arşivi oluşturulmalı');
  assert.deepEqual(
    readdirSync(join(f.failures, failureRun)).sort(),
    ENGINES.map((name) => name + '-selected'),
  );
  for (const project of ENGINES) {
    checkArchived(f.failures, failureRun, project, 'selected');
    const child = f.record(project + '-selected');
    assert.equal(child.port, project === 'chromium' ? '5181' : '5182');
    assert.ok(child.argv.includes('dialogPatterns.spec.ts'));
    assert.ok(child.output.includes(join(f.runs, failureRun, project + '-selected')));
  }
  assert.deepEqual(readdirSync(f.runs), [], 'başarısız çalışmadan boş scratch kalmamalı');

  f.setMode('pass');
  assert.equal(await f.invoke(['dialogPatterns.spec.ts']), 0);
  assert.deepEqual(f.runNames(), [failureRun], 'başarı önceki hata arşivini silemez');
  assert.deepEqual(readdirSync(f.runs), [], 'başarılı koşunun izleri/scratch temizlenmeli');
  for (const project of ENGINES) checkArchived(f.failures, failureRun, project, 'selected');
});

test('ana şerit düşse de diğer motor ve her iki sessiz şerit çalışır; başarılı çıktı tutulmaz', async (t) => {
  const f = fixture(t);
  f.setMode('fail-main-chromium');
  assert.equal(await f.invoke(), 7);
  const [run] = f.runNames();
  assert.deepEqual(readdirSync(join(f.failures, run)), ['chromium-main']);
  checkArchived(f.failures, run, 'chromium', 'main');
  for (const name of ['webkit-main', 'chromium-quiet', 'webkit-quiet']) {
    const child = f.record(name);
    assert.ok(child, name + ' çalışmalı');
    assert.equal(child.lane, name.endsWith('-main') ? 'main' : 'quiet');
    if (child.lane === 'quiet') assert.ok(child.argv.includes('--workers=1'));
  }
  assert.deepEqual(readdirSync(f.runs), []);
});

test('hata raporu yazılamasa bile trace arşivlenir ve eksik rapor doğru belirtilir', async (t) => {
  const f = fixture(t);
  f.setMode('fail-no-report');
  assert.equal(await f.invoke(['layout.spec.ts']), 7);
  const [run] = f.runNames();
  for (const project of ENGINES) {
    const archive = join(f.failures, run, project + '-selected');
    const context = JSON.parse(readFileSync(join(archive, 'error-context.json'), 'utf8'));
    assert.equal(context.reporter, null);
    assert.deepEqual(context.failedTests, []);
    assert.deepEqual(context.traces, [
      join('test-results', 'fixture-' + project + '-selected', 'trace.zip'),
    ]);
    assert.equal(
      readFileSync(join(archive, context.traces[0]), 'utf8'),
      'trace:' + project + ':selected',
    );
  }
});

test('eski arşivler yalnız kendi klasöründe 10 koşu/14 gün, scratch 2 gün sınırına uyar', async (t) => {
  const f = fixture(t);
  const now = Date.UTC(2026, 9, 11, 12);
  mkdirSync(f.failures, { recursive: true });
  for (let i = 0; i < 12; i++) {
    const directory = join(f.failures, 'run-' + String(i).padStart(2, '0'));
    mkdirSync(directory);
    utimesSync(directory, (now - i * 60 * 60 * 1000) / 1000, (now - i * 60 * 60 * 1000) / 1000);
  }
  const expired = join(f.failures, 'expired');
  mkdirSync(expired);
  utimesSync(expired, (now - 15 * DAY) / 1000, (now - 15 * DAY) / 1000);
  writeFileSync(join(f.failures, 'do-not-touch.txt'), 'keep');
  await pruneOld(f.failures, 10, 14 * DAY, now);
  assert.deepEqual(readdirSync(f.failures).sort(), [
    'do-not-touch.txt',
    ...Array.from({ length: 10 }, (_, i) => 'run-' + String(i).padStart(2, '0')),
  ]);
  assert.equal(readFileSync(join(f.failures, 'do-not-touch.txt'), 'utf8'), 'keep');

  mkdirSync(f.runs, { recursive: true });
  const stale = join(f.runs, 'stale');
  const live = join(f.runs, 'live');
  mkdirSync(stale);
  mkdirSync(live);
  utimesSync(stale, (now - 3 * DAY) / 1000, (now - 3 * DAY) / 1000);
  utimesSync(live, (now - DAY) / 1000, (now - DAY) / 1000);
  await pruneOld(f.runs, Infinity, 2 * DAY, now);
  assert.deepEqual(readdirSync(f.runs), ['live']);
});

test('yeni hata, önceden dolu olan 10 koşuluk arşivi 11 koşuda bırakmamalı', async (t) => {
  const f = fixture(t);
  mkdirSync(f.failures, { recursive: true });
  for (let i = 0; i < 10; i++) {
    const directory = join(f.failures, 'old-' + i);
    mkdirSync(directory);
    const age = Date.now() - (i + 1) * 60 * 60 * 1000;
    utimesSync(directory, age / 1000, age / 1000);
  }
  f.setMode('fail-selected');
  assert.equal(await f.invoke(['archive.spec.ts']), 7);
  assert.equal(f.runNames().length, 10, 'koşu sonundaki arşiv 10 sınırını aşmamalı');
  const [latest] = f.runNames().filter((name) => !name.startsWith('old-'));
  assert.ok(latest, 'yeni hata arşivi korunsun');
  for (const engine of ENGINES) checkArchived(f.failures, latest, engine, 'selected');
  assert.equal(readdirSync(f.runs).length, 0);
});
