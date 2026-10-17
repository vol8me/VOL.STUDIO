import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** Aktif paketler aynı monorepo sürümünü taşır; frozen kaynağın sürümü değişmez. */
export function readReleaseVersion(root) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (typeof version !== 'string' || !version.trim())
    throw new Error('package.json: monorepo sürümü boş olamaz.');
  return version;
}

function field(text, section, key) {
  const lines = text.split(/\r?\n/);
  let active = false;
  for (const line of lines) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/.exec(line);
    if (header) active = header[1] === section;
    else if (active) {
      const match = /^\s*([\w.]+)\s*=\s*(.*?)\s*(?:#.*)?$/.exec(line);
      if (match && match[1] === key) return match[2];
    }
  }
  return undefined;
}

export function validateReleaseVersions(
  root,
  lifecycle = loadRepoLifecycle(root),
  manifests = workingTreeFiles(root, ['*Cargo.toml']),
) {
  if (!lifecycle) return ['workspace-lifecycle.json: sürüm denetimi için lifecycle gerekli.'];
  const problems = [];
  const version = readReleaseVersion(root);
  const rootCargo = readFileSync(join(root, 'Cargo.toml'), 'utf8');
  const cargoVersion = field(rootCargo, 'workspace.package', 'version');
  if (cargoVersion !== JSON.stringify(version) && cargoVersion !== `'${version}'`)
    problems.push('Cargo.toml: workspace.package.version kök package.json sürümüyle aynı olmalı.');
  for (const workspace of lifecycle.workspaces.filter((item) => item.status === 'active')) {
    const path = `${workspace.path}/package.json`;
    if (JSON.parse(readFileSync(join(root, path), 'utf8')).version !== version)
      problems.push(`${path}: aktif paket monorepo sürümü ${version} ile aynı olmalı.`);
    const configPath = `${workspace.path}/src-tauri/tauri.conf.json`;
    if (!existsSync(join(root, configPath))) continue;
    const config = JSON.parse(readFileSync(join(root, configPath), 'utf8'));
    if (
      typeof config.version !== 'string' ||
      resolve(root, dirname(configPath), config.version) !== resolve(root, 'package.json')
    )
      problems.push(`${configPath}: version kök package.json dosyasını göstermeli.`);
  }
  for (const manifest of excludingFrozenPaths(manifests, lifecycle)) {
    if (manifest === 'Cargo.toml') continue;
    const text = readFileSync(join(root, manifest), 'utf8');
    if (field(text, 'package', 'version.workspace') !== 'true')
      problems.push(`${manifest}: version.workspace = true ile ortak sürüm tüketilmeli.`);
  }
  return problems;
}
