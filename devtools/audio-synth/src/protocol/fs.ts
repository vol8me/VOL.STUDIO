import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ProtocolError } from './errors';

/**
 * Dosya sistemi sınırı. Protokol belgelerindeki her yol REPO KÖKÜNE göreli,
 * `/` ayraçlı ve normalize yazılır; host'a özgü mutlak yol bir belgeye
 * girmez. Okuma/yazma yalnız izin verilen kök altında ve sembolik bağ
 * geçmeden yapılır.
 */
const SEGMENT = /^[A-Za-z0-9._@-]+$/;

export function checkRepoRelative(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new ProtocolError('path', 'boş olmayan göreli yol olmalı', label);
  }
  if (
    value.includes('\\') ||
    value.includes('\0') ||
    /^[A-Za-z]:/.test(value) ||
    value.startsWith('/')
  ) {
    throw new ProtocolError(
      'path',
      `mutlak ya da platforma özgü yol kabul edilmez: ${value}`,
      label,
    );
  }
  for (const segment of value.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || !SEGMENT.test(segment)) {
      throw new ProtocolError('path', `geçersiz yol parçası "${segment}" (${value})`, label);
    }
  }
  return value;
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Göreli yolu kökün altında mutlak yola çevirir. Var olan her ara parça
 * `lstat` ile denetlenir: sembolik bağ kökten kaçışın ve "aynı görünen iki
 * yol"un kapısıdır; protokol ağacında kabul edilmez.
 */
export function resolveInside(root: string, repoRelative: string, label: string): string {
  const base = realpathSync(root);
  const target = resolve(base, checkRepoRelative(repoRelative, label));
  if (!isInside(base, target)) throw new ProtocolError('path', 'kök dışına çıkıyor', label);
  let cursor = base;
  for (const segment of relative(base, target).split(sep)) {
    cursor = join(cursor, segment);
    if (!existsSync(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new ProtocolError(
        'symlink',
        `sembolik bağ üzerinden erişim reddedildi (${repoRelative})`,
        label,
      );
    }
  }
  return target;
}

export function toRepoRelative(root: string, absolute: string): string {
  return relative(realpathSync(root), absolute).split(sep).join('/');
}

let tempCounter = 0;

/**
 * Atomik yazım: aynı dizinde benzersiz geçici dosya (`wx`), fsync, rename.
 * Yarıda kalan yazım hedefi ASLA yarım bırakmaz — ya eski içerik ya yenisi
 * görünür; geride kalan geçici dosya `.tmp-` önekiyle tanınır.
 */
export function writeFileAtomic(target: string, data: string | Uint8Array): void {
  mkdirSync(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.tmp-${process.pid}-${++tempCounter}-${Date.now()}`);
  const fd = openSync(temp, 'wx');
  try {
    writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export function readJsonFile(path: string, label: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ProtocolError('not-found', 'okunamadı', label);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProtocolError('corrupt', 'JSON ayrıştırılamadı (yarım ya da bozuk yazım)', label);
  }
}

function lockOwnerAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Tek yazıcı kilidi: `wx` ile oluşturulan kilit dosyası sahibinin pid'ini
 * taşır. Sahibi yaşamıyorsa (çöken süreç) kilit bayat sayılır ve alınır;
 * yaşıyorsa ikinci yazıcı `locked` ile durur.
 */
function acquireLock(lock: string, label: string): void {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lock, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const owner = Number(readFileSync(lock, 'utf8'));
    if (Number.isInteger(owner) && owner > 0 && lockOwnerAlive(owner)) {
      throw new ProtocolError('locked', `başka bir süreç (pid ${owner}) bu işi yazıyor`, label);
    }
    rmSync(lock, { force: true });
  }
  throw new ProtocolError('locked', 'kilit alınamadı', label);
}

export function withLock<T>(dir: string, label: string, fn: () => T): T {
  const lock = join(dir, '.lock');
  mkdirSync(dir, { recursive: true });
  acquireLock(lock, label);
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}
