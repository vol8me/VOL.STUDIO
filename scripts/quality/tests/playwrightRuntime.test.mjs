import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPlaywrightRuntime } from '../playwrightRuntime.mjs';

test('seçilen paketin gerçek tarayıcılarını başlatır; iki motor da geçmelidir', () => {
  const run = (command, args, options) => {
    assert.equal(command, 'pnpm');
    assert.deepEqual(args.slice(0, 3), ['--filter', '@volstudio/fixture', 'exec']);
    assert.equal(args.at(-1), '-');
    assert.ok(args.every((arg) => !/[\r\n]/.test(arg)));
    assert.match(options.input, /engine\.launch/);
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
