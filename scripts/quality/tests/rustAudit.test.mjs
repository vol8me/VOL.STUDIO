import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { rustManifests } from '../rust.mjs';
import { activeCargoLocks } from '../rustAudit.mjs';
import { loadRepoLifecycle } from '../workspaceLifecycle.mjs';

test('güvenlik kapısı yalnız aktif paketlerin kilitlerini denetler', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-rust-audit-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    for (const path of ['Cargo.lock', 'games/old/src-tauri/Cargo.lock']) {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), '');
    }
    const lifecycle = {
      workspaces: [
        { path: 'core', status: 'active' },
        { path: 'games/old', status: 'frozen' },
      ],
    };
    assert.deepEqual(activeCargoLocks(root, lifecycle), ['Cargo.lock']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('gerçek ağaçta bütün aktif crate’ler kökteki tek kilitle denetlenir', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const lifecycle = loadRepoLifecycle(root);
  assert.ok(lifecycle);
  assert.deepEqual(activeCargoLocks(root, lifecycle), ['Cargo.lock']);
  assert.ok(rustManifests(root, lifecycle).length >= 5);
});
