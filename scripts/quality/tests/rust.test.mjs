import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname, delimiter } from 'node:path';
import test from 'node:test';
import { cargoSteps, checkRust, optionalFeatures, rustManifests } from '../rust.mjs';
import { resolveCommand, runCommand, writeNodeCommand } from './runCommand.mjs';

// `just`ın `rust` tarifi tek satırdır: `node scripts/quality/rust.mjs`. Tarifin
// bu komutu çağırdığı burada sözleşmelenir; tarifin kendisi Windows'ta `sh`
// üzerinden çalıştığı için çalıştırma aşağıda doğrudan `node` ile yapılır.
const justfile = readFileSync(
  resolve(import.meta.dirname, '../../../justfile'),
  'utf8',
);

test('gerçek just rust tarifi bütün uygulama crate’lerini çalıştırır', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vol-cargo-command-'));
  try {
    const recipe = /rust:\s*\n\s*node scripts\/quality\/rust\.mjs/.test(justfile);
    assert.ok(recipe, 'justfile rust tarifi node scripts/quality/rust.mjs çağırmıyor');
    const log = join(temporary, 'calls.jsonl');
    writeNodeCommand(
      temporary,
      'cargo',
      '#!/usr/bin/env node\n' +
        "require('node:fs').appendFileSync(process.env.VOL_RUST_TEST_LOG, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');\n",
    );
    // `just rust` tarifi yalnız `node scripts/quality/rust.mjs` çağırır. Tarifi
    // doğrudan çağırmak, Windows'ta `just`ın kendi PATH'ini (ve `shell` katmanını)
    // devreye sokmadan sahte `cargo`nun PATH'e girmesini sağlar.
    const childPath = temporary + delimiter + process.env.PATH;
    runCommand(
      process.execPath,
      ['scripts/quality/rust.mjs'],
      {
        cwd: process.cwd(),
        shell: false,
        env: {
          ...process.env,
          PATH: childPath,
          // Windows `execFileSync` uzantısız POSIX betiği bulamaz; sahte komutun
          // tam yolu `CARGO` ile açıkça geçilir.
          CARGO: resolveCommand('cargo', childPath),
          VOL_RUST_TEST_LOG: log,
        },
        stdio: 'pipe',
      },
    );
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
    const projects = rustManifests(process.cwd()).map((p) => resolve(dirname(p)));
    assert.deepEqual([...new Set(calls.map((c) => c.cwd))].sort(), projects.sort());
    for (const project of projects) {
      const verbs = calls.filter((c) => c.cwd === project).map((c) => c.args[0]);
      assert.deepEqual([...new Set(verbs)], ['fmt', 'clippy', 'test'], project);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('Rust kapısı aktif manifestleri check/fmt/clippy ile sınar', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-rust-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), 'target/\n');
    const projects = ['tauri-v2/src-tauri', 'games/new-game/src-tauri'];
    for (const path of [...projects, 'target/generated']) {
      mkdirSync(join(root, path), { recursive: true });
      writeFileSync(join(root, path, 'Cargo.toml'), '[package]\n');
    }
    const lifecycle = {
      workspaces: projects.map((path) => ({ path: path.split('/src-tauri')[0], status: 'active' })),
    };
    assert.deepEqual(rustManifests(root, lifecycle), projects.map((p) => `${p}/Cargo.toml`).sort());
    const calls = [];
    // Kapı yolları POSIX olarak raporlanır; Windows'ta `relative()` `\` üretir.
    checkRust(
      root,
      (command, args, options) =>
        calls.push([command, args, relative(root, options.cwd).split(/[\\/]/).join('/')]),
      lifecycle,
    );
    assert.equal(calls.length, 6);
    for (const project of projects) {
      assert.deepEqual(
        calls.filter((c) => c[2] === project).map((c) => c.slice(0, 2)),
        [
          ['cargo', ['fmt', '--check']],
          ['cargo', ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings']],
          ['cargo', ['test', '--locked', '--all-targets']],
        ],
      );
    }
    assert.throws(
      () =>
        checkRust(
          root,
          () => {
            throw new Error('cargo kırmızı');
          },
          lifecycle,
        ),
      /cargo kırmızı/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('feature taşıyan crate feature açıkken de lint edilir', () => {
  const manifest =
    '[package]\nname = "x"\n\n[features]\ndefault = []\nsteamworks = ["dep:steamworks"]\n\n[dependencies.steamworks]\nversion = "1"\n';
  assert.deepEqual(optionalFeatures(manifest), ['steamworks']);
  assert.deepEqual(optionalFeatures('[package]\nname = "x"\n'), []);
  assert.deepEqual(optionalFeatures('[features]\ndefault = ["a"]\na = []\n'), ['a']);
  assert.ok(
    cargoSteps(manifest).some((step) => step[0] === 'clippy' && step.includes('--all-features')),
  );
  assert.ok(!cargoSteps('[package]\n').some((step) => step.includes('--all-features')));
});
