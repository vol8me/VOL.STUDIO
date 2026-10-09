import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from '../command.mjs';
import {
  clearReceipt,
  fingerprint,
  listReceipts,
  readReceipt,
  snapshotFiles,
  writeReceipt,
} from '../gateCache.mjs';

const GIT_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);

function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-gate-cache-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      env: GIT_ENV,
      encoding: 'utf8',
    });
  git('init', '-q');
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  for (const [path, text] of Object.entries(files)) write(path, text);
  git('add', '-A');
  git('commit', '-qm', 'init');
  return { root, git, write, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const all = () => true;

test('anlık görüntü izlenen, izlenmeyen ve yok sayılan dosyaları doğru ayırır', () => {
  const r = repo({ 'a.txt': 'a', '.gitignore': 'dist/\n', 'dist/out.js': 'x' });
  try {
    r.write('new.txt', 'n');
    const files = snapshotFiles(r.root);
    assert.ok(files.has('a.txt') && files.has('new.txt') && files.has('.gitignore'));
    assert.equal(files.has('dist/out.js'), false, 'yok sayılan dosya anahtara girmez');
  } finally {
    r.cleanup();
  }
});

test('içerik değişince karma değişir; aynı içerik aynı karmayı verir', () => {
  const r = repo({ 'a.txt': 'bir', 'b.txt': 'iki' });
  try {
    const first = fingerprint(snapshotFiles(r.root), all);
    assert.equal(fingerprint(snapshotFiles(r.root), all), first, 'aynı ağaç, aynı karma');

    r.write('a.txt', 'değişti');
    const edited = fingerprint(snapshotFiles(r.root), all);
    assert.notEqual(edited, first);

    r.write('a.txt', 'bir');
    assert.equal(fingerprint(snapshotFiles(r.root), all), first, 'eski içeriğe dönüş eski karma');
  } finally {
    r.cleanup();
  }
});

test('stage, commit ve izlenmeyen durum karmayı değiştirmez; yalnız içerik değiştirir', () => {
  const r = repo({ 'a.txt': 'bir' });
  try {
    r.write('c.txt', 'yeni');
    const untracked = fingerprint(snapshotFiles(r.root), all);
    r.git('add', '-A');
    assert.equal(fingerprint(snapshotFiles(r.root), all), untracked, 'stage etkisiz');
    r.git('commit', '-qm', 'c');
    assert.equal(fingerprint(snapshotFiles(r.root), all), untracked, 'commit etkisiz');
  } finally {
    r.cleanup();
  }
});

test('silinen dosya karmayı değiştirir; yok sayılan dosyanın değişmesi değiştirmez', () => {
  const r = repo({ 'a.txt': 'bir', 'b.txt': 'iki', '.gitignore': 'dist/\n' });
  try {
    r.write('dist/out.js', '1');
    const before = fingerprint(snapshotFiles(r.root), all);
    r.write('dist/out.js', '2');
    assert.equal(fingerprint(snapshotFiles(r.root), all), before, 'çıktı dizini anahtar dışı');
    unlinkSync(join(r.root, 'b.txt'));
    assert.notEqual(fingerprint(snapshotFiles(r.root), all), before);
  } finally {
    r.cleanup();
  }
});

test('kapsam süzgeci yalnız seçilen yolların değişimini görür; ek parça anahtarı ayırır', () => {
  const r = repo({ 'a/x.txt': '1', 'b/y.txt': '2' });
  try {
    const onlyA = (path) => path.startsWith('a/');
    const before = fingerprint(snapshotFiles(r.root), onlyA, ['v1']);
    r.write('b/y.txt', 'değişti');
    assert.equal(fingerprint(snapshotFiles(r.root), onlyA, ['v1']), before);
    r.write('a/x.txt', 'değişti');
    assert.notEqual(fingerprint(snapshotFiles(r.root), onlyA, ['v1']), before);
    assert.notEqual(
      fingerprint(snapshotFiles(r.root), onlyA, ['v2']),
      fingerprint(snapshotFiles(r.root), onlyA, ['v1']),
      'ortam/sürüm parçası anahtara girer',
    );
  } finally {
    r.cleanup();
  }
});

test('makbuz yazılır, anahtarla okunur ve yalnız o anahtar silinir', () => {
  const r = repo({ 'a.txt': '1' });
  try {
    const entry = (key) => ({ key, passedAt: 'x', durationMs: 5 });
    assert.equal(readReceipt(r.root, 'lint', null, 'k1'), null);
    writeReceipt(r.root, 'lint', null, entry('k1'));
    assert.equal(readReceipt(r.root, 'lint', null, 'k1')?.key, 'k1');
    assert.equal(readReceipt(r.root, 'lint', null, 'başka'), null, 'başka anahtar eşleşmez');
    writeReceipt(r.root, 'test', '@volstudio/core', entry('k2'));
    assert.equal(readReceipt(r.root, 'test', '@volstudio/core', 'k2')?.key, 'k2');
    assert.equal(readReceipt(r.root, 'test', '@volstudio/other', 'k2'), null, 'birim makbuzu ayrı');

    writeReceipt(r.root, 'lint', null, entry('k3'));
    assert.deepEqual(
      listReceipts(r.root, 'lint', null).map((item) => item.key),
      ['k3', 'k1'],
      'en yeni önce, eski geçiş geri alma için kalır',
    );
    clearReceipt(r.root, 'lint', null, 'k3');
    assert.deepEqual(
      listReceipts(r.root, 'lint', null).map((item) => item.key),
      ['k1'],
    );
    clearReceipt(r.root, 'lint', null, 'k1');
    assert.deepEqual(listReceipts(r.root, 'lint', null), []);
  } finally {
    r.cleanup();
  }
});

test('geçmiş sınırlıdır; aynı anahtar tekrar yazılınca çoğalmaz', () => {
  const r = repo({ 'a.txt': '1' });
  try {
    for (let index = 0; index < 8; index++) {
      writeReceipt(r.root, 'lint', null, { key: `k${index}`, passedAt: 'x', durationMs: 1 });
    }
    writeReceipt(r.root, 'lint', null, { key: 'k7', passedAt: 'y', durationMs: 1 });
    const keys = listReceipts(r.root, 'lint', null).map((item) => item.key);
    assert.deepEqual(keys, ['k7', 'k6', 'k5', 'k4', 'k3']);
  } finally {
    r.cleanup();
  }
});

test('eski tek-anahtar makbuz biçimi okunur; bozuk dosya makbuz sayılmaz', () => {
  const r = repo({ 'a.txt': '1' });
  try {
    const dir = join(r.root, 'node_modules/.cache/vol-quality/gates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'lint.json'),
      JSON.stringify({ key: 'eski', passedAt: 'x', durationMs: 1 }),
    );
    assert.equal(readReceipt(r.root, 'lint', null, 'eski')?.key, 'eski');
    writeFileSync(join(dir, 'test___volstudio_core.json'), '{bozuk');
    assert.deepEqual(listReceipts(r.root, 'test', '@volstudio/core'), []);
  } finally {
    r.cleanup();
  }
});
