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
  validateWindowPermissions,
  WINDOW_PERMISSIONS,
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

const ADAPTER = `export class TauriWindowAdapter {
  async setFullscreen(a) { await this.window?.setFullscreen(a); }
  async setResolution(w, h) { await this.window.setSize(w); await this.window.center(); }
}\n`;
const WINDOW_APP = (permissions, source = 'new DisplayModeController({});') => ({
  'tauri-v2/src/window/TauriWindowAdapter.ts': ADAPTER,
  'game/src-tauri/tauri.conf.json': '{}',
  'game/src/main.ts': source,
  'game/src-tauri/capabilities/desktop.json': JSON.stringify({
    platforms: ['linux', 'windows'],
    permissions,
  }),
  'game/src-tauri/capabilities/mobile.json': JSON.stringify({
    platforms: ['android'],
    permissions: ['core:default'],
  }),
});

test('pencereyi süren uygulama her pencere komutunun iznini masaüstü yeteneğinde taşır', () => {
  const root = repo(WINDOW_APP(['core:default', ...Object.values(WINDOW_PERMISSIONS)]));
  try {
    assert.deepEqual(validateWindowPermissions(root, LIFECYCLE), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('eksik pencere izni yakalanır (center: pencereli kipe dönüşte sessizce düşerdi)', () => {
  const root = repo(
    WINDOW_APP(['core:default', 'core:window:allow-set-fullscreen', 'core:window:allow-set-size']),
  );
  try {
    const problems = validateWindowPermissions(root, LIFECYCLE).join('\n');
    assert.match(problems, /game\/src-tauri\/capabilities.*this\.window\.center.*allow-center/);
    assert.doesNotMatch(problems, /allow-set-size|allow-set-fullscreen/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('izin yalnız mobil yetenekte verilmişse masaüstü eksik sayılır', () => {
  const files = WINDOW_APP(['core:default']);
  files['game/src-tauri/capabilities/mobile.json'] = JSON.stringify({
    platforms: ['android'],
    permissions: ['core:default', ...Object.values(WINDOW_PERMISSIONS)],
  });
  const root = repo(files);
  try {
    assert.equal(validateWindowPermissions(root, LIFECYCLE).length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('pencereyi sürmeyen uygulamadan pencere izni istenmez', () => {
  const root = repo(WINDOW_APP(['core:default'], 'export const idle = 1;'));
  try {
    assert.deepEqual(validateWindowPermissions(root, LIFECYCLE), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('izin tablosunda olmayan yeni pencere çağrısı yakalanır', () => {
  const files = WINDOW_APP(['core:default', ...Object.values(WINDOW_PERMISSIONS)]);
  files['tauri-v2/src/window/TauriWindowAdapter.ts'] =
    `${ADAPTER}\nfoo() { this.window.minimize(); }\n`;
  const root = repo(files);
  try {
    assert.match(
      validateWindowPermissions(root, LIFECYCLE).join('\n'),
      /this\.window\.minimize\(\).*WINDOW_PERMISSIONS/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gerçek depo: pencere komutlarının izinleri tablodadır ve uygulamalarda verilmiştir', () => {
  assert.deepEqual(validateWindowPermissions(process.cwd(), LIFECYCLE), []);
});
