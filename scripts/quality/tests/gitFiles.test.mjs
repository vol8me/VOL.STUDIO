import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { workingTreeFiles } from '../gitFiles.mjs';

function repo(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-git-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

test('izlenen ve henüz eklenmemiş dosyalar birlikte görülür', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'tracked.ts'), 'x\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  writeFileSync(join(root, 'fresh.ts'), 'x\n');

  assert.deepEqual(workingTreeFiles(root, ['*.ts']), ['fresh.ts', 'tracked.ts']);
});

test('.gitignore ve node_modules altındaki dosyalar görülmez', (t) => {
  const root = repo(t);
  writeFileSync(join(root, '.gitignore'), 'ignored/\n');
  mkdirSync(join(root, 'ignored'));
  writeFileSync(join(root, 'ignored/a.ts'), 'x\n');
  mkdirSync(join(root, 'pkg/node_modules'), { recursive: true });
  writeFileSync(join(root, 'pkg/node_modules/b.ts'), 'x\n');
  writeFileSync(join(root, 'kept.ts'), 'x\n');

  assert.deepEqual(workingTreeFiles(root, ['*.ts']), ['kept.ts']);
});

test('indekste kalıp diskten silinen dosya listeye girmez', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'gone.ts'), 'x\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  unlinkSync(join(root, 'gone.ts'));

  assert.deepEqual(workingTreeFiles(root, ['*.ts']), []);
});

test('kalıp dışındaki uzantılar görülmez', (t) => {
  const root = repo(t);
  writeFileSync(join(root, 'a.css'), 'x\n');
  writeFileSync(join(root, 'b.json'), '{}\n');

  assert.deepEqual(workingTreeFiles(root, ['*.css']), ['a.css']);
});
