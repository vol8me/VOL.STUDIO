import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';
import { test } from 'node:test';
import {
  normalizeWorkspacePath,
  validWorkspacePath,
  validateWorkspaceLifecycle,
} from '../workspaceLifecycle.mjs';

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
  value.lifecycle.workspaces.push({
    packageName: '',
    path: '../escape',
    status: 'active',
    extra: true,
  });
  const problems = validateWorkspaceLifecycle(value.root, value.lifecycle, [
    { name: '@vol/unregistered', dir: 'unregistered' },
  ]);
  const text = problems.join('\n');
  assert.match(text, /schemaVersion/);
  assert.match(text, /yinelenmiş/);
  assert.match(text, /"active" ya da "frozen" olmalı/);
  assert.match(text, /boş olmayan metin/);
  assert.match(text, /geçerli bir göreli repo yolu/);
  assert.match(text, /bilinmeyen alan/);
  assert.match(text, /@vol\/unregistered: workspace paketi lifecycle kaydı taşımıyor/);
  assert.match(text, /@vol\/active: lifecycle kaydı bayat/);
});

test('active paketin frozen pakete bağımlılığını reddeder', (t) => {
  const value = fixture(t);
  value.write(
    'active/package.json',
    JSON.stringify({
      name: '@vol/active',
      dependencies: { '@vol/frozen': 'workspace:*' },
    }),
  );
  const problems = validateWorkspaceLifecycle(value.root, value.lifecycle, value.packages);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /dependencies üzerinden frozen @vol\/frozen paketine bağlı/);
});

test('frozen ağaçtaki tracked drifti ve commit uyuşmazlığını bildirir', (t) => {
  const value = fixture(t);
  value.write('frozen/source.ts', 'export const frozen = false;\n');
  value.lifecycle.workspaces[1].freezeCommit = '1111111111111111111111111111111111111111';
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
  assert.equal(normalizeWorkspacePath('/repo', '/repo', posix), '');
  assert.equal(
    normalizeWorkspacePath('/repo', '/repo/devtools/nested/tool', posix),
    'devtools/nested/tool',
  );
});

test('normalizeWorkspacePath Windows sürücü harfi, backslash ve mixed separator yollarını doğru normalize eder', () => {
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo\\core', win32), 'core');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo\\games\\vol-hell', win32), 'games/vol-hell');
  assert.equal(normalizeWorkspacePath('D:\\vol.studio', 'D:\\vol.studio\\devtools\\vol-ui', win32), 'devtools/vol-ui');
  assert.equal(normalizeWorkspacePath('C:/repo', 'C:\\repo\\games\\vol-arachnid', win32), 'games/vol-arachnid');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:/repo/devtools/audio-synth', win32), 'devtools/audio-synth');
  assert.equal(normalizeWorkspacePath('c:\\repo', 'C:\\repo\\core', win32), 'core');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo', win32), '');
  assert.equal(normalizeWorkspacePath('C:\\repo', 'C:\\repo\\core\\', win32), 'core');
  assert.equal(
    normalizeWorkspacePath('C:\\repo', 'C:\\repo\\nested\\deep\\subtool', win32),
    'nested/deep/subtool',
  );
});

test('validWorkspacePath POSIX ve Windows yollarında güvenlik ve sınırları doğrular', () => {
  assert.equal(validWorkspacePath('/repo', 'core', posix), true);
  assert.equal(validWorkspacePath('/repo', 'games/vol-hell', posix), true);
  assert.equal(validWorkspacePath('/repo', '../escape', posix), false);
  assert.equal(validWorkspacePath('/repo', '', posix), false);
  assert.equal(validWorkspacePath('/repo', '/absolute', posix), false);

  assert.equal(validWorkspacePath('C:\\repo', 'core', win32), true);
  assert.equal(validWorkspacePath('C:\\repo', 'games/vol-hell', win32), true);
  assert.equal(validWorkspacePath('C:\\repo', 'games\\vol-hell', win32), true);
  assert.equal(validWorkspacePath('C:\\repo', '..\\escape', win32), false);
  assert.equal(validWorkspacePath('C:\\repo', '../escape', win32), false);
  assert.equal(validWorkspacePath('C:\\repo', '', win32), false);
  assert.equal(validWorkspacePath('C:\\repo', 'C:\\absolute', win32), false);
});
