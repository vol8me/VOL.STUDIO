import { posix } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';

/**
 * Piksel temellerinin platform kümeleri tutarlı olmalıdır (F11.8).
 *
 * Playwright temeli `<ad>-<proje>-<platform>.png` olarak saklar. Bir platformun kümesi diğerinden
 * eksikse o platformda piksel kapısı ya hiç temel bulamaz ya da eski bir tasarıma karşı koşar;
 * ikisi de "kanıt var" izlenimi verir. Kural: bir klasörde bulunan her platformun adı kümesi
 * birleşime eşittir. Bir platformu yenileyemeyen makine kümesini eksik bırakmaz, siler ve
 * platform sınırını belgeler.
 */

const NAME = /^(.+)-(chromium|webkit|firefox)-([a-z0-9]+)\.png$/;

/**
 * @param {string[]} files depo köküne göreli PNG yolları
 * @returns {string[]} sorun listesi
 */
export function validateSnapshotPlatforms(files) {
  /** @type {Map<string, Map<string, Set<string>>>} klasör → platform → ad kümesi */
  const directories = new Map();
  for (const file of files) {
    const directory = posix.dirname(file);
    if (!directory.endsWith('-snapshots')) continue;
    const match = posix.basename(file).match(NAME);
    if (!match) continue;
    const [, name, project, platform] = match;
    const platforms = directories.get(directory) ?? new Map();
    const names = platforms.get(platform) ?? new Set();
    names.add(`${name}-${project}`);
    platforms.set(platform, names);
    directories.set(directory, platforms);
  }

  const problems = [];
  for (const [directory, platforms] of [...directories].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (platforms.size < 2) continue;
    const union = new Set([...platforms.values()].flatMap((names) => [...names]));
    for (const [platform, names] of [...platforms].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const missing = [...union].filter((name) => !names.has(name)).sort();
      if (missing.length === 0) continue;
      problems.push(
        `${directory}: "${platform}" temel kümesi eksik (${names.size}/${union.size}; ` +
          `örn. ${missing.slice(0, 3).join(', ')}). Platformu o makinede tam yenileyin ya da ` +
          'kümesini silip platform sınırını belgeleyin.',
      );
    }
  }
  return problems;
}

/** Çalışma ağacındaki izlenen ve izlenmeyen PNG'ler. */
export function validateRepoSnapshotPlatforms(root) {
  return validateSnapshotPlatforms(workingTreeFiles(root, ['*-snapshots/*.png']));
}
