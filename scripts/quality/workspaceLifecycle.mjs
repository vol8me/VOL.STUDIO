import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path, { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

const RECORD_KEYS = new Set([
  'packageName',
  'path',
  'status',
  'freezeTag',
  'freezeCommit',
  'decisionDate',
  'reason',
]);
const FROZEN_KEYS = ['freezeTag', 'freezeCommit', 'decisionDate', 'reason'];
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function validWorkspacePath(root, pkgPath, pathModule = path) {
  if (typeof pkgPath !== 'string' || pkgPath.length === 0 || pathModule.isAbsolute(pkgPath)) {
    return false;
  }
  const resolvedRoot = pathModule.resolve(root);
  const resolved = pathModule.resolve(resolvedRoot, pkgPath);
  const rel = pathModule.relative(resolvedRoot, resolved);
  if (
    rel === '' ||
    rel === '..' ||
    rel.startsWith(`..${pathModule.sep}`) ||
    rel.startsWith('../') ||
    rel.startsWith('..\\')
  ) {
    return false;
  }
  const normalizedRel = rel.split(/[\\/]/).filter(Boolean).join('/');
  const normalizedPkg = pkgPath.split(/[\\/]/).filter(Boolean).join('/');
  return normalizedRel === normalizedPkg;
}

export function loadWorkspaceLifecycle(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function activeWorkspaceNames(lifecycle) {
  return lifecycle.workspaces
    .filter((workspace) => workspace.status === 'active')
    .map((workspace) => workspace.packageName);
}

export function activeWorkspacePaths(lifecycle) {
  return lifecycle.workspaces
    .filter((workspace) => workspace.status === 'active')
    .map((workspace) => workspace.path);
}

export function frozenWorkspacePaths(lifecycle) {
  return lifecycle.workspaces
    .filter((workspace) => workspace.status === 'frozen')
    .map((workspace) => workspace.path);
}

/**
 * Repo kökündeki `workspace-lifecycle.json`u okur; dosya yoksa `null` döner.
 *
 * Bekçiler lifecycle dosyası olmayan fixture köklerinde de çağrılır: yokluk
 * "frozen yok" demektir. Var ama bozuksa fırlatılır — bozuk lifecycle'ı
 * "frozen yok" diye yutmak taramayı sessizce genişletirdi.
 */
export function loadRepoLifecycle(root) {
  try {
    return loadWorkspaceLifecycle(join(root, 'workspace-lifecycle.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Rutin ürün-kalitesi taramasından frozen ağaçları düşer. Frozen ağaç
 * değiştirilemez; oradaki bir ihlal düzeltilemez, kapıyı kalıcı kilitler.
 * Bütünlük bekçileri (drift, tag/commit, blob, import takibi) bunu KULLANMAZ.
 */
export function excludingFrozenPaths(files, lifecycle) {
  if (!lifecycle) return files;
  const prefixes = frozenWorkspacePaths(lifecycle).map((path) => `${path}/`);
  if (prefixes.length === 0) return files;
  return files.filter((file) => !prefixes.some((prefix) => file.startsWith(prefix)));
}

export function normalizeWorkspacePath(root, packagePath, pathModule = path) {
  const resolvedRoot = pathModule.resolve(root);
  const resolvedPkg = pathModule.resolve(packagePath);
  const rel = pathModule.relative(resolvedRoot, resolvedPkg);
  return rel.split(/[\\/]/).filter(Boolean).join('/');
}

export function listWorkspacePackages(root = process.cwd(), pathModule = path) {
  const raw = execFileSync('pnpm', ['list', '-r', '--depth', '-1', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const resolvedRoot = pathModule.resolve(root);
  return JSON.parse(raw)
    .filter((pkg) => pathModule.resolve(pkg.path) !== resolvedRoot)
    .map((pkg) => {
      let scripts = {};
      try {
        scripts = JSON.parse(readFileSync(join(pkg.path, 'package.json'), 'utf8')).scripts ?? {};
      } catch {
        // scripts optional
      }
      return {
        name: pkg.name,
        path: pkg.path,
        dir: normalizeWorkspacePath(root, pkg.path, pathModule),
        scripts,
      };
    });
}

export function validateWorkspaceLifecycle(root, lifecycle, packages, pathModule = path) {
  const problems = [];
  if (!isObject(lifecycle)) return ['workspace-lifecycle.json: kök nesne olmalı.'];
  if (lifecycle.schemaVersion !== 1) {
    problems.push('workspace-lifecycle.json: schemaVersion tam olarak 1 olmalı.');
  }
  if (!Array.isArray(lifecycle.workspaces)) {
    return [...problems, 'workspace-lifecycle.json: workspaces dizi olmalı.'];
  }

  const byName = new Map();
  const byPath = new Map();
  for (const [index, record] of lifecycle.workspaces.entries()) {
    const where = `workspaces[${index}]`;
    if (!isObject(record)) {
      problems.push(`${where}: nesne olmalı.`);
      continue;
    }
    for (const key of Object.keys(record)) {
      if (!RECORD_KEYS.has(key)) {
        problems.push(`${where}.${key}: bilinmeyen alan.`);
      }
    }
    if (typeof record.packageName !== 'string' || record.packageName.trim() === '') {
      problems.push(`${where}.packageName: boş olmayan metin olmalı.`);
    } else if (byName.has(record.packageName)) {
      problems.push(`${where}.packageName: ${record.packageName} paket adı yinelenmiş.`);
    } else {
      byName.set(record.packageName, record);
    }
    if (typeof record.path !== 'string' || !validWorkspacePath(root, record.path, pathModule)) {
      problems.push(`${where}.path: geçerli bir göreli repo yolu olmalı.`);
    } else if (byPath.has(record.path)) {
      problems.push(`${where}.path: ${record.path} yolu yinelenmiş.`);
    } else {
      byPath.set(record.path, record);
    }
    if (record.status !== 'active' && record.status !== 'frozen') {
      problems.push(`${where}.status: "active" ya da "frozen" olmalı.`);
    }
    if (record.status === 'active') {
      for (const key of FROZEN_KEYS) {
        if (key in record) {
          problems.push(`${where}.${key}: active kayıtta bulunamaz.`);
        }
      }
    }
    if (record.status === 'frozen') {
      for (const key of FROZEN_KEYS) {
        if (typeof record[key] !== 'string' || record[key].trim() === '') {
          problems.push(`${where}.${key}: frozen kayıtta zorunlu metin alanı.`);
        }
      }
      if (
        typeof record.decisionDate === 'string' &&
        !/^\d{4}-\d{2}-\d{2}$/.test(record.decisionDate)
      ) {
        problems.push(`${where}.decisionDate: YYYY-MM-DD biçiminde olmalı.`);
      }
    }
  }

  const packageByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  for (const pkg of packages) {
    const record = byName.get(pkg.name);
    if (!record) {
      problems.push(`${pkg.name}: workspace paketi lifecycle kaydı taşımıyor.`);
    } else if (record.path !== pkg.dir) {
      problems.push(`${pkg.name}: lifecycle yolu ${record.path}, gerçek yol ${pkg.dir}.`);
    }
  }
  for (const record of lifecycle.workspaces) {
    if (
      isObject(record) &&
      typeof record.packageName === 'string' &&
      !packageByName.has(record.packageName)
    ) {
      problems.push(`${record.packageName}: lifecycle kaydı bayat; workspace paketi bulunamadı.`);
    }
  }

  const frozenNames = new Set(
    lifecycle.workspaces
      .filter((record) => isObject(record) && record.status === 'frozen')
      .map((record) => record.packageName),
  );
  for (const record of lifecycle.workspaces) {
    if (!isObject(record) || record.status !== 'active' || !packageByName.has(record.packageName)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(join(root, record.path, 'package.json'), 'utf8'));
    for (const field of DEPENDENCY_FIELDS) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        if (frozenNames.has(dependency)) {
          problems.push(
            `${record.packageName}: ${field} üzerinden frozen ${dependency} paketine bağlı.`,
          );
        }
      }
    }
  }

  for (const record of lifecycle.workspaces) {
    if (!isObject(record) || record.status !== 'frozen') continue;
    if (
      typeof record.freezeTag !== 'string' ||
      typeof record.freezeCommit !== 'string' ||
      typeof record.path !== 'string'
    ) {
      continue;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(record.freezeTag)) {
      problems.push(`${record.packageName}: freezeTag güvenli bir git ref adı değil.`);
      continue;
    }
    if (!/^[0-9a-f]{40,64}$/.test(record.freezeCommit)) {
      problems.push(`${record.packageName}: freezeCommit tam hex commit kimliği olmalı.`);
      continue;
    }
    try {
      const tagObjectType = git(root, ['cat-file', '-t', record.freezeTag]);
      if (tagObjectType !== 'tag') {
        problems.push(`${record.packageName}: freezeTag annotated Git etiketi olmalı.`);
      }
      const commit = git(root, ['rev-parse', '--verify', `${record.freezeCommit}^{commit}`]);
      const tagCommit = git(root, ['rev-parse', '--verify', `${record.freezeTag}^{commit}`]);
      if (commit !== record.freezeCommit) {
        problems.push(
          `${record.packageName}: freezeCommit kısaltılmış ya da farklı commit çözümlüyor.`,
        );
      }
      if (tagCommit !== record.freezeCommit) {
        problems.push(
          `${record.packageName}: ${record.freezeTag} etiketi freezeCommit'e işaret etmiyor.`,
        );
      }
      const drift = git(root, ['diff', '--name-only', record.freezeCommit, '--', record.path]);
      if (drift) {
        problems.push(
          `${record.packageName}: frozen ağaç freeze commit'ten sapmış: ${drift
            .split('\n')
            .join(', ')}`,
        );
      }
      const untracked = git(root, [
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        record.path,
      ]);
      if (untracked) {
        problems.push(
          `${record.packageName}: frozen ağaçta izlenmeyen dosya var: ${untracked
            .split('\n')
            .join(', ')}`,
        );
      }
    } catch (error) {
      problems.push(`${record.packageName}: freeze git kanıtı doğrulanamadı: ${error.message}`);
    }
  }

  return problems;
}
