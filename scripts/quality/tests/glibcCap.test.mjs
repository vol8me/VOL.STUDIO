import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkGlibcCap, compareVersions, elfGlibcNeeds, isElf } from '../../glibc-cap.mjs';

const VERNEED_SAMPLE = `
Version needs section '.gnu.version_r' contains 2 entries:
 Addr: 0x0000000000009128  Offset: 0x009128  Link: 4 (.dynstr)
  000000: Version: 1  File: libc.so.6  Cnt: 6
  0x0010:   Name: GLIBC_2.38  Flags: none  Version: 15
  0x0020:   Name: GLIBC_2.34  Flags: none  Version: 14
  0x0030:   Name: GLIBC_ABI_DT_RELR  Flags: none  Version: 13
Version definition section '.gnu.version_d' contains 1 entries:
  0x0040:   Name: FOO_1.0  Flags: none  Version: 2
`;

test('elfGlibcNeeds: yalnız GLIBC_X.Y adları, ABI ve başka önekler dışarıda', () => {
  assert.deepEqual([...elfGlibcNeeds(VERNEED_SAMPLE)].sort(), ['2.34', '2.38']);
  assert.deepEqual([...elfGlibcNeeds('')], []);
});

test('compareVersions: sayısal karşılaştırma (2.41 < 2.43, 2.9 > 2.41 değil)', () => {
  assert.ok(compareVersions('2.42', '2.41') > 0);
  assert.ok(compareVersions('2.41', '2.41') === 0);
  assert.ok(compareVersions('2.9', '2.41') < 0);
});

test('isElf: ELF sihirli baytları', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vol-glibc-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const elf = join(dir, 'a.so');
  const text = join(dir, 'a.txt');
  writeFileSync(elf, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
  writeFileSync(text, 'elf değil');
  assert.equal(isElf(elf), true);
  assert.equal(isElf(text), false);
});

test('checkGlibcCap: üst sürüm isteyen ELF bildirilir, sınır içi sessiz', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vol-glibc-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'usr', 'bin'), { recursive: true });
  const good = join(dir, 'usr', 'bin', 'good');
  const bad = join(dir, 'usr', 'bin', 'bad');
  writeFileSync(good, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]));
  writeFileSync(bad, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]));

  const readelf = (path) =>
    path === bad ? VERNEED_SAMPLE.replace('GLIBC_2.38', 'GLIBC_2.43') : VERNEED_SAMPLE;

  const over = checkGlibcCap(dir, '2.41', readelf);
  assert.equal(over.files, 2);
  assert.deepEqual(
    over.offenders.map((o) => o.path),
    [bad],
  );
  assert.deepEqual(over.offenders[0].needs, ['2.43']);

  const clean = checkGlibcCap(dir, '2.41', () => VERNEED_SAMPLE);
  assert.equal(clean.offenders.length, 0);
});
