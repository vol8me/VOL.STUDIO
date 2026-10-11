#!/usr/bin/env node
/**
 * Vitrin E2E: yapılandırmadaki her motor kendi süreçte, kendi preview
 * sunucusunda ve kendi portunda koşar.
 *
 * Tam koşu iki şeritten oluşur (`playwright.config.ts` → `QUIET_SPECS`):
 *  1. ANA şerit: zamanı sınırlamayan her sınama, motorlar EŞZAMANLI. Motorlar birbirinin durumunu paylaşmaz (ayrı
 *     tarayıcı, ayrı sunucu, ayrı port), bu yüzden eşzamanlı koşu aynı kapsamı daha kısa sürede verir.
 *  2. SESSİZ şerit: zamanı ÖLÇEN ve süre sınırı koyan sınamalar, motor motor ve tek işçiyle. Yük altında ölçümleri
 *     yük taşır; tek başına koşan motor bunları gerçek değerlerinde ölçer.
 * Hiçbir motor ve hiçbir sınama dışlanmaz: motor listesi `playwright.config.ts` projelerinden gelir, iki şerit
 * birlikte bütün sınamaları kapsar.
 *
 * Ek argüman (dosya adı, `--grep`, `--update-snapshots`) verilirse seçili koşu tek şeritte, motorlar eşzamanlı koşar
 * ve argümanlar her sürece aynen geçer: şeritler yalnız tam koşuyu böler.
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
const children = new Set();

/** Bir motoru kendi sürecinde koşar; çıkış kodunu döndürür. `lane` verilmezse tek şerittir. */
function runEngine(name, lane, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, 'test', `--project=${name}`, ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        VOL_UI_E2E_PORT: String(ports[name]),
        ...(lane ? { VOL_UI_E2E_LANE: lane } : {}),
      },
    });
    children.add(child);
    child.on('error', () => {
      children.delete(child);
      resolve(1);
    });
    child.on('close', (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) child.kill();
    process.exit(130);
  });
}

const verdict = (code) => (code === 0 ? 'geçti' : `düştü (${code})`);

if (extra.length > 0) {
  const codes = await Promise.all(projects.map((name) => runEngine(name, undefined, extra)));
  console.log(
    `[e2e] ${projects.map((name, index) => `${name}: ${verdict(codes[index])}`).join(' · ')}`,
  );
  process.exit(codes.find((code) => code !== 0) ?? 0);
}

const main = await Promise.all(projects.map((name) => runEngine(name, 'main', [])));
// Sessiz şerit ana şeridin düşmesine bakmaz: tam kanıt tek koşuda gelir.
const quiet = [];
for (const name of projects) quiet.push(await runEngine(name, 'quiet', ['--workers=1']));

console.log(
  `[e2e] ${projects
    .map((name, index) => `${name}: ana ${verdict(main[index])}, sessiz ${verdict(quiet[index])}`)
    .join(' · ')}`,
);
process.exit([...main, ...quiet].find((code) => code !== 0) ?? 0);
