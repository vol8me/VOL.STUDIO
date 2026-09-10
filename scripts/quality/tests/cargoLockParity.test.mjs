import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { parseLockPackages, validateCargoLockParity } from '../cargoLockParity.mjs';

function lock(entries) {
  return (
    'version = 4\n\n' +
    entries
      .map(([name, version]) => `[[package]]\nname = "${name}"\nversion = "${version}"\n`)
      .join('\n')
  );
}

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-cargo-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('kilit metni paket başına sıralı sürüm listesine ayrışır', () => {
  const packages = parseLockPackages(
    lock([
      ['tauri', '2.11.5'],
      ['windows-sys', '0.59.0'],
      ['windows-sys', '0.52.0'],
    ]),
  );
  assert.deepEqual(packages.get('tauri'), ['2.11.5']);
  assert.deepEqual(packages.get('windows-sys'), ['0.52.0', '0.59.0']);
});

test('izlenen crate kilitler arasında ayrışınca kapı düşer', (t) => {
  const root = fixture(t, {
    'runtime/Cargo.lock': lock([['tauri-plugin-log', '2.9.0']]),
    'game/Cargo.lock': lock([['tauri-plugin-log', '2.9.1']]),
  });

  const problems = validateCargoLockParity(root, ['runtime/Cargo.lock', 'game/Cargo.lock']);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /tauri-plugin-log/);
  assert.match(problems[0], /runtime\/Cargo\.lock → 2\.9\.0/);
  assert.match(problems[0], /game\/Cargo\.lock → 2\.9\.1/);
});

test('eşit kilitler, izlenmeyen crate farkı ve tek kilitte olan crate geçer', (t) => {
  const root = fixture(t, {
    'runtime/Cargo.lock': lock([
      ['tauri', '2.11.5'],
      ['wry', '0.55.1'],
      ['serde', '1.0.1'],
    ]),
    'game/Cargo.lock': lock([
      ['tauri', '2.11.5'],
      ['wry', '0.55.1'],
      ['serde', '1.0.9'],
      ['tauri-build', '2.6.3'],
    ]),
  });

  assert.deepEqual(validateCargoLockParity(root, ['runtime/Cargo.lock', 'game/Cargo.lock']), []);
});

test('wry ve tao da izlenir', (t) => {
  const root = fixture(t, {
    'a/Cargo.lock': lock([
      ['wry', '0.55.1'],
      ['tao', '0.35.3'],
    ]),
    'b/Cargo.lock': lock([
      ['wry', '0.55.0'],
      ['tao', '0.35.2'],
    ]),
  });

  const problems = validateCargoLockParity(root, ['a/Cargo.lock', 'b/Cargo.lock']).join('\n');
  assert.match(problems, /^tao /m);
  assert.match(problems, /^wry /m);
});

test('kilitler çalışma ağacından keşfedilir; henüz eklenmemiş kilit de sayılır', (t) => {
  const root = fixture(t, { 'a/Cargo.lock': lock([['tauri', '2.11.5']]) });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  mkdirSync(join(root, 'b'));
  writeFileSync(join(root, 'b/Cargo.lock'), lock([['tauri', '2.12.0']]));

  assert.match(validateCargoLockParity(root).join('\n'), /tauri kilitler arasında/);
});
