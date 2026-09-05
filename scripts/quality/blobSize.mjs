import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = {
  'devtools/pen.dev/pen/entities.pen':
    'Birlikte düzenlenen rig ailelerinin özgün Pencil kaynak belgesi.',
};

/**
 * Çalışma ağacı VE index ölçülür: kısmi sahnelemede commit edilen baytlar
 * disktekinden farklı olabilir. Git okunamazsa doğrulama başarılı sayılamaz.
 * Sınır tüm dosya biçimlerine uygulanır; muafiyet dosyaya ve gerekçeye bağlıdır.
 */
export function validateBlobSizes(root) {
  const problems = [];
  const sizes = new Map();
  const git = (args, input) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  try {
    const staged = git(['ls-files', '--stage', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const tab = entry.indexOf('\t');
        const [, hash] = entry.slice(0, tab).split(' ');
        return { hash, file: entry.slice(tab + 1) };
      });
    if (staged.length > 0) {
      const measured = git(
        ['cat-file', '--batch-check=%(objectsize)'],
        staged.map(({ hash }) => hash).join('\n') + '\n',
      )
        .trim()
        .split('\n');
      staged.forEach(({ file }, index) => {
        const size = Number(measured[index]);
        if (!Number.isSafeInteger(size) || size < 0) throw new Error('index boyutu okunamadı');
        sizes.set(file, Math.max(sizes.get(file) ?? 0, size));
      });
    }
    const files = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0')
      .filter(Boolean);
    for (const file of files) {
      try {
        sizes.set(file, Math.max(sizes.get(file) ?? 0, lstatSync(join(root, file)).size));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  } catch {
    return ['Dosya boyutları doğrulanamadı: git index veya çalışma ağacı okunamıyor.'];
  }
  for (const [file, size] of sizes) {
    if (size <= MAX_BYTES) continue;
    if (Object.hasOwn(ALLOWED, file) && ALLOWED[file].trim()) continue;
    problems.push(
      `${file}: ${(size / 1048576).toFixed(
        2,
      )} MiB — dosya sınırı 2 MiB (index/çalışma ağacı). Gönderilen biçime dönüştür veya blobSize.mjs içinde gerekçeli muafiyet tanımla.`,
    );
  }
  return problems;
}
