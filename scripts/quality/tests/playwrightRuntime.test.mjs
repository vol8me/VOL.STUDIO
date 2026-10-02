import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPlaywrightRuntime } from '../playwrightRuntime.mjs';

test('seçilen paketin gerçek tarayıcılarını başlatır; iki motor da geçmelidir', () => {
  const run = (command, args) => {
    assert.equal(command, 'pnpm');
    assert.deepEqual(args.slice(0, 3), ['--filter', '@volstudio/fixture', 'exec']);
    assert.match(args.at(-1), /engine\.launch/);
    return { status: 0, stdout: 'chromium: OK\nwebkit: OK', stderr: '' };
  };
  assert.equal(checkPlaywrightRuntime('@volstudio/fixture', run).ok, true);
  for (const result of [
    { status: 1, stdout: 'webkit: OK', stderr: 'chromium: Executable does not exist' },
    { status: 0, stdout: 'webkit: OK', stderr: '' },
    { status: null, error: new Error('spawn failed') },
  ])
    assert.equal(checkPlaywrightRuntime('@volstudio/fixture', () => result).ok, false);
});
