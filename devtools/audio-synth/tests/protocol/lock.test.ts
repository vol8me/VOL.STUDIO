import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtocolError } from '../../src/protocol/errors';
import { LOCK_UNREADABLE_STALE_MS, withLock } from '../../src/protocol/fs';

const dirs: string[] = [];
const dir = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'vol-lock-'));
  dirs.push(path);
  return path;
};
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error instanceof ProtocolError ? error.code : 'other';
  }
};

describe('withLock', () => {
  it('pid yazılmadan görülen boş kilit canlı sayılır, çalınmaz', () => {
    const root = dir();
    writeFileSync(join(root, '.lock'), '');
    expect(code(() => withLock(root, 'x', () => 1))).toBe('locked');
    expect(existsSync(join(root, '.lock'))).toBe(true);
  });

  it('okunamayan kilit ancak yaşlanınca bayat sayılır', () => {
    const root = dir();
    const lock = join(root, '.lock');
    writeFileSync(lock, '');
    const old = (Date.now() - LOCK_UNREADABLE_STALE_MS - 1000) / 1000;
    utimesSync(lock, old, old);
    expect(withLock(root, 'x', () => 7)).toBe(7);
    expect(existsSync(lock)).toBe(false);
  });

  it('ölü sürecin kilidi devralınır, yaşayanınki durdurur', () => {
    const root = dir();
    writeFileSync(join(root, '.lock'), '2147483646');
    expect(withLock(root, 'x', () => 'ok')).toBe('ok');
    writeFileSync(join(root, '.lock'), String(process.ppid));
    expect(code(() => withLock(root, 'x', () => 1))).toBe('locked');
  });

  it('bırakırken başkasının kilidini silmez ve geçici dosya bırakmaz', () => {
    const root = dir();
    withLock(root, 'x', () => {
      writeFileSync(join(root, '.lock'), String(process.ppid));
    });
    expect(existsSync(join(root, '.lock'))).toBe(true);
    expect(readdirSync(root).filter((name) => name.startsWith('.tmp-'))).toEqual([]);
  });
});
