import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateDeviceApps } from '../deviceApps.mjs';

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

function benchmark(entries) {
  const body = entries.map(([name, pkg]) => `  { name: '${name}', pkg: '${pkg}' },`).join('\n');
  return `const APPS = [\n${body}\n];\n`;
}

test('kabuğu olup listede olmayan paket bulunur', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.volstudio.a'),
    'games/b/src-tauri/tauri.conf.json': shell('com.volstudio.b'),
    'scripts/device-benchmark.mjs': benchmark([['a', 'com.volstudio.a']]),
  });

  const problems = validateDeviceApps(root);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /games\/b/);
  assert.match(problems[0], /sessizce atlar/);
});

test('liste kabuklarla eksiksiz örtüşünce sorun yok', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.volstudio.a'),
    'games/b/src-tauri/tauri.conf.json': shell('com.volstudio.b'),
    'scripts/device-benchmark.mjs': benchmark([
      ['a', 'com.volstudio.a'],
      ['b', 'com.volstudio.b'],
    ]),
  });

  assert.deepEqual(validateDeviceApps(root), []);
});

test('kimlik uyuşmazlığı sessiz "KURULU DEĞİL" olarak geçmez', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.volstudio.a'),
    'scripts/device-benchmark.mjs': benchmark([['a', 'com.volstudio.eski']]),
  });

  const problems = validateDeviceApps(root);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /com\.volstudio\.a/);
  assert.match(problems[0], /com\.volstudio\.eski/);
});

test('kabuğu kaldırılmış paket listede kalmaz', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.volstudio.a'),
    'scripts/device-benchmark.mjs': benchmark([
      ['a', 'com.volstudio.a'],
      ['silinmis', 'com.volstudio.silinmis'],
    ]),
  });

  const problems = validateDeviceApps(root);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /silinmis/);
});

test('APPS listesi bulunamazsa bekçi susmaz', (t) => {
  const root = fixture(t, {
    'games/a/src-tauri/tauri.conf.json': shell('com.volstudio.a'),
    'scripts/device-benchmark.mjs': 'const OTHER = [];\n',
  });

  assert.match(validateDeviceApps(root)[0], /APPS/);
});

test('gerçek repoda ölçüm her Android kabuğunu kapsar', () => {
  const root = join(import.meta.dirname, '..', '..', '..');
  assert.deepEqual(validateDeviceApps(root), []);
});
