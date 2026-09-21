import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getFileInfo } from 'prettier';
import {
  activeWorkspacePaths,
  loadRepoLifecycle,
} from '../workspaceLifecycle.mjs';

const root = resolve(import.meta.dirname, '../../..');
const lifecycle = loadRepoLifecycle(root);
assert.ok(lifecycle, 'workspace-lifecycle.json okunamadı');

// Üretilen Tauri JSON'u format kapısının dışında kalır; elle yazılan
// `tauri.conf.json` ise formatlanabilir olmalı. Frozen ağaçlar rutin format
// kapısının tamamen dışındadır — bu test yalnız aktif kabukları sınar.
// Sonda dosyaların varlığı gerekmez: getFileInfo yalnız ignore deseni çözer.
const SHELLS = activeWorkspacePaths(lifecycle).filter((path) =>
  existsSync(join(root, path, 'src-tauri')),
);

test('üretilen Tauri JSON aktif kabuklarda format kapısının dışındadır', async () => {
  assert.ok(SHELLS.length > 0, 'En az bir aktif Tauri kabuğu bulunmalı');
  for (const workspacePath of SHELLS) {
    for (const file of [
      'gen/schemas/capabilities.json',
      'gen/android/app/src/main/assets/tauri.conf.json',
    ]) {
      const path = `${workspacePath}/src-tauri/${file}`;
      assert.equal(
        (await getFileInfo(path, { ignorePath: '.prettierignore' })).ignored,
        true,
        path,
      );
    }
    const path = `${workspacePath}/src-tauri/tauri.conf.json`;
    assert.equal((await getFileInfo(path, { ignorePath: '.prettierignore' })).ignored, false, path);
  }
});
