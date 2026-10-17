import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateBlobSizes } from '../blobSize.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-blobs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  return root;
}
const large = Buffer.alloc(2 * 1024 * 1024 + 1);

test('yeni büyük dosya, sahnelenmeden de reddedilir; küçük dosya geçer', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'master.wav'), large);
  assert.match(validateBlobSizes(root).join('\n'), /master.wav/);
  writeFileSync(join(root, 'master.wav'), 'small');
  assert.deepEqual(validateBlobSizes(root), []);
});

test('index büyükken çalışma ağacını küçültmek veya silmek commit boyutunu gizleyemez', (t) => {
  const root = fixture(t);
  const file = join(root, 'master.wav');
  writeFileSync(file, large);
  execFileSync('git', ['add', 'master.wav'], { cwd: root });
  writeFileSync(file, 'small');
  assert.match(validateBlobSizes(root).join('\n'), /master.wav/);
  rmSync(file);
  assert.match(validateBlobSizes(root).join('\n'), /master.wav/);
});

test('kaynak belgesinin muafiyeti yalnız tam yol için geçerlidir', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'devtools/pen.dev/pen'), { recursive: true });
  writeFileSync(join(root, 'devtools/pen.dev/pen/entities.pen'), large);
  assert.deepEqual(validateBlobSizes(root), []);
  writeFileSync(join(root, 'entities.pen'), large);
  assert.match(validateBlobSizes(root).join('\n'), /^entities.pen/);
});

test('git okunamadığında ölçüm geçerli sayılmaz', (t) => {
  const root = fixture(t);
  rmSync(join(root, '.git'), { recursive: true });
  assert.match(validateBlobSizes(root).join('\n'), /doğrulanamadı/);
});
