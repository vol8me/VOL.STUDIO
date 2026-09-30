/**
 * ELF glibc üst sınır bekçisi.
 *
 * Deck'in glibc'si 2.41'dir; host (Fedora) 2.43 üretir ve host'ta derlenen
 * AppImage cihazda açılmaz. steamrt4 kabında derlenen
 * paketin hiçbir ELF'i `GLIBC_<cap>` üstü sürüm istemez — bu modül hem saf
 * ayrıştırıcıyı hem dizin tarayıcısını verir; bekçi derlemenin sonunda
 * AppDir üzerinde koşar.
 */

import { execFileSync } from 'node:child_process';
import { openSync, readdirSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `readelf -V` çıktısındaki sürüm adlarından `GLIBC_X.Y` ihtiyaçlarını çıkarır.
 * Hem `Verdef` hem `Verneed` taranır: `GLIBC_` sürüm adlarını tanımlayan tek
 * kütüphane libc'nin kendisidir ve o pakete girmez; görülen her ad istektir.
 */
export function elfGlibcNeeds(readelfV) {
  const needs = new Set();
  for (const match of readelfV.matchAll(/Name:\s+(GLIBC_)(\d+)\.(\d+)\b/g)) {
    needs.add(`${match[2]}.${match[3]}`);
  }
  return needs;
}

/** `x.y` biçimli iki sürümü karşılaştırır. */
export function compareVersions(a, b) {
  const [amaj, amin] = a.split('.').map(Number);
  const [bmaj, bmin] = b.split('.').map(Number);
  return amaj - bmaj || amin - bmin;
}

/** Dosya ELF mi? (ilk 4 bayt `0x7f 'E' 'L' 'F'`). */
export function isElf(path) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(4);
    if (readSync(fd, head, 0, 4, 0) < 4) return false;
    return head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46;
  } finally {
    closeSync(fd);
  }
}

/** Dizin altındaki tüm ELF dosyalarını (sembolik bağlantılar atlanır) listeler. */
export function listElfFiles(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && isElf(path)) found.push(path);
    }
  };
  walk(dir);
  return found;
}

/**
 * @param {string} dir Taranacak dizin (AppDir kökü).
 * @param {string} cap Örn. '2.41'.
 * @param {(path: string) => string} readelf `readelf -V <dosya>` çıktısı veren çağrı.
 * @returns {{files: number, offenders: {path: string, needs: string[]}[]}}
 *   offenders boşsa paket `cap` sınırının içindedir.
 */
export function checkGlibcCap(
  dir,
  cap,
  readelf = (path) =>
    execFileSync('readelf', ['-V', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
) {
  const offenders = [];
  const files = listElfFiles(dir);
  for (const file of files) {
    let text;
    try {
      text = readelf(file);
    } catch {
      continue; // statik ELF'te sürüm bölümü olmayabilir — istek de yoktur.
    }
    const over = [...elfGlibcNeeds(text)].filter((need) => compareVersions(need, cap) > 0);
    if (over.length > 0) {
      offenders.push({ path: file, needs: over.sort(compareVersions) });
    }
  }
  return { files: files.length, offenders };
}
