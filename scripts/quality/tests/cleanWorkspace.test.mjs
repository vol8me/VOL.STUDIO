import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const recipe = readFileSync(resolve(import.meta.dirname, '../../../justfile'), 'utf8');
const just = resolve(import.meta.dirname, '../../../node_modules/.bin/just');

test('temizlik aktif oyun raporlarını kaldırır; gönderilen asset ve frozen çıktı kalır', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-clean-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const outputs = [
    'games/probe/dist',
    'games/probe/coverage',
    'games/probe/test-results',
    'games/probe/playwright-report',
  ];
  const retained = [
    'games/probe/public/assets',
    'games/probe/src',
    'games/frozen/dist',
    'node_modules/library',
  ];
  const protectedFiles = [
    '.claude/arastirma/protected.tsbuildinfo',
    'notes/user.tsbuildinfo',
    'games/unregistered/user.tsbuildinfo',
    'root-user.tsbuildinfo',
    'games/probe/public/assets/asset.tsbuildinfo',
  ];
  for (const path of [...outputs, ...retained, '.claude/arastirma', 'notes', 'games/unregistered'])
    mkdirSync(join(root, path), { recursive: true });
  for (const path of [...outputs, ...retained]) writeFileSync(join(root, path, 'keep'), 'data');
  for (const path of protectedFiles) writeFileSync(join(root, path), 'user-owned');
  writeFileSync(
    join(root, 'workspace-lifecycle.json'),
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { path: 'games/probe', packageName: '@volstudio/probe', status: 'active' },
        {
          path: 'games/frozen',
          packageName: '@volstudio/frozen',
          status: 'frozen',
          freezeTag: 'freeze/probe',
          freezeCommit: 'a'.repeat(40),
          decisionDate: '2026-10-01',
          reason: 'Tamamlandı',
        },
      ],
    }),
  );
  mkdirSync(join(root, 'scripts/quality'), { recursive: true });
  for (const file of ['cleanWorkspace.mjs', 'workspaceLifecycle.mjs']) {
    copyFileSync(resolve(import.meta.dirname, '..', file), join(root, 'scripts/quality', file));
  }
  writeFileSync(join(root, 'justfile'), recipe);
  mkdirSync(join(root, 'target'), { recursive: true });
  writeFileSync(join(root, 'games/probe/src/probe.tsbuildinfo'), 'cache');
  writeFileSync(join(root, 'games/frozen/dist/probe.tsbuildinfo'), 'cache');
  writeFileSync(join(root, 'node_modules/library/probe.tsbuildinfo'), 'cache');
  const run = spawnSync(just, ['clean'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const path of outputs) assert.equal(existsSync(join(root, path)), false, path);
  for (const path of retained) assert.equal(existsSync(join(root, path)), true, path);
  assert.equal(existsSync(join(root, 'games/probe/src/probe.tsbuildinfo')), false);
  assert.equal(existsSync(join(root, 'games/frozen/dist/probe.tsbuildinfo')), true);
  assert.equal(existsSync(join(root, 'node_modules/library/probe.tsbuildinfo')), true);
  assert.equal(existsSync(join(root, 'target')), true);
  for (const path of protectedFiles)
    assert.equal(readFileSync(join(root, path), 'utf8'), 'user-owned', path);
  const full = spawnSync(just, ['clean-all'], { cwd: root, encoding: 'utf8' });
  assert.equal(full.status, 0, full.stderr);
  assert.equal(existsSync(join(root, 'target')), false);
  for (const path of protectedFiles)
    assert.equal(readFileSync(join(root, path), 'utf8'), 'user-owned', path);
});
