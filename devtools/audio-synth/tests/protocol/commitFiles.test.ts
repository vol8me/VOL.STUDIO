import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  commitFiles,
  fsyncDir,
  writeAllSync,
  writeFileAtomic,
  writeStaged,
} from '../../src/protocol/fs';

const roots: string[] = [];
function layout() {
  const root = mkdtempSync(join(tmpdir(), 'vol-commit-'));
  roots.push(root);
  const asset = join(root, 'public', 'a.ogg');
  const manifest = join(root, 'manifests', 'a.json');
  const stagingDir = join(root, 'staging');
  mkdirSync(join(root, 'public'), { recursive: true });
  mkdirSync(join(root, 'manifests'), { recursive: true });
  const stage = (name: string, data: string) => {
    const path = join(stagingDir, name);
    writeStaged(path, data);
    return path;
  };
  return { root, asset, manifest, stage };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const leftovers = (dir: string) => readdirSync(dir).filter((name) => name.startsWith('.tmp-'));

describe('commitFiles', () => {
  it('asset ve manifest birlikte yerleşir', () => {
    const { asset, manifest, stage } = layout();
    commitFiles([
      { staged: stage('a.ogg', 'yeni-ses'), target: asset },
      { staged: stage('a.json', '{"v":2}'), target: manifest },
    ]);
    expect(readFileSync(asset, 'utf8')).toBe('yeni-ses');
    expect(readFileSync(manifest, 'utf8')).toBe('{"v":2}');
  });

  it('yedek ayrılamazsa hedefler değişmez, ayrılan yedekler temizlenir', () => {
    const { root, asset, manifest, stage } = layout();
    writeFileSync(asset, 'eski-ses');
    writeFileSync(manifest, '{"v":1}');
    const files = [
      { staged: stage('a.ogg', 'yeni-ses'), target: asset },
      { staged: stage('a.json', '{"v":2}'), target: manifest },
      { staged: stage('invalid.json', '{}'), target: join(root, 'manifests') },
    ];
    expect(() => commitFiles(files)).toThrow();
    expect(readFileSync(asset, 'utf8')).toBe('eski-ses');
    expect(readFileSync(manifest, 'utf8')).toBe('{"v":1}');
    expect(leftovers(join(root, 'public'))).toEqual([]);
    expect(leftovers(join(root, 'manifests'))).toEqual([]);
  });

  it('asset yerleştikten sonra manifest düşerse asset geri döner', () => {
    const { root, asset, manifest, stage } = layout();
    writeFileSync(asset, 'eski-ses');
    writeFileSync(manifest, '{"v":1}');
    const staged = stage('a.json', '{"v":2}');
    rmSync(staged);
    expect(() =>
      commitFiles([
        { staged: stage('a.ogg', 'yeni-ses'), target: asset },
        { staged, target: manifest },
      ]),
    ).toThrow();
    expect(readFileSync(asset, 'utf8')).toBe('eski-ses');
    expect(readFileSync(manifest, 'utf8')).toBe('{"v":1}');
    expect(leftovers(join(root, 'public'))).toEqual([]);
    expect(leftovers(join(root, 'manifests'))).toEqual([]);
  });

  it('ilk yayında manifest yerleşemezse yeni asset geri alınır', () => {
    const { root, asset, stage } = layout();
    const blocked = join(root, 'blocked');
    writeFileSync(blocked, 'dizin değil');
    const manifest = join(blocked, 'a.json');
    const files = [
      { staged: stage('a.ogg', 'yeni-ses'), target: asset },
      { staged: stage('a.json', '{"v":1}'), target: manifest },
    ];
    expect(() => commitFiles(files)).toThrow();
    expect(existsSync(asset)).toBe(false);
    expect(leftovers(join(root, 'public'))).toEqual([]);
  });
});

describe('writeAllSync / writeFileAtomic', () => {
  it('kısmi yazımda kalan baytları döngüyle tamamlar', () => {
    const chunks: string[] = [];
    writeAllSync(7, 'merhaba dünya', (_fd, buffer, offset, length) => {
      const n = Math.min(3, length);
      chunks.push(Buffer.from(buffer.subarray(offset, offset + n)).toString('latin1'));
      return n;
    });
    expect(chunks.length).toBeGreaterThan(4);
    expect(Buffer.from(chunks.join(''), 'latin1').toString('utf8')).toBe('merhaba dünya');
  });

  it('ilerlemeyen yazım sonsuz döngü yerine hata verir', () => {
    expect(() => writeAllSync(7, 'x', () => 0)).toThrow(/ilerlemedi/);
  });

  it('hedefi yazar, dizini fsync eder ve geçici dosya bırakmaz', () => {
    const { root } = layout();
    const target = join(root, 'out', 'b.json');
    writeFileAtomic(target, '{"a":1}\n');
    writeFileAtomic(target, '{"a":2}\n');
    expect(readFileSync(target, 'utf8')).toBe('{"a":2}\n');
    expect(readdirSync(join(root, 'out'))).toEqual(['b.json']);
    expect(() => fsyncDir(join(root, 'out'))).not.toThrow();
  });

  it('Windows dizin fsync desteklemez; POSIX olmayan dizin hatasını korur', () => {
    const { root } = layout();
    const syncMissing = () => fsyncDir(join(root, 'yok'));
    if (process.platform === 'win32') expect(syncMissing).not.toThrow();
    else expect(syncMissing).toThrow(/ENOENT/);
  });
});
