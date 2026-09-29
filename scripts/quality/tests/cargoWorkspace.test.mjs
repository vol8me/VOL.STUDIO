import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { matchesMember, validateCargoWorkspace, workspaceMembers } from '../cargoWorkspace.mjs';

const ROOT_TOML = '[workspace]\nresolver = "2"\nmembers = [\n  "shell",\n  "plugins/*",\n]\n';
const lifecycle = { workspaces: [{ path: 'games/old', status: 'frozen' }] };

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-cargo-ws-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

test('members listesi ayrışır; joker tek dizin segmentini karşılar', () => {
  assert.deepEqual(workspaceMembers(ROOT_TOML), ['shell', 'plugins/*']);
  assert.equal(matchesMember('plugins/a', 'plugins/*'), true);
  assert.equal(matchesMember('plugins/a/b', 'plugins/*'), false);
  assert.equal(workspaceMembers('[package]\nname = "x"\n'), null);
});

test('tek kilit ve tam üyelik geçer; frozen ağaç kural dışıdır', (t) => {
  const files = {
    'Cargo.toml': ROOT_TOML,
    'Cargo.lock': '',
    'shell/Cargo.toml': '[package]\nname = "shell"\n',
    'plugins/a/Cargo.toml': '[package]\nname = "a"\n',
    'games/old/src-tauri/Cargo.toml': '[package]\n[profile.release]\n',
    'games/old/src-tauri/Cargo.lock': '',
  };
  const root = fixture(t, files);
  const manifests = Object.keys(files).filter((f) => f.endsWith('.toml'));
  const locks = Object.keys(files).filter((f) => f.endsWith('.lock'));
  assert.deepEqual(validateCargoWorkspace(root, manifests, locks, lifecycle), []);
});

test('üye kilidi, üye olmayan crate ve üye profili reddedilir', (t) => {
  const files = {
    'Cargo.toml': ROOT_TOML,
    'Cargo.lock': '',
    'shell/Cargo.toml': '[package]\n[profile.release]\nlto = true\n',
    'shell/Cargo.lock': '',
    'stray/Cargo.toml': '[package]\n',
  };
  const root = fixture(t, files);
  const manifests = Object.keys(files).filter((f) => f.endsWith('.toml'));
  const locks = Object.keys(files).filter((f) => f.endsWith('.lock'));
  const problems = validateCargoWorkspace(root, manifests, locks, lifecycle);
  assert.equal(problems.length, 3);
  assert.match(problems[0], /shell\/Cargo.lock/);
  assert.match(problems[1], /profil/);
  assert.match(problems[2], /stray.*üyesi değil/);
});

test('kök workspace yoksa kapı düşer', (t) => {
  const root = fixture(t, { 'a/Cargo.toml': '' });
  assert.match(validateCargoWorkspace(root, ['a/Cargo.toml'], [], lifecycle)[0], /workspace/);
});

test('gerçek ağaç tek workspace kuralını sağlar', () => {
  assert.deepEqual(validateCargoWorkspace(resolve(import.meta.dirname, '../../..')), []);
});
