import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname, delimiter } from 'node:path';
import test from 'node:test';
import { checkRust, rustManifests } from '../rust.mjs';

test('gerçek just rust tarifi bütün uygulama crate’lerini çalıştırır', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vol-cargo-command-'));
  try {
    const log = join(temporary, 'calls.jsonl');
    writeFileSync(
      join(temporary, 'cargo'),
      '#!/usr/bin/env node\n' +
        "require('node:fs').appendFileSync(process.env.VOL_RUST_TEST_LOG, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');\n",
      { mode: 0o755 },
    );
    execFileSync(resolve('node_modules/.bin/just'), ['rust'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: temporary + delimiter + process.env.PATH,
        VOL_RUST_TEST_LOG: log,
      },
      stdio: 'pipe',
    });
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    const projects = rustManifests(process.cwd()).map((p) => resolve(dirname(p)));
    assert.deepEqual([...new Set(calls.map((c) => c.cwd))].sort(), projects.sort());
    assert.equal(calls.length, projects.length * 3);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Rust kapısı yeni oyun dahil bütün manifestleri check/fmt/clippy ile sınar', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-rust-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), 'target/\n');
    const projects = ['tauri-v2/src-tauri', 'games/new-game/src-tauri'];
    for (const path of [...projects, 'target/generated']) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, 'Cargo.toml'), '[package]\n');
    }
    assert.deepEqual(rustManifests(root), projects.map((p) => `${p}/Cargo.toml`).sort());
    const calls = [];
    checkRust(root, (command, args, options) =>
      calls.push([command, args, relative(root, options.cwd)]),
    );
    assert.equal(calls.length, 6);
    for (const project of projects) {
      assert.deepEqual(
        calls.filter((c) => c[2] === project).map((c) => c.slice(0, 2)),
        [
          ['cargo', ['check', '--locked']],
          ['cargo', ['fmt', '--check']],
          ['cargo', ['clippy', '--locked', '--', '-D', 'warnings']],
        ],
      );
    }
    assert.throws(
      () =>
        checkRust(root, () => {
          throw new Error('cargo kırmızı');
        }),
      /cargo kırmızı/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
