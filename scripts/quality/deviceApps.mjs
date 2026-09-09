import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CİHAZ ÖLÇÜMÜNÜN KAPSAMI.
 *
 * `scripts/device-benchmark.mjs` ölçtüğü uygulamaları ELLE tutulan bir listede
 * taşır. Android kabuğu olan bir paket o listeye eklenmezse ölçüm onu sessizce
 * atlar: çıktı hatasız görünür, yalnız bir satır eksiktir. Bu gerçekten oldu —
 * VOL.LIFE kabuğu cihaza kurulduktan sonra üç tur boyunca ölçüm dışında kaldı.
 *
 * Gerçek kaynak paketlerin `src-tauri/tauri.conf.json` dosyalarıdır; kimlik
 * orada yaşar. Bekçi listeyi ona karşı doğrular.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'target', 'gen']);

/** Android kabuğu olan paketler: `src-tauri/tauri.conf.json` yazan her oyun. */
function shellIdentifiers(root) {
  const found = new Map();
  const base = join(root, 'games');
  if (!existsSync(base)) return found;
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const config = join(base, entry.name, 'src-tauri', 'tauri.conf.json');
    if (!existsSync(config)) continue;
    const identifier = JSON.parse(readFileSync(config, 'utf8')).identifier;
    if (identifier) found.set(entry.name, identifier);
  }
  return found;
}

/** `{ name: 'x', pkg: 'com.y.z' }` girdilerini betikten okur. */
function declaredApps(source) {
  const block = /const APPS = \[(.*?)\];/s.exec(source);
  if (!block) return null;
  const apps = new Map();
  for (const match of block[1].matchAll(/name:\s*'([^']+)'[^}]*pkg:\s*'([^']+)'/g)) {
    apps.set(match[1], match[2]);
  }
  return apps;
}

/**
 * @param root Repo kökü.
 * @returns Sorun listesi; boşsa ölçüm her Android kabuğunu kapsıyor demektir.
 */
export function validateDeviceApps(root) {
  const script = join(root, 'scripts', 'device-benchmark.mjs');
  if (!existsSync(script)) return [];

  const declared = declaredApps(readFileSync(script, 'utf8'));
  if (!declared) return ['scripts/device-benchmark.mjs içinde `const APPS = [...]` bulunamadı.'];

  const problems = [];
  const shells = shellIdentifiers(root);

  for (const [name, identifier] of shells) {
    const listed = declared.get(name);
    if (listed === undefined) {
      problems.push(
        `games/${name} Android kabuğu var (${identifier}) ama device-benchmark APPS ` +
          'listesinde yok; cihaz ölçümü onu sessizce atlar.',
      );
    } else if (listed !== identifier) {
      problems.push(
        `games/${name} kimliği ${identifier}, device-benchmark ${listed} diyor. ` +
          'Ölçüm kurulu olmayan bir paketi arar ve "KURULU DEĞİL" yazıp geçer.',
      );
    }
  }

  for (const name of declared.keys()) {
    if (!shells.has(name)) {
      problems.push(
        `device-benchmark ${name} ölçüyor ama o pakette src-tauri/tauri.conf.json yok; ` +
          'liste kaldırılmış bir kabuğu taşıyor.',
      );
    }
  }

  return problems;
}
