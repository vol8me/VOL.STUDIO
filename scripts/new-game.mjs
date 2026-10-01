import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gameIcon, gameIco } from './new-game-icon.mjs';
import { loadQualityConfig } from './quality/config.mjs';

const template = fileURLToPath(new URL('../tauri-v2/templates/game/', import.meta.url));
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const serialize = (value) => JSON.stringify(value, null, 2) + '\n';

function validate(root, options, lifecycle) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(options.name) || options.name.length > 48)
    throw new Error('Oyun adı küçük harfli kebab-case olmalı (en çok 48 karakter).');
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){2,}$/.test(options.id))
    throw new Error(
      'Uygulama kimliği ters alan adı olmalı; yalnız küçük harf ve rakam kullanılır.',
    );
  const title = options.title ?? options.name.toUpperCase();
  if (!/^[\p{L}\p{N} ._-]{1,60}$/u.test(title))
    throw new Error('Ürün başlığı yalnız harf, sayı, boşluk, nokta, alt çizgi ve tire içerebilir.');
  const ports = [options.port, options.hmrPort, options.e2ePort];
  if (
    ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
    new Set(ports).size !== 3
  )
    throw new Error('Portlar 1024–65535 arasında üç farklı tam sayı olmalı.');
  const path = `games/${options.name}`;
  const packageName = `@volstudio/${options.name}`;
  if (
    existsSync(join(root, path)) ||
    lifecycle.workspaces.some((entry) => entry.path === path || entry.packageName === packageName)
  )
    throw new Error('Oyun yolu veya paket adı mevcut.');
  for (const entry of lifecycle.workspaces) {
    const directory = join(root, entry.path);
    const conf = join(directory, 'src-tauri/tauri.conf.json');
    if (existsSync(conf) && json(conf).identifier === options.id)
      throw new Error('Uygulama kimliği başka üründe mevcut.');
    for (const name of ['vite.config.ts', 'playwright.config.ts']) {
      const file = join(directory, name);
      if (!existsSync(file)) continue;
      const declared = [
        ...readFileSync(file, 'utf8').matchAll(/\bport:\s*(\d+)\b|_E2E_PORT\s*\?\?\s*(\d+)\b/g),
      ].map((match) => Number(match[1] ?? match[2]));
      for (const port of ports)
        if (declared.includes(port))
          throw new Error(`Port ${port} ${entry.path} tarafından kullanılıyor.`);
    }
  }
  return { path, packageName, title };
}

function renderTree(destination, values, source = template) {
  for (const entry of readdirSync(source, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const target = join(destination, entry.name.replace(/\.template$/, ''));
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true });
      renderTree(target, values, join(source, entry.name));
    } else {
      const content = readFileSync(join(source, entry.name), 'utf8').replace(
        /{{([A-Z0-9_]+)}}/g,
        (_match, key) => {
          if (!(key in values)) throw new Error(`Bilinmeyen şablon alanı: ${key}`);
          return String(values[key]);
        },
      );
      writeFileSync(target, content);
    }
  }
}

/** Önce tüm girdiler doğrulanır; başarısız üretimde kayıtlar ve yeni ağaç geri alınır. */
export function createGame(root, options) {
  const lifecycleFile = join(root, 'workspace-lifecycle.json');
  const qualityFile = join(root, 'quality.json');
  const lifecycleOriginal = readFileSync(lifecycleFile, 'utf8');
  const qualityOriginal = readFileSync(qualityFile, 'utf8');
  const lifecycle = JSON.parse(lifecycleOriginal);
  const quality = loadQualityConfig(qualityFile);
  const bundles = (quality.bundles ??= {});
  const scaling = (quality.scaling ??= {});
  const result = validate(root, options, lifecycle);
  const destination = join(root, result.path);
  if (quality.packages[result.packageName] || bundles[result.path] || scaling[result.path])
    throw new Error('Kalite kaydı mevcut.');
  const values = {
    NAME: options.name,
    ID: options.id,
    TITLE: result.title,
    PORT: options.port,
    HMR_PORT: options.hmrPort,
    E2E_PORT: options.e2ePort,
    ENV_NAME: options.name.replace(/-/g, '_').toUpperCase(),
    NAMESPACE: options.name.replace(/-/g, ''),
    LIB_NAME: options.name.replace(/-/g, '_') + '_lib',
  };
  try {
    mkdirSync(destination, { recursive: true });
    renderTree(destination, values);
    const icons = join(destination, 'src-tauri/icons');
    mkdirSync(icons, { recursive: true });
    for (const [name, size] of Object.entries({
      '32x32.png': 32,
      '128x128.png': 128,
      '128x128@2x.png': 256,
      'icon.png': 512,
    }))
      writeFileSync(join(icons, name), gameIcon(options.id, size));
    writeFileSync(join(icons, 'icon.ico'), gameIco(gameIcon(options.id, 256)));
    chmodSync(join(destination, 'src-tauri/linux.AppRun'), 0o755);
    lifecycle.workspaces.push({
      packageName: result.packageName,
      path: result.path,
      status: 'active',
    });
    quality.packages[result.packageName] = { ...quality.floor };
    bundles[result.path] = { app: 150, vendor: 360, css: 24 };
    scaling[result.path] = {
      $measure: { script: 'scripts/scaling.ts', series: 'spatial', input: 'count', value: 'ms' },
      spatial512Over128: 6,
    };
    writeFileSync(lifecycleFile, serialize(lifecycle));
    writeFileSync(qualityFile, serialize(quality));
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    writeFileSync(lifecycleFile, lifecycleOriginal);
    writeFileSync(qualityFile, qualityOriginal);
    throw error;
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        name: { type: 'string' },
        id: { type: 'string' },
        title: { type: 'string' },
        port: { type: 'string' },
        'hmr-port': { type: 'string' },
        'e2e-port': { type: 'string' },
      },
    });
    const result = createGame(resolve(dirname(fileURLToPath(import.meta.url)), '..'), {
      name: values.name ?? '',
      id: values.id ?? '',
      title: values.title,
      port: Number(values.port),
      hmrPort: Number(values['hmr-port']),
      e2ePort: Number(values['e2e-port']),
    });
    console.log(
      `${result.path} oluşturuldu ve active kaydedildi.\npnpm install\npnpm --filter ${result.packageName} build\ncargo check --manifest-path ${result.path}/src-tauri/Cargo.toml --offline\npnpm signoff`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
