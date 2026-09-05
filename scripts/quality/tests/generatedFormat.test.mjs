import assert from 'node:assert/strict';
import test from 'node:test';
import { getFileInfo } from 'prettier';

test('üretilen Tauri JSON iki platform paketinde de format kapısının dışındadır', async () => {
  for (const root of ['tauri-v2', 'games/vol-arachnid']) {
    for (const file of [
      'gen/schemas/capabilities.json',
      'gen/android/app/src/main/assets/tauri.conf.json',
    ]) {
      const path = `${root}/src-tauri/${file}`;
      assert.equal(
        (await getFileInfo(path, { ignorePath: '.prettierignore' })).ignored,
        true,
        path,
      );
    }
    const path = `${root}/src-tauri/tauri.conf.json`;
    assert.equal((await getFileInfo(path, { ignorePath: '.prettierignore' })).ignored, false, path);
  }
});
