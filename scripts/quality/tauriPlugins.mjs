import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** JS'e izin açmadan yalnız Rust tarafında iş gören eklentiler ve nedenleri. */
export const RUST_ONLY_PLUGINS = {
  log: 'Kabuğun Rust log çıktısıdır; ön yüz ona komut göndermez.',
};

const snake = (name) => name.replace(/-/g, '_');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** `[dependencies]` ve hedefe özgü bağımlılık tablolarındaki `tauri-plugin-*` adları. */
export function cargoPluginDeps(manifestText) {
  const names = new Set();
  let inDeps = false;
  for (const line of manifestText.split('\n')) {
    const header = /^\s*\[(.+)\]\s*$/.exec(line);
    if (header) {
      const table = header[1].trim();
      inDeps = /(^|\.)(dependencies)$/.test(table);
      const inline = /(?:^|\.)dependencies\.(tauri-plugin-[a-z0-9-]+)$/.exec(table);
      if (inline) names.add(inline[1].slice('tauri-plugin-'.length));
      continue;
    }
    if (!inDeps) continue;
    const dep = /^\s*(tauri-plugin-[a-z0-9-]+)\s*=/.exec(line);
    if (dep) names.add(dep[1].slice('tauri-plugin-'.length));
  }
  return [...names].sort();
}

/** Rust kaynağında kurulan eklentiler: `tauri_plugin_<ad>::…` başvuruları. */
export function registeredPlugins(sources) {
  const names = new Set();
  for (const text of sources) {
    for (const match of text.matchAll(/\btauri_plugin_([a-z0-9_]+)::/g)) names.add(match[1]);
  }
  return names;
}

/** Yetenek dosyalarındaki eklenti izin önekleri (`core` dışı). */
export function capabilityPrefixes(capabilities) {
  const prefixes = new Set();
  for (const capability of capabilities) {
    for (const permission of capability.permissions ?? []) {
      const id = typeof permission === 'string' ? permission : permission?.identifier;
      if (typeof id !== 'string') continue;
      const prefix = id.split(':')[0];
      if (prefix !== 'core') prefixes.add(prefix);
    }
  }
  return prefixes;
}

function rustSources(crateDir) {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.rs')) out.push(readFileSync(path, 'utf8'));
    }
  };
  walk(join(crateDir, 'src'));
  return out;
}

function capabilitiesOf(crateDir) {
  const dir = join(crateDir, 'capabilities');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(join(dir, name)));
}

/**
 * JS eklenti bağımlılıkları, Cargo bağımlılıkları, Rust'taki kayıtlar ve
 * uygulama yetenekleri birbirine bağlıdır: kaydı olmayan JS eklentisi çalışma
 * anında düşer, kullanılmayan Cargo eklentisi ve JS'e hiç açılmayan kayıt ölü
 * saldırı yüzeyidir, kurulmamış eklentiye verilen izin sessizce boşa gider.
 */
export function validateTauriPlugins(root, lifecycle = loadRepoLifecycle(root)) {
  const problems = [];
  const manifests = excludingFrozenPaths(
    workingTreeFiles(root, ['**/Cargo.toml', 'Cargo.toml']),
    lifecycle,
  ).filter((path) => !path.includes('/target/'));
  const crates = manifests.map((manifest) => {
    const dir = dirname(manifest);
    const abs = join(root, dir);
    return {
      dir,
      deps: cargoPluginDeps(readFileSync(join(root, manifest), 'utf8')),
      registered: registeredPlugins(rustSources(abs)),
      capabilities: capabilitiesOf(abs),
      app: existsSync(join(abs, 'tauri.conf.json')),
    };
  });

  const registeredAnywhere = new Set(crates.flatMap((crate) => [...crate.registered]));
  const permitted = new Set(
    crates.flatMap((crate) => [...capabilityPrefixes(crate.capabilities)].map(snake)),
  );

  const jsPlugins = new Set();
  for (const manifest of excludingFrozenPaths(
    workingTreeFiles(root, ['**/package.json']),
    lifecycle,
  )) {
    if (manifest.includes('node_modules/')) continue;
    const pkg = readJson(join(root, manifest));
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        const match = /^@tauri-apps\/plugin-([a-z0-9-]+)$/.exec(name);
        if (!match) continue;
        jsPlugins.add(snake(match[1]));
        if (!registeredAnywhere.has(snake(match[1]))) {
          problems.push(
            `${manifest}: "${name}" var ama hiçbir crate tauri_plugin_${snake(
              match[1],
            )} kurmuyor — çağrı çalışma anında düşer.`,
          );
        }
      }
    }
  }

  for (const crate of crates) {
    const permittedHere = new Set([...capabilityPrefixes(crate.capabilities)].map(snake));
    for (const dep of crate.deps) {
      const name = snake(dep);
      if (!crate.registered.has(name) && !permittedHere.has(name)) {
        problems.push(
          `${crate.dir}/Cargo.toml: tauri-plugin-${dep} bağımlılığı kaynakta kurulmuyor ve yetenekte izni yok.`,
        );
      }
    }
    for (const name of crate.registered) {
      if (name in RUST_ONLY_PLUGINS || permitted.has(name) || jsPlugins.has(name)) continue;
      problems.push(
        `${crate.dir}: tauri_plugin_${name} kuruluyor ama hiçbir uygulama ona izin vermiyor ve JS tüketicisi yok.`,
      );
    }
    if (!crate.app) continue;
    for (const prefix of capabilityPrefixes(crate.capabilities)) {
      if (!registeredAnywhere.has(snake(prefix))) {
        problems.push(
          `${crate.dir}/capabilities: "${prefix}:" izni var ama eklenti hiçbir yerde kurulmuyor.`,
        );
      }
    }
  }

  return problems;
}

