import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readReleaseVersion, validateReleaseVersions } from '../releaseVersion.mjs';

const lifecycle = {
  workspaces: [
    { path: 'games/app', status: 'active' },
    { path: 'games/old', status: 'frozen' },
  ],
};
const BASE = {
  'package.json': '{"version":"0.2.0"}',
  'Cargo.toml': '[workspace.package]\nversion = "0.2.0"\n',
  'games/app/package.json': '{"version":"0.2.0"}',
  'games/app/src-tauri/Cargo.toml': '[package]\nversion.workspace = true\n',
  'games/app/src-tauri/tauri.conf.json': '{"version":"../../../package.json"}',
  'games/old/package.json': '{"version":"0.1.0"}',
  'games/old/src-tauri/Cargo.toml': '[package]\nversion = "0.1.0"\n',
};

function fixture(t, patch = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vol-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, text] of Object.entries({ ...BASE, ...patch })) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const check = (root) =>
  validateReleaseVersions(root, lifecycle, [
    'Cargo.toml',
    'games/app/src-tauri/Cargo.toml',
    'games/old/src-tauri/Cargo.toml',
  ]);

test('ortak sürüm ve native kök referansı geçer; frozen sürüm korunur', (t) => {
  const root = fixture(t);
  assert.equal(readReleaseVersion(root), '0.2.0');
  assert.deepEqual(check(root), []);
  assert.match(readFileSync(join(root, 'games/old/package.json'), 'utf8'), /0.1.0/);
});

test('native uygulaması olmayan aktif paket ayrıca config üretmek zorunda değildir', (t) => {
  const root = fixture(t, { 'games/app/src-tauri/tauri.conf.json': null });
  assert.deepEqual(check(root), []);
});

test('lifecycle olmadan aktif/frozen sürüm kapsamı varsayılmaz', (t) => {
  assert.match(validateReleaseVersions(fixture(t), null, []).join('\n'), /lifecycle gerekli/);
});

test('TOML yorumları ve başka tablonun version alanı karıştırılmaz', (t) => {
  const root = fixture(t, {
    'Cargo.toml':
      '[workspace]\nversion = "yanlış"\n[workspace.package] # ortak\nversion = "0.2.0" # doğru\n',
    'games/app/src-tauri/Cargo.toml':
      '[dependencies]\nversion.workspace = false\n[package]\nversion.workspace = true # ortak\n',
  });
  assert.deepEqual(check(root), []);
});

test('Cargo sürümünün geçerli tek tırnaklı TOML dizgesi kabul edilir', (t) => {
  assert.deepEqual(
    check(
      fixture(t, {
        'Cargo.toml': "[workspace.package]\nversion = '0.2.0'\n",
      }),
    ),
    [],
  );
});

for (const [path, text, expected] of [
  ['Cargo.toml', '[workspace.package]\nversion = "0.1.0"', /workspace.package.version/],
  ['Cargo.toml', '[workspace]\nmembers = []', /workspace.package.version/],
  ['games/app/package.json', '{"version":"0.1.0"}', /aktif paket/],
  ['games/app/src-tauri/Cargo.toml', '[package]\nversion = "0.2.0"', /version.workspace/],
  ['games/app/src-tauri/Cargo.toml', '[package]\nversion.workspace = false', /version.workspace/],
  ['games/app/src-tauri/tauri.conf.json', '{"version":"0.2.0"}', /kök package.json/],
  ['games/app/src-tauri/tauri.conf.json', '{"version":"../package.json"}', /kök package.json/],
  ['games/app/src-tauri/tauri.conf.json', '{}', /kök package.json/],
])
  test(`sürüm sapması reddedilir: ${path} ${text}`, (t) => {
    assert.match(check(fixture(t, { [path]: text })).join('\n'), expected);
  });

for (const value of [undefined, '', ' ', 2, null])
  test(`eksik/boş sürüm kabul edilmez: ${value}`, (t) => {
    assert.throws(
      () => readReleaseVersion(fixture(t, { 'package.json': JSON.stringify({ version: value }) })),
      /sürümü boş/,
    );
  });
