import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import { test } from 'node:test';
import { normalizeWorkspacePath, validateWorkspaceLifecycle } from '../workspaceLifecycle.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol-lifecycle-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'VOL Test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@vol.local'], { cwd: root });
  const write = (file, contents) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };
  write('active/package.json', JSON.stringify({ name: '@vol/active' }));
  write('frozen/package.json', JSON.stringify({ name: '@vol/frozen' }));
  write('frozen/source.ts', 'export const frozen = true;\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'freeze fixture'], { cwd: root });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  execFileSync('git', ['tag', '-a', 'freeze/test', '-m', 'fixture', commit], { cwd: root });
  const packages = [
    { name: '@vol/active', dir: 'active' },
    { name: '@vol/frozen', dir: 'frozen' },
  ];
  const lifecycle = {
    schemaVersion: 1,
    workspaces: [
      { packageName: '@vol/active', path: 'active', status: 'active' },
      {
        packageName: '@vol/frozen',
        path: 'frozen',
        status: 'frozen',
        freezeTag: 'freeze/test',
        freezeCommit: commit,
        decisionDate: '2026-09-21',
        reason: 'Tamamlanmış ürün snapshotı.',
      },
    ],
  };
  return { root, write, packages, lifecycle, commit };
}

test('geçerli active/frozen kayıt, tag ve değişmemiş ağaç geçer', (t) => {
  const value = fixture(t);
  assert.deepEqual(validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages), []);
});

test('duplicate, stale, eksik ve geçersiz lifecycle kayıtlarını birlikte bildirir', (t) => {
  const value = fixture(t);
  value.lifecycle.schemaVersion = 2;
  value.lifecycle.workspaces.push({
    packageName: '@vol/frozen',
    path: 'frozen',
    status: 'retired',
  });
  value.lifecycle.workspaces.push({ packageName: '@vol/stale', path: 'stale', status: 'active' });
  value.lifecycle.workspaces = value.lifecycle.workspaces.filter(
    (record, index) => record.packageName !== '@vol/active' || index > 10,
  );
  const text = validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n');
  assert.match(text, /schemaVersion/);
  assert.match(text, /paket adı yinelenmiş/);
  assert.match(text, /yolu yinelenmiş/);
  assert.match(text, /status: "active" ya da "frozen"/);
  assert.match(text, /@vol\/active: workspace paketi lifecycle kaydı taşımıyor/);
  assert.match(text, /@vol\/stale: lifecycle kaydı bayat/);
});

test('active paketin frozen pakete bağımlılığını reddeder', (t) => {
  const value = fixture(t);
  value.write(
    'active/package.json',
    JSON.stringify({ name: '@vol/active', dependencies: { '@vol/frozen': 'workspace:*' } }),
  );
  assert.match(
    validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n'),
    /active.*frozen.*bağlı/,
  );
});

test('tag/commit uyuşmazlığını ve frozen tracked driftini reddeder', (t) => {
  const value = fixture(t);
  value.write('frozen/source.ts', 'export const frozen = false;\n');
  value.lifecycle.workspaces[1].freezeCommit = '0'.repeat(40);
  const text = validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n');
  assert.match(text, /freeze git kanıtı doğrulanamadı/);

  value.lifecycle.workspaces[1].freezeCommit = value.commit;
  assert.match(
    validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n'),
    /frozen ağaç freeze commit'ten sapmış/,
  );
});

test('frozen ağaçtaki non-ignored untracked dosyayı reddeder', (t) => {
  const value = fixture(t);
  value.write('frozen/unexpected.ts', 'export {};\n');
  assert.match(
    validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n'),
    /izlenmeyen dosya var.*unexpected\.ts/,
  );
});

test('lightweight freeze etiketi annotated kanıt yerine geçmez', (t) => {
  const value = fixture(t);
  execFileSync('git', ['tag', 'freeze/lightweight', value.commit], { cwd: value.root });
  value.lifecycle.workspaces[1].freezeTag = 'freeze/lightweight';
  assert.match(
    validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages).join('\n'),
    /annotated Git etiketi olmalı/,
  );
});

test('normalizeWorkspacePath POSIX yollarını doğru normalize eder', () => {
  assert.equal(normalizeWorkspacePath('/repo', '/repo/core', posix), 'core');
  assert.equal(normalizeWorkspacePath('/repo', '/repo/games/vol-hell', posix), 'games/vol-hell');
  assert.equal(normalizeWorkspacePath('/repo', '/repo/devtools/vol-ui', posix), 'devtools/vol-ui');
});

test('normalizeWorkspacePath Windows sürücü harfi, backslash ve mixed separator yollarını doğru normalize eder', () => {
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo\\core', win32), 'core');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo\\games\\vol-hell', win32), 'games/vol-hell');
  assert.equal(normalizeWorkspacePath('D:\\vol.studio', 'D:\\vol.studio\\devtools\\vol-ui', win32), 'devtools/vol-ui');
  assert.equal(normalizeWorkspacePath('C:/repo', 'C:\\repo\\games\\vol-arachnid', win32), 'games/vol-arachnid');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:/repo/devtools/audio-synth', win32), 'devtools/audio-synth');
  assert.equal(normalizeWorkspacePath('c:\\repo', 'C:\\repo\\core', win32), 'core');
});
