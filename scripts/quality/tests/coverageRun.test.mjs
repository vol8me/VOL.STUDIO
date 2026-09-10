import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { readStamp, selectRunPackages, stampPath } from '../coverageRun.mjs';

const PACKAGES = [
  { name: '@volstudio/audio-synth', dir: 'devtools/audio-synth' },
  { name: '@volstudio/core', dir: 'core' },
  { name: '@volstudio/vol-hell', dir: 'games/vol-hell' },
];

test('exclude adı geçenleri dışarıda bırakır, only yalnız onları seçer', () => {
  assert.deepEqual(
    selectRunPackages(PACKAGES, { exclude: ['@volstudio/audio-synth'] }).map((p) => p.name),
    ['@volstudio/core', '@volstudio/vol-hell'],
  );
  assert.deepEqual(
    selectRunPackages(PACKAGES, { only: ['@volstudio/audio-synth'] }).map((p) => p.name),
    ['@volstudio/audio-synth'],
  );
});

test('koşu kaydı yoksa null, varsa yazıldığı gibi okunur', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-cov-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(readStamp(root, 'coverage'), null);

  const stamp = { run: 'coverage', startedAt: 1, finishedAt: 2, packages: PACKAGES };
  mkdirSync(dirname(stampPath(root, 'coverage')), { recursive: true });
  writeFileSync(stampPath(root, 'coverage'), JSON.stringify(stamp));

  assert.deepEqual(readStamp(root, 'coverage'), stamp);
  assert.equal(readStamp(root, 'coverage-audio'), null);
});

test('kayıt repoya girmeyen node_modules önbelleğinde durur', () => {
  assert.match(stampPath('/r', 'coverage'), /node_modules[/\\]\.cache[/\\]vol-quality[/\\]coverage-coverage\.json$/);
});
