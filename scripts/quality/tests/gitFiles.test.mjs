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

function isIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', path], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

test('repo ignore sözleşmesi sırları ve üretilen çıktıları kapsar, kaynakları korur', () => {
  const ignored = [
    '.env',
    'games/sample-game/dist/index.js',
    'games/sample-game/coverage/lcov.info',
    'games/sample-game/observer.log',
    'games/sample-game/src-tauri/gen/android/app/build/output.apk',
    'tauri-v2/plugins/vol-haptics/android/build/intermediates/plugin.dex',
    'tauri-v2/plugins/vol-haptics/android/.gradle/cache.bin',
    '.claude/arastirma/rapor.jsonl',
    'graphify-out/graph.json',
  ];
  const kept = [
    'games/sample-game/DESIGN.md',
    'games/sample-game/src/i18n/tr.json',
    'games/sample-game/public/assets/example.ogg',
    'games/sample-game/src-tauri/gen/android/app/src/main/AndroidManifest.xml',
    'tauri-v2/plugins/vol-haptics/android/build.gradle.kts',
    'tauri-v2/plugins/vol-haptics/android/src/main/java/com/volstudio/haptics/HapticsPlugin.kt',
    'AGENTS.md',
    'CLAUDE.md',
    'devtools/pen.dev/AGENTS.md',
  ];

  for (const path of ignored) assert.equal(isIgnored(path), true, `${path} ignore edilmeli`);
  for (const path of kept) assert.equal(isIgnored(path), false, `${path} kaynak olarak kalmalı`);
});
