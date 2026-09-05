import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { sourceImports } from './sourceImports.mjs';

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'];

function candidates(path) {
  const extension = extname(path);
  if (extension === '.js') return [path.slice(0, -3) + '.ts', path.slice(0, -3) + '.tsx', path];
  if (extension === '.mjs') return [path.slice(0, -4) + '.mts', path];
  if (extension === '.cjs') return [path.slice(0, -4) + '.cts', path];
  if (extension !== '') return [path];
  return [
    path,
    ...EXTENSIONS.map((ext) => path + ext),
    ...EXTENSIONS.map((ext) => `${path}/index${ext}`),
  ];
}

/**
 * Kaynak import'u ignore edilmiş yerel dosyaya dayanamaz: klonda o dosya yoktur.
 * Yeni, henüz sahnelenmemiş kaynaklar da taranır; git'e eklenebilir olmaları gerekir.
 * Değişken import'ları ve modül dışı dosya okumaları bu kontrolün sınırı dışındadır.
 */
export function validateTrackedImports(root) {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return ['Kaynak girdileri doğrulanamadı: git dosya listesi okunamıyor.'];
  }
  const available = new Set(files.map((file) => resolve(root, file)));
  const problems = [];
  for (const file of files.filter((file) => SOURCE.test(file))) {
    const absolute = resolve(root, file);
    let source;
    try {
      source = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }
    for (const specifier of sourceImports(source, file)) {
      if (!specifier.startsWith('.')) continue;
      const path = resolve(dirname(absolute), specifier.split(/[?#]/)[0]);
      const targets = candidates(path);
      const target = targets.find((candidate) => {
        try {
          return statSync(candidate).isFile();
        } catch {
          return false;
        }
      });
      if (target && available.has(target)) continue;
      problems.push(
        `${file}: "${specifier}" klonda bulunamaz (${
          target ? `git dışında: ${relative(root, target)}` : 'dosya yok'
        }).`,
      );
    }
  }
  return problems;
}
