import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  capabilityPrefixes,
  cargoPluginDeps,
  registeredPlugins,
  validateTauriPlugins,
} from '../tauriPlugins.mjs';

const LIFECYCLE = { schemaVersion: 1, workspaces: [] };

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-tauri-plugins-'));
  execFileSync('git', ['init', '-q', root]);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const SHELL = {
  'shell/Cargo.toml': '[package]\nname = "shell"\n\n[dependencies]\ntauri-plugin-log = "2"\n',
  'shell/src/lib.rs': 'fn run() { b.plugin(tauri_plugin_log::Builder::new().build()); }\n',
  'app/src-tauri/tauri.conf.json': '{}',
  'app/src-tauri/Cargo.toml':
    '[package]\nname = "app"\n\n[dependencies]\ntauri-plugin-vol-x = { path = "../x" }\n',
  'app/src-tauri/src/main.rs': 'fn main() { b.plugin(tauri_plugin_vol_x::init()); }\n',
  'app/src-tauri/capabilities/default.json': JSON.stringify({
    permissions: ['core:default', 'vol-x:default'],
  }),
};

test('Cargo, kaynak ve yetenek ayrıştırıcıları', () => {
  assert.deepEqual(
    cargoPluginDeps(
      '[dependencies]\ntauri = "2"\ntauri-plugin-log = "2"\n\n[dependencies.tauri-plugin-a-b]\nversion = "1"\n\n[target.\'cfg(unix)\'.dependencies]\ntauri-plugin-c = "1"\n\n[dev-dependencies]\ntauri-plugin-dev = "1"\n',
    ),
    ['a-b', 'c', 'log'],
  );
  assert.deepEqual([...registeredPlugins(['x(tauri_plugin_a_b::init())'])], ['a_b']);
  assert.deepEqual(
    [...capabilityPrefixes([{ permissions: ['core:default', { identifier: 'vol-x:allow-y' }] }])],
    ['vol-x'],
  );
});

test('kurulu, izinli ve tüketilen eklentiler temiz geçer', () => {
  const root = repo(SHELL);
  try {
    assert.deepEqual(validateTauriPlugins(root, LIFECYCLE), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Rust kaydı olmayan JS eklentisi yakalanır', () => {
  const root = repo({
    ...SHELL,
    'web/package.json': JSON.stringify({ dependencies: { '@tauri-apps/plugin-haptics': '2' } }),
  });
  try {
    assert.match(
      validateTauriPlugins(root, LIFECYCLE).join('\n'),
      /plugin-haptics.*tauri_plugin_haptics/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kurulup hiçbir yere açılmayan eklenti ve kullanılmayan bağımlılık yakalanır', () => {
  const root = repo({
    ...SHELL,
    'shell/Cargo.toml':
      '[package]\nname = "shell"\n\n[dependencies]\ntauri-plugin-log = "2"\ntauri-plugin-store = "2"\n',
    'shell/src/lib.rs':
      'fn run() { b.plugin(tauri_plugin_log::Builder::new().build()).plugin(tauri_plugin_store::Builder::default().build()); }\n',
    'app/src-tauri/Cargo.toml':
      '[package]\nname = "app"\n\n[dependencies]\ntauri-plugin-vol-x = { path = "../x" }\ntauri-plugin-store = "2"\n',
  });
  try {
    const problems = validateTauriPlugins(root, LIFECYCLE).join('\n');
    assert.match(problems, /shell: tauri_plugin_store kuruluyor ama/);
    assert.match(problems, /app\/src-tauri\/Cargo.toml: tauri-plugin-store bağımlılığı/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('kurulmamış eklentiye verilen izin yakalanır', () => {
  const root = repo({
    ...SHELL,
    'app/src-tauri/capabilities/default.json': JSON.stringify({
      permissions: ['core:default', 'vol-x:default', 'vol-y:default'],
    }),
  });
  try {
    assert.match(validateTauriPlugins(root, LIFECYCLE).join('\n'), /"vol-y:" izni var/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
