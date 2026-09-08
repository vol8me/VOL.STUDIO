import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * GELİŞTİRME PORTLARININ TEKİLLİĞİ.
 *
 * Portlar paket paket, elle tutulur: `vite.config.ts` içinde dev/preview/HMR,
 * `playwright.config.ts` içinde e2e. Çakışma derleme zamanında görünmez —
 * ancak iki sunucu AYNI ANDA ayaktayken ortaya çıkar ve o an genellikle
 * `pnpm high` koşarken olur. Kapı düşer, sebebi kodun hiçbir yerinde yazmaz.
 *
 * Ölçüldü: 5181 hem `devtools/vol-ui` e2e varsayılanıydı hem de bir oyunun
 * önizleme portu olarak seçilebiliyordu.
 *
 * Bekçi PORT NUMARASINI kaynaktan okur; çalışan bir sunucuya ihtiyaç duymaz.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'target', 'gen']);

/** `port: 1234` ve `?? 1234` biçimlerinin ikisi de bir port BİLDİRİMİDİR. */
const DECLARATIONS = [
  { re: /\bport:\s*(\d{4,5})\b/g, kind: 'vite' },
  { re: /_E2E_PORT\s*\?\?\s*(\d{4,5})\b/g, kind: 'e2e' },
];

function packageDirs(root) {
  const dirs = ['tauri-v2'];
  for (const group of ['games', 'devtools']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) dirs.push(`${group}/${entry.name}`);
    }
  }
  return dirs.filter((dir) => existsSync(join(root, dir, 'package.json')));
}

/**
 * @param root Repo kökü.
 * @returns Sorun listesi; boşsa her port tek bir sahibe aittir.
 */
export function validateDevPorts(root) {
  const owners = new Map();

  for (const dir of packageDirs(root)) {
    for (const file of ['vite.config.ts', 'playwright.config.ts']) {
      const path = join(root, dir, file);
      if (!existsSync(path)) continue;
      const source = readFileSync(path, 'utf8');
      for (const { re, kind } of DECLARATIONS) {
        re.lastIndex = 0;
        for (const match of source.matchAll(re)) {
          const port = Number(match[1]);
          // HMR portları ayrı bir aralıktadır (1421+) ve aynı listede yarışır.
          const claim = { pkg: dir, file: `${dir}/${file}`, kind };
          const existing = owners.get(port);
          if (existing) existing.push(claim);
          else owners.set(port, [claim]);
        }
      }
    }
  }

  /*
   * Çakışma FARKLI paketler arasındadır. Bir paketin kendi içinde aynı portu
   * iki kez bildirmesi meşrudur ve yaygındır: `playwright.config.ts` o paketin
   * `vite preview` sunucusunu başlatır, yani ikisi AYNI sunucudur.
   */
  return [...owners.entries()]
    .filter(([, claims]) => new Set(claims.map((c) => c.pkg)).size > 1)
    .map(
      ([port, claims]) =>
        `Port ${port} iki AYRI pakette bildirilmiş: ` +
        `${claims.map((c) => `${c.file} (${c.kind})`).join(', ')}. ` +
        'İki sunucu aynı anda ayakta olamaz; biri taşınmalı.',
    );
}