/**
 * `TauriWindowAdapter`ın pencereye yaptığı her çağrı Tauri'de ayrı bir izne bağlıdır; izin yoksa çağrı çalışma
 * anında "not allowed" ile düşer ve yalnız konsola uyarı yazılır (Windows yerel turunda `center` böyle
 * yakalandı: pencereli kipe dönüşte boyut uygulanır, ortalama sessizce düşerdi). Yeni bir çağrı bu tabloya
 * eklenmeden kapıdan geçmez.
 */
export const WINDOW_PERMISSIONS = {
  setFullscreen: 'core:window:allow-set-fullscreen',
  setSize: 'core:window:allow-set-size',
  center: 'core:window:allow-center',
};

const ADAPTER_PATH = 'tauri-v2/src/window/TauriWindowAdapter.ts';
const DESKTOP_PLATFORMS = new Set(['windows', 'linux', 'macOS']);

/** Bağdaştırıcının `this.window` üstünden çağırdığı komutlar. */
export function adapterWindowCalls(source) {
  return [
    ...new Set([...source.matchAll(/this\.window\??\.([A-Za-z]+)\(/g)].map((m) => m[1])),
  ].sort();
}

/**
 * Pencereyi süren (`DisplayModeController`/`TauriWindowAdapter` kullanan) her uygulamanın masaüstü yeteneği
 * bağdaştırıcının çağırdığı komutların izinlerini taşır.
 */
export function validateWindowPermissions(root, lifecycle = loadRepoLifecycle(root)) {
  if (!existsSync(join(root, ADAPTER_PATH))) return [];
  const problems = [];
  const calls = adapterWindowCalls(readFileSync(join(root, ADAPTER_PATH), 'utf8'));
  for (const call of calls) {
    if (!(call in WINDOW_PERMISSIONS)) {
      problems.push(
        `${ADAPTER_PATH}: this.window.${call}() çağrısının izni scripts/quality/tauriPlugins.mjs WINDOW_PERMISSIONS tablosunda yok.`,
      );
    }
  }
  const configs = excludingFrozenPaths(
    workingTreeFiles(root, ['**/src-tauri/tauri.conf.json']),
    lifecycle,
  );
  for (const config of configs) {
    const crate = dirname(config);
    const appDir = dirname(crate);
    const sources = excludingFrozenPaths(
      workingTreeFiles(root, [`${appDir}/src`]).filter((file) => file.endsWith('.ts')),
      lifecycle,
    );
    const drivesWindow = sources.some((file) =>
      /\b(?:DisplayModeController|TauriWindowAdapter)\b/.test(
        readFileSync(join(root, file), 'utf8'),
      ),
    );
    if (!drivesWindow) continue;
    const granted = new Set();
    for (const capability of capabilitiesOf(join(root, crate))) {
      const platforms = capability.platforms;
      if (
        Array.isArray(platforms) &&
        !platforms.some((platform) => DESKTOP_PLATFORMS.has(platform))
      ) {
        continue;
      }
      for (const permission of capability.permissions ?? []) {
        granted.add(typeof permission === 'string' ? permission : permission?.identifier);
      }
    }
    for (const call of calls) {
      const permission = WINDOW_PERMISSIONS[call];
      if (permission && !granted.has(permission)) {
        problems.push(
          `${crate}/capabilities: uygulama pencereyi sürüyor (this.window.${call}) ama masaüstü yeteneği "${permission}" iznini vermiyor — çağrı çalışma anında düşer.`,
        );
      }
    }
  }
  return problems;
}
