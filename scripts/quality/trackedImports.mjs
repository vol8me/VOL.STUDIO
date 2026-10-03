import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { sourceImports } from './sourceImports.mjs';
import { posixPath } from './workspaceLifecycle.mjs';

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'];

function candidates(path) {
  const extension = extname(path);
  if (extension === '.js') return [path.slice(0, -3) + '.ts', path.slice(0, -3) + '.tsx', path];
  if (extension === '.mjs') return [path.slice(0, -4) + '.mts', path];
  if (extension === '.cjs') return [path.slice(0, -4) + '.cts', path];
  if (EXTENSIONS.includes(extension)) return [path];
  return [
    path,
    ...EXTENSIONS.map((ext) => path + ext),
    ...EXTENSIONS.map((ext) => `${path}/index${ext}`),
  ];
}

function generatedProbeImport(root, available, file, specifier, path) {
  if (
    file !== 'devtools/deck/web/probe.js' ||
    specifier !== './vendor/frame-summary.js' ||
    posixPath(relative(root, path)) !== 'devtools/deck/web/vendor/frame-summary.js'
  )
    return false;
  const source = resolve(root, 'core/src/time/frameSummary.ts');
  const generator = resolve(root, 'devtools/deck/scripts/probe-metrics.mjs');
  const builder = resolve(root, 'scripts/linux/build-steamrt4.mjs');
  if (![source, generator, builder].every((entry) => available.has(entry))) return false;
  try {
    const generatedBy = readFileSync(generator, 'utf8');
    const builtBy = readFileSync(builder, 'utf8');
    return (
      /readFileSync\s*\(\s*join\s*\(\s*root\s*,\s*['"]core\/src\/time\/frameSummary\.ts['"]\s*\)/.test(
        generatedBy,
      ) &&
      /\bts\.transpileModule\s*\(/.test(generatedBy) &&
      /\bdirectory\s*=\s*join\s*\(\s*webDir\s*,\s*['"]vendor['"]\s*\)/.test(generatedBy) &&
      /writeFileSync\s*\(\s*join\s*\(\s*directory\s*,\s*['"]frame-summary\.js['"]\s*\)\s*,\s*result\.outputText/.test(
        generatedBy,
      ) &&
      sourceImports(builtBy, builder).includes('../../devtools/deck/scripts/probe-metrics.mjs') &&
      /\bsyncProbeMetrics\s*\(\s*ROOT\s*,\s*join\s*\(\s*ROOT\s*,\s*workspace\s*,\s*['"]web['"]\s*\)\s*\)/.test(
        builtBy,
      )
    );
  } catch {
    return false;
  }
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
      if (target && available.has(resolve(target))) continue;
      if (generatedProbeImport(root, available, file, specifier, path)) continue;
      problems.push(
        `${file}: "${specifier}" klonda bulunamaz (${
          target ? `git dışında: ${posixPath(relative(root, target))}` : 'dosya yok'
        }).`,
      );
    }
  }
  return problems;
}
