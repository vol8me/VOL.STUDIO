import {
  chmodSync,
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
import { commitFiles, writeStaged } from '../../src/protocol/fs';

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
    chmodSync(join(root, 'manifests'), 0o755);
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

  it('manifest yerleşemezse asset eski hâline döner, artık kalmaz', () => {
    const { root, asset, manifest, stage } = layout();
    writeFileSync(asset, 'eski-ses');
    writeFileSync(manifest, '{"v":1}');
    const files = [
      { staged: stage('a.ogg', 'yeni-ses'), target: asset },
      { staged: stage('a.json', '{"v":2}'), target: manifest },
    ];
    chmodSync(join(root, 'manifests'), 0o555);
    expect(() => commitFiles(files)).toThrow();
    expect(readFileSync(asset, 'utf8')).toBe('eski-ses');
    expect(readFileSync(manifest, 'utf8')).toBe('{"v":1}');
    expect(leftovers(join(root, 'public'))).toEqual([]);
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
    const { root, asset, manifest, stage } = layout();
    const files = [
      { staged: stage('a.ogg', 'yeni-ses'), target: asset },
      { staged: stage('a.json', '{"v":1}'), target: manifest },
    ];
    chmodSync(join(root, 'manifests'), 0o555);
    expect(() => commitFiles(files)).toThrow();
    expect(existsSync(asset)).toBe(false);
  });
});
