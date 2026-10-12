/**
 * Kapı makbuzları: bir aşama, girdileri BAYT BAYT aynıysa yeniden koşmaz.
 *
 * Anahtar git durumundan değil çalışma ağacının gerçek içeriğinden türer;
 * commit, stage ya da dal fark etmez. Aynı içerik daha önce geçtiyse sonuç
 * aynıdır, çünkü önbelleğe giren aşamalar deterministiktir (zamana, ağa ya da
 * ölçülen süreye bağlı aşamalar `gatePlan.mjs`de önbelleksizdir).
 *
 * Makbuz YALNIZ atlama içindir: sahte geçiş üretemez. Anahtar uyuşmazsa,
 * makbuz yoksa ya da okunamıyorsa aşama koşar.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from './command.mjs';

const GIT_BUFFER = 256 * 1024 * 1024;

function git(root, args, input) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(input === undefined ? {} : { input }),
  });
}

const nulSeparated = (text) => text.split('\0').filter(Boolean);

/** `git hash-object` ham baytı karma eder (satır sonu/filtre dönüşümü yok). */
function hashWorkingFiles(root, paths) {
  if (paths.length === 0) return [];
  if (paths.some((path) => path.includes('\n'))) {
    throw new Error('Kapı makbuzu: satır sonu içeren dosya adı desteklenmez.');
  }
  const out = git(root, ['hash-object', '--no-filters', '--stdin-paths'], `${paths.join('\n')}\n`);
  return out.split('\n').filter(Boolean);
}

/**
 * Çalışma ağacındaki her izlenen ya da izlenmeyen-ama-yok-sayılmayan dosya →
 * içerik karması. Git'in temiz/normalizasyon/denetim dışı kararına güvenilmez:
 * indeks LF taşırken diskte CRLF bulunabilir. Her mevcut girdi ham baytla
 * karmalanır; indeks yalnız dosya envanteridir.
 *
 * @returns {Map<string, string>} yol (`/` ayraçlı) → karma
 */
export function snapshotFiles(root) {
  const staged = new Set();
  for (const entry of nulSeparated(git(root, ['ls-files', '-s', '-z']))) {
    const tab = entry.indexOf('\t');
    const [mode] = entry.slice(0, tab).split(' ');
    if (mode === '160000') continue;
    staged.add(entry.slice(tab + 1));
  }
  const untracked = nulSeparated(git(root, ['ls-files', '--others', '--exclude-standard', '-z']));

  // Makbuzların kendisi `node_modules/.cache` altındadır; yok sayılmaları .gitignore'a
  // bırakılmaz, yoksa makbuz yazmak kendi anahtarını değiştirirdi.
  const counted = (path) => !path.startsWith('node_modules/');
  const files = new Map();
  const pending = [...new Set([...staged, ...untracked])].filter(
    (path) => counted(path) && existsSync(join(root, path)),
  );

  const hashes = hashWorkingFiles(root, pending);
  // Önek yok: ham karma, süzgeçsiz dosyada git'in blob karmasıyla aynıdır; aynı içerik
  // stage'lenince ya da geri dönünce aynı karmayı vermelidir.
  pending.forEach((path, index) => files.set(path, hashes[index]));
  return files;
}

/** Commit kancası yalnız kapının gördüğü ağacın tamamı sahnedeyse geçer. */
export function assertIndexMatchesWorkingTree(root) {
  const index = new Map();
  for (const entry of nulSeparated(git(root, ['ls-files', '-s', '-z']))) {
    const tab = entry.indexOf('\t');
    const [mode, sha, stage] = entry.slice(0, tab).split(' ');
    if (stage !== '0') throw new Error('Commit indeksi çözülmemiş çakışma içeriyor.');
    if (mode !== '160000') index.set(entry.slice(tab + 1), sha);
  }
  const files = snapshotFiles(root);
  const different = [...new Set([...index.keys(), ...files.keys()])].filter(
    (path) => index.get(path) !== files.get(path),
  );
  if (different.length > 0) {
    throw new Error(
      `Commit indeksi çalışma ağacıyla aynı değil: ${different.join(', ')}. ` +
        'Kapı çalışma ağacını sınar; bu dosyaları sahnele veya sahne dışı değişiklikleri ayrı çalışma alanında tut.',
    );
  }
}

/**
 * Seçilen dosyaların ve ek parçaların (ortam, sürüm) tek karması.
 * @param {Map<string, string>} files
 * @param {(path: string) => boolean} include
 * @param {string[]} parts
 */
export function fingerprint(files, include, parts = []) {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(`${part}\0`);
  const paths = [...files.keys()].filter(include).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const path of paths) hash.update(`${path}\0${files.get(path)}\n`);
  return hash.digest('hex');
}

/** Sonucu etkileyen çalışma ortamı: Node sürümü ve platform. */
export function environmentParts() {
  return [`node=${process.version}`, `platform=${process.platform}-${process.arch}`];
}

export function receiptDirectory(root) {
  return join(root, 'node_modules', '.cache', 'vol-quality', 'gates');
}

function receiptFile(root, stage, unit) {
  const suffix = unit ? `__${unit.replace(/[^\w.-]/g, '_')}` : '';
  return join(receiptDirectory(root), `${stage}${suffix}.json`);
}

/** Aşama başına tutulan geçmiş anahtar sayısı: dal değiştirme ve dene-geri al akışları. */
const HISTORY = 5;

/**
 * Bu aşama/birim için kayıtlı geçişler, en yenisi önce. Eski biçim (tek `key`) da okunur.
 * @returns {{ key: string, passedAt: string, durationMs: number }[]}
 */
export function listReceipts(root, stage, unit) {
  try {
    const record = JSON.parse(readFileSync(receiptFile(root, stage, unit), 'utf8'));
    const entries = Array.isArray(record?.entries)
      ? record.entries
      : typeof record?.key === 'string'
        ? [record]
        : [];
    return entries.filter((entry) => typeof entry?.key === 'string');
  } catch {
    return [];
  }
}

/** Bu anahtarla geçmiş bir koşu varsa kaydı, yoksa `null`. */
export function readReceipt(root, stage, unit, key) {
  return listReceipts(root, stage, unit).find((entry) => entry.key === key) ?? null;
}

function saveReceipts(root, stage, unit, entries) {
  const file = receiptFile(root, stage, unit);
  mkdirSync(receiptDirectory(root), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(
    temp,
    `${JSON.stringify({ entries }, null, 2)}
`,
  );
  renameSync(temp, file);
}

export function writeReceipt(root, stage, unit, record) {
  const rest = listReceipts(root, stage, unit).filter((entry) => entry.key !== record.key);
  saveReceipts(root, stage, unit, [record, ...rest].slice(0, HISTORY));
}

/**
 * Aynı girdiyle şimdi düşen aşama o girdi için atlanamaz: yalnız bu anahtarın kaydı
 * silinir, başka girdilerin geçmişi kalır.
 */
export function clearReceipt(root, stage, unit, key) {
  const rest = listReceipts(root, stage, unit).filter((entry) => entry.key !== key);
  if (rest.length === 0) rmSync(receiptFile(root, stage, unit), { force: true });
  else saveReceipts(root, stage, unit, rest);
}
