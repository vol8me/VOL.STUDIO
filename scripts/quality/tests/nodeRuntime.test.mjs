import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { nodeRuntimeProblem } from '../nodeRuntime.mjs';

function fixture(t, engines = '22.23.1', pinned = '22.23.1') {
  const root = mkdtempSync(join(tmpdir(), 'vol-node-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, '.node-version'), `${pinned}\n`);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { node: engines } }));
  return root;
}

test('aynı kesin Node sürümü geçer', (t) => {
  const root = fixture(t);
  assert.equal(nodeRuntimeProblem(root, '22.23.1'), null);
  assert.equal(nodeRuntimeProblem(root, 'v22.23.1'), null);
});
test('farklı runtime yalnız destek aralığına girdiği için kabul edilmez', (t) => {
  const root = fixture(t);
  assert.match(nodeRuntimeProblem(root, '24.0.0'), /22\.23\.1 gerekir/);
  assert.match(nodeRuntimeProblem(root, '22.23.0'), /22\.23\.1 gerekir/);
});
test('sürüm dosyası ve manifest ayrışması reddedilir', (t) => {
  const root = fixture(t, '>=22.12.0');
  assert.match(nodeRuntimeProblem(root, '22.23.1'), /aynı kesin sürüm/);
});
test('sürüm dosyası kesin sürüm taşımalıdır', (t) => {
  const root = fixture(t, '22', '22');
  assert.match(nodeRuntimeProblem(root, '22'), /aynı kesin sürüm/);
});
