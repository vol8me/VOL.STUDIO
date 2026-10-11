import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { validateRepoSnapshotPlatforms, validateSnapshotPlatforms } from '../snapshotPlatforms.mjs';

const dir = 'pkg/tests/e2e/visual.spec.ts-snapshots';
const file = (name, platform, project = 'chromium') => `${dir}/${name}-${project}-${platform}.png`;

test('tek platformlu küme ve eşit kümeler sorun üretmez', () => {
  assert.deepEqual(validateSnapshotPlatforms([file('a', 'win32'), file('b', 'win32')]), []);
  assert.deepEqual(
    validateSnapshotPlatforms([
      file('a', 'win32'),
      file('b', 'win32'),
      file('a', 'linux'),
      file('b', 'linux'),
    ]),
    [],
  );
});

test('eksik platform kümesi klasör, sayı ve örnek adla bildirilir', () => {
  const files = [
    file('a', 'win32'),
    file('b', 'win32'),
    file('c', 'win32'),
    file('d', 'win32'),
    file('a', 'linux'),
  ];
  const problems = validateSnapshotPlatforms(files);
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^pkg\/tests\/e2e\/visual\.spec\.ts-snapshots: "linux" temel kümesi eksik/,
  );
  assert.match(problems[0], /\(1\/4; örn\. b-chromium, c-chromium, d-chromium\)/);
});

test('proje farkı ayrı ad sayılır; klasörler birbirinden bağımsızdır', () => {
  const problems = validateSnapshotPlatforms([
    file('a', 'win32', 'chromium'),
    file('a', 'linux', 'webkit'),
    'other/x.spec.ts-snapshots/a-chromium-win32.png',
  ]);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((problem) => problem.startsWith('pkg/')));
});

test('snapshot klasörü olmayan ve ad kalıbına uymayan PNG yok sayılır', () => {
  assert.deepEqual(
    validateSnapshotPlatforms([
      'docs/img/logo-chromium-win32.png',
      `${dir}/readme.png`,
      file('a', 'win32'),
    ]),
    [],
  );
});

test('depo taraması izlenmeyen yeni PNG kümesini de görür', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-snap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path) => {
    mkdirSync(join(root, dirname(path)), { recursive: true });
    writeFileSync(join(root, path), '');
  };
  write(file('a', 'win32'));
  write(file('b', 'win32'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  write(file('a', 'linux'));
  const problems = validateRepoSnapshotPlatforms(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"linux" temel kümesi eksik \(1\/2/);
});
