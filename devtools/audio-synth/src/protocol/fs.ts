import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
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

function isInside(parent: string, child: string): boolean {
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

type WriteFn = (fd: number, buffer: Uint8Array, offset: number, length: number) => number;

/**
 * `writeSync` isteneni tek çağrıda yazmayabilir (sinyal, dolu disk kotası);
 * kalan bayt bitene dek döngü sürer. İlerlemeyen yazım sonsuz döngü yerine
 * hata verir.
 */
export function writeAllSync(
  fd: number,
  data: string | Uint8Array,
  write: WriteFn = writeSync,
): void {
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  let offset = 0;
  while (offset < bytes.length) {
    const written = write(fd, bytes, offset, bytes.length - offset);
    if (written <= 0) throw new Error(`yazım ilerlemedi (${offset}/${bytes.length} bayt)`);
    offset += written;
  }
}

const DIR_FSYNC_UNSUPPORTED = new Set(['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES']);

/**
 * Rename'in kendisi dizin girdisidir; güç kesilirse dizin fsync'lenmemişse
 * yeni ad kaybolabilir. Windows dizin açmayı desteklemez, bazı dosya
 * sistemleri dizin fsync'ini reddeder: bu durumlar atlanır.
 */
export function fsyncDir(dir: string): void {
  if (process.platform === 'win32') return;
  let fd: number;
  try {
    fd = openSync(dir, 'r');
  } catch (error) {
    if (DIR_FSYNC_UNSUPPORTED.has((error as NodeJS.ErrnoException).code ?? '')) return;
    throw error;
  }
  try {
    fsyncSync(fd);
  } catch (error) {
    if (!DIR_FSYNC_UNSUPPORTED.has((error as NodeJS.ErrnoException).code ?? '')) throw error;
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomik yazım: aynı dizinde benzersiz geçici dosya (`wx`), fsync, rename,
 * dizin fsync'i.
 * Yarıda kalan yazım hedefi ASLA yarım bırakmaz — ya eski içerik ya yenisi
 * görünür; geride kalan geçici dosya `.tmp-` önekiyle tanınır.
 */
export function writeFileAtomic(target: string, data: string | Uint8Array): void {
  mkdirSync(dirname(target), { recursive: true });
  const temp = join(dirname(target), `.tmp-${process.pid}-${++tempCounter}-${Date.now()}`);
  const fd = openSync(temp, 'wx');
  try {
    writeAllSync(fd, data);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temp, { force: true });
    throw error;
  }
  closeSync(fd);
  try {
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  fsyncDir(dirname(target));
}

/** Hazırlık dosyasını fsync'leyerek yazar; yerine koyma çağıranın işidir. */
export function writeStaged(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const fd = openSync(path, 'wx');
  try {
    writeAllSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export interface StagedFile {
  readonly staged: string;
  readonly target: string;
}

/**
 * Hazırlanmış dosyaları sırayla yerine koyar. Biri düşerse önceden
 * yerleşenler eski hâllerine döner (eskisi yoksa silinir); böylece asset ile
 * manifest birbirinden ayrışmış hâlde kalmaz. Eski hâller yerleştirmeden önce
 * sabit bağla ayrılır ve iş bitince silinir.
 */
export function commitFiles(files: readonly StagedFile[]): void {
  const previous: (string | null)[] = [];
  const placed: number[] = [];
  try {
    for (const { target } of files) {
      if (!existsSync(target)) {
        previous.push(null);
        continue;
      }
      const keep = join(dirname(target), `.tmp-prev-${process.pid}-${randomUUID()}`);
      linkSync(target, keep);
      previous.push(keep);
    }
    files.forEach(({ staged, target }, index) => {
      mkdirSync(dirname(target), { recursive: true });
      renameSync(staged, target);
      placed.push(index);
    });
    for (const dir of new Set(files.map(({ target }) => dirname(target)))) fsyncDir(dir);
  } catch (error) {
    for (const index of placed.reverse()) {
      const keep = previous[index];
      if (keep) renameSync(keep, files[index].target);
      else rmSync(files[index].target, { force: true });
    }
    throw error;
  } finally {
    for (const keep of previous) if (keep) rmSync(keep, { force: true });
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

/** İçeriği okunamayan kilit bu yaştan sonra bayat sayılır (yazım anında ölen süreç). */
export const LOCK_UNREADABLE_STALE_MS = 60_000;

function lockOwnerAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Kilidin sahibi; dosya yoksa `null`, içerik geçersizse `NaN`. */
function readOwner(lock: string): number | null {
  try {
    const text = readFileSync(lock, 'utf8').trim();
    return /^\d+$/.test(text) ? Number(text) : Number.NaN;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function isStale(lock: string, owner: number): boolean {
  if (Number.isInteger(owner) && owner > 0) return !lockOwnerAlive(owner);
  try {
    return Date.now() - statSync(lock).mtimeMs > LOCK_UNREADABLE_STALE_MS;
  } catch {
    return false;
  }
}

/**
 * Tek yazıcı kilidi. Kilit dosyası sahibinin pid'iyle önce geçici adda yazılır
 * ve `link` ile atomik yaratılır; hiçbir okuyucu pid'siz kilit görmez. Bayat
 * kilit tekil bir ada taşınıp içeriği doğrulanarak silinir, böylece iki
 * temizleyici birbirinin yeni kilidini silemez. Yaşayan ya da okunamayan
 * (yeni) kilit ikinci yazıcıyı `locked` ile durdurur.
 */
function acquireLock(lock: string, label: string): void {
  const dir = dirname(lock);
  const staged = join(dir, `.tmp-lock-${process.pid}-${randomUUID()}`);
  writeFileSync(staged, String(process.pid), { flag: 'wx' });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        linkSync(staged, lock);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      const owner = readOwner(lock);
      if (owner === null) continue;
      if (!isStale(lock, owner)) {
        throw new ProtocolError(
          'locked',
          Number.isNaN(owner)
            ? 'kilit yazılıyor ya da okunamıyor'
            : `başka bir süreç (pid ${owner}) bu işi yazıyor`,
          label,
        );
      }
      const moved = join(dir, `.tmp-stale-lock-${process.pid}-${randomUUID()}`);
      try {
        renameSync(lock, moved);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const taken = readOwner(moved);
      if (taken === owner || (Number.isNaN(taken) && Number.isNaN(owner))) {
        rmSync(moved, { force: true });
        continue;
      }
      // Taşınan dosya arada alınmış taze bir kilit: yerine bağlanır, sıra onundur.
      try {
        linkSync(moved, lock);
      } finally {
        rmSync(moved, { force: true });
      }
      throw new ProtocolError('locked', `başka bir süreç (pid ${taken}) bu işi yazıyor`, label);
    }
    throw new ProtocolError('locked', 'kilit alınamadı', label);
  } finally {
    rmSync(staged, { force: true });
  }
}

function withLockFile<T>(lock: string, label: string, fn: () => T): T {
  mkdirSync(dirname(lock), { recursive: true });
  acquireLock(lock, label);
  try {
    return fn();
  } finally {
    // Yalnız kendi kilidini bırakır.
    if (readOwner(lock) === process.pid) rmSync(lock, { force: true });
  }
}

export function withLock<T>(dir: string, label: string, fn: () => T): T {
  return withLockFile(join(dir, '.lock'), label, fn);
}

/**
 * Aynı dizinde adlandırılmış kilitleri BELİRLİ SIRAYLA (ada göre artan) alır
 * ve ters sırada bırakır. Birden çok süreç aynı küme için ters sırada
 * beklemez: kilit alma bekleme yapmadığından (`locked` ile hemen düşer)
 * kilitlenme olmaz; sıra ise kısmen alınmış kümeyi öngörülebilir kılar.
 * Yinelenen ad bir kez alınır.
 */
export function withLocks<T>(dir: string, names: readonly string[], label: string, fn: () => T): T {
  const ordered = [...new Set(names)].sort();
  const hold = (index: number): T =>
    index === ordered.length
      ? fn()
      : withLockFile(join(dir, ordered[index]), label, () => hold(index + 1));
  return hold(0);
}
