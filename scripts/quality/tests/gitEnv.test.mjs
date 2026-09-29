import assert from 'node:assert/strict';
import { test } from 'node:test';

// Bekçi testleri geçici dizinlerde `git init/add/config` koşar. Hook'tan gelen
// GIT_DIR ya da GIT_INDEX_FILE bu çağrıları gerçek depoya yönlendirir: bağlı bir
// worktree'de index silinmiş, depo `core.bare=true` ve sahte kimlikle kalmıştı.
test('bekçi testleri git ortam yönlendirmesi olmadan koşar', () => {
  const leaked = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'].filter(
    (name) => process.env[name] !== undefined,
  );
  assert.deepEqual(leaked, [], 'testleri `just contract` ile koş');
});
