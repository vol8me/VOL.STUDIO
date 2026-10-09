#!/usr/bin/env node
/**
 * Vitrin E2E: yapılandırmadaki her motor kendi süreçte, kendi preview
 * sunucusunda ve kendi portunda EŞZAMANLI koşar.
 *
 * Tek süreçte motorlar art arda koşar ve toplam süre ikisinin toplamıdır. Motorlar
 * birbirinin durumunu paylaşmaz (ayrı tarayıcı, ayrı sunucu, ayrı port), bu yüzden
 * eşzamanlı koşu aynı kapsamı daha kısa sürede verir. Hiçbir motor dışlanmaz:
 * motor listesi `playwright.config.ts` projelerinden gelir.
 *
 * Ek argümanlar her sürece aynen geçer (`--grep`, `--update-snapshots`, dosya adı).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { tsImport } from 'tsx/esm/api';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

const configUrl = new URL('../playwright.config.ts', import.meta.url);
const config = await tsImport(configUrl.href, import.meta.url);
const projects = (config.default.projects ?? []).map((project) => project.name);
const ports = config.ENGINE_PORTS ?? {};

const unported = projects.filter((name) => typeof ports[name] !== 'number');
if (projects.length === 0 || unported.length > 0) {
  console.error(`[e2e] Port bildirimi olmayan proje: ${unported.join(', ') || '(proje yok)'}`);
  process.exit(2);
}
if (new Set(projects.map((name) => ports[name])).size !== projects.length) {
  console.error('[e2e] İki motor aynı portu bildiriyor (playwright.config.ts → ENGINE_PORTS).');
  process.exit(2);
}

const extra = process.argv.slice(2);
const children = [];
const exits = projects.map(
  (name) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [playwrightCli, 'test', `--project=${name}`, ...extra],
        {
          stdio: 'inherit',
          env: { ...process.env, VOL_UI_E2E_PORT: String(ports[name]) },
        },
      );
      children.push(child);
      child.on('error', () => resolve(1));
      child.on('close', (code) => resolve(code ?? 1));
    }),
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill();
    process.exit(130);
  });
}

const codes = await Promise.all(exits);
console.log(
  `[e2e] ${projects.map((name, index) => `${name}: ${codes[index] === 0 ? 'geçti' : `düştü (${codes[index]})`}`).join(' · ')}`,
);
process.exit(codes.find((code) => code !== 0) ?? 0);
