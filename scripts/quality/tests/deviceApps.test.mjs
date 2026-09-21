import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deviceBenchmarkCandidates, validateDeviceApps } from '../deviceApps.mjs';

/** Gerçek bir ağaç kurar; bekçi kaynaktan okur, bağlı bir cihazdan değil. */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-device-apps-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const shell = (identifier) => JSON.stringify({ identifier });

const lifecycle = (records) => ({ schemaVersion: 1, workspaces: records });

const active = (packageName, path) => ({ packageName, path, status: 'active' });
const frozen = (packageName, path) => ({
  packageName,
  path,
  status: 'frozen',
  freezeTag: 'x/final',
  freezeCommit: 'a'.repeat(40),
  decisionDate: '2026-09-20',
  reason: 'ürün tamamlandı',
});

// Bekçi benchmark betiğinin keşfi KULLANDIĞINI metinsel kilitler; fixture
// betiği o kilidi geçen en küçük metindir, gerçek listeyi taşımaz.
const BENCHMARK_SCRIPT = "import { deviceBenchmarkCandidates } from './quality/deviceApps.mjs';\n";

function withLifecycle(t, records, extra = {}) {
  return fixture(t, {
    'workspace-lifecycle.json': JSON.stringify(lifecycle(records)),
    ...extra,
  });
}

test('aktif kabuk adaydır, frozen kabuk aday değildir', (t) => {
  const records = [active('@vol/a', 'games/a'), frozen('@vol/b', 'games/b')];
  const root = withLifecycle(t, records, {
    'games/a/src-tauri/tauri.conf.json': shell('com.vol.a'),
    'games/b/src-tauri/tauri.conf.json': shell('com.vol.b'),
  });

  assert.deepEqual(deviceBenchmarkCandidates(root, lifecycle(records)), [
    { name: '@vol/a', pkg: 'com.vol.a' },
  ]);
});

test('aktif Tauri kabuğu yoksa aday listesi boş — doğrulanmış no-op', (t) => {
  const records = [active('@vol/ui', 'devtools/ui'), frozen('@vol/b', 'games/b')];
  const root = withLifecycle(t, records, {
    'games/b/src-tauri/tauri.conf.json': shell('com.vol.b'),
  });

  assert.deepEqual(deviceBenchmarkCandidates(root, lifecycle(records)), []);
});

test('benchmark betiği keşfi kullanmıyorsa bekçi yakalar', (t) => {
  const root = withLifecycle(t, [frozen('@vol/b', 'games/b')], {
    'games/b/src-tauri/tauri.conf.json': shell('com.vol.b'),
    'scripts/device-benchmark.mjs': 'const OTHER = [];\n',
  });

  assert.match(validateDeviceApps(root)[0], /deviceBenchmarkCandidates/);
});

test('benchmark betiğinde sabit pkg listesi geri gelirse bekçi yakalar', (t) => {
  const root = withLifecycle(t, [frozen('@vol/b', 'games/b')], {
    'games/b/src-tauri/tauri.conf.json': shell('com.vol.b'),
    'scripts/device-benchmark.mjs':
      "import { deviceBenchmarkCandidates } from './x.mjs';\n" +
      "const APPS = [{ name: 'b', pkg: 'com.vol.b' }];\n",
  });

  assert.match(
    validateDeviceApps(root).find((problem) => /sabit bir uygulama listesi/.test(problem)),
    /sabit bir uygulama listesi/,
  );
});

test('aktif kabuk aday kümesiyle birebir örtüşünce sorun yok', (t) => {
  const root = withLifecycle(
    t,
    [active('@vol/a', 'games/a'), frozen('@vol/b', 'games/b')],
    {
      'games/a/src-tauri/tauri.conf.json': shell('com.vol.a'),
      'games/b/src-tauri/tauri.conf.json': shell('com.vol.b'),
      'scripts/device-benchmark.mjs': BENCHMARK_SCRIPT,
    },
  );

  assert.deepEqual(validateDeviceApps(root), []);
});

test('lifecycle dosyası yoksa bekçi sessiz geçemez', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.vol.a'),
    'scripts/device-benchmark.mjs': BENCHMARK_SCRIPT,
  });

  assert.match(validateDeviceApps(root, null)[0], /workspace-lifecycle\.json/);
});
