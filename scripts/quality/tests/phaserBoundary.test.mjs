import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validatePhaserBoundary } from '../phaserBoundary.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-phaser-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  return { root, write };
}

test('allowed bridge exact ledger ile geçer', (t) => {
  const { root, write } = fixture(t);
  const bridge = 'core/src/phaser/allowed.ts';
  write(bridge, 'import type Phaser from "phaser"; export type Scene = Phaser.Scene;');
  assert.deepEqual(validatePhaserBoundary(root, [bridge]), []);
});

test('root ve yasak klasör Phaser importu AST ile yakalanır', (t) => {
  const { root, write } = fixture(t);
  write('core/src/Game.ts', 'export { AUTO } from "phaser";');
  write('core/src/rig/layout.ts', 'const load = () => import("phaser");');
  const problems = validatePhaserBoundary(root, []);
  assert.match(problems.join('\n'), /core\/src\/Game\.ts: doğrudan Phaser importu/);
  assert.match(problems.join('\n'), /core\/src\/rig\/layout\.ts: doğrudan Phaser importu/);
});

test('require ve ledger dışı yeni untracked bridge kaçamaz', (t) => {
  const { root, write } = fixture(t);
  write('core/src/phaser/fresh.ts', 'const Phaser = require("phaser");');
  assert.match(validatePhaserBoundary(root, []).join('\n'), /bridge ledger kaydı yok/);
});

test('bayat ve Phaser import etmeyen ledger kaydı reddedilir', (t) => {
  const { root, write } = fixture(t);
  write('core/src/phaser/pure.ts', 'export const value = 1;');
  const problems = validatePhaserBoundary(root, [
    'core/src/phaser/pure.ts',
    'core/src/phaser/missing.ts',
  ]);
  assert.match(problems.join('\n'), /doğrudan Phaser importu yok/);
  assert.match(problems.join('\n'), /dosya yok/);
});
