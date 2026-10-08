#!/usr/bin/env node
/**
 * Windows yerel ürün IPC turu (kapı değil, cihaz kabul kaydı).
 *
 *   node games/vol-test/scripts/native-store-tour.mjs <VOL.TEST.exe>
 *
 * WebView2'yi uzak hata ayıklama portuyla açar, Playwright'ı CDP ile bağlar ve ürün yolunu sürer:
 * ayar değiştir → TerminateProcess → yeniden aç (kalıcı mı?) → ana kaydı boz → yeniden aç (yedekten mi?) →
 * ayar değiştir → pencere kapatma isteği (WM_CLOSE) → süreç temiz çıkar mı, son değer yazıldı mı?
 */
import { execFileSync, spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const exe = process.argv[2];
if (!exe || !existsSync(exe)) {
  console.error('Kullanım: node native-store-tour.mjs <VOL.TEST.exe>');
  process.exit(2);
}
const PORT = 9334;
const IDENTIFIER = 'com.volstudio.voltest';
const dataDir = join(process.env.APPDATA ?? '', IDENTIFIER);
const deviceFile = join(dataDir, 'voltest-device.json');
const profile = mkdtempSync(join(tmpdir(), 'vol-native-tour-'));
const steps = [];
const record = (name, ok, detail = '') => {
  steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function launch() {
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
    stdio: 'ignore',
    windowsHide: false,
  });
  return child;
}

async function connect() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (response.ok) break;
    } catch {
      /* henüz açılmadı */
    }
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 30_000 });
  let page;
  for (let i = 0; i < 60 && !page; i += 1) {
    page = browser
      .contexts()[0]
      ?.pages()
      .find((candidate) => candidate.url().startsWith('http'));
    if (!page) await sleep(500);
  }
  await page.locator('[data-testid="hud"]').waitFor({ timeout: 30_000 });
  return { browser, page };
}

async function openPause(page) {
  await page.keyboard.press('Escape');
  await page.locator('.vt-pause.vol-modal--visible').waitFor({ timeout: 10_000 });
}

async function setVolume(page, value) {
  const range = page.locator('[data-testid="pause-volume"] input');
  await range.fill(String(value));
  await range.dispatchEvent('change');
}

async function readVolume(page) {
  return Number(await page.locator('[data-testid="pause-volume"] input').inputValue());
}

function fileVolume(path) {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const prefs = raw['device.voltest.preferences'] ?? raw['voltest.preferences'] ?? raw;
    const text = typeof prefs === 'string' ? JSON.parse(prefs) : prefs;
    return text?.volume;
  } catch {
    return undefined;
  }
}

function killHard(child) {
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/F', '/T'], { stdio: 'ignore' });
  } catch {
    /* zaten çıktı */
  }
}

async function waitExit(child, ms) {
  const started = Date.now();
  while (child.exitCode === null && Date.now() - started < ms) await sleep(100);
  return child.exitCode;
}

// Gerçek kullanıcı kayıtlarına dokunulmaz: tur öncesi yedeklenir, sonunda geri yüklenir.
const backup = join(profile, 'appdata-backup');
const hadData = existsSync(dataDir);
if (hadData) cpSync(dataDir, backup, { recursive: true });
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
console.log(`Veri dizini: ${dataDir} (önceki içerik ${hadData ? 'yedeklendi' : 'yoktu'})`);

// 0) eski depo (`voltest-store.json`) varsa ilk açılışta kapsamlı depoya göçer; kaynak korunur.
const legacyFile = join(dataDir, 'voltest-store.json');
writeFileSync(
  legacyFile,
  JSON.stringify({ 'voltest.preferences': { volume: 0.7, haptics: false } }),
);
let child = launch();
try {
  let { browser, page } = await connect();
  await openPause(page);
  record(
    'eski depodan göç: ayar kapsamlı depoya taşındı',
    Math.abs((await readVolume(page)) - 0.7) < 1e-6,
    `arayüz: ${await readVolume(page)}`,
  );
  record('eski depodan göç: kaynak dosya korunur', existsSync(legacyFile), legacyFile);
  const haptics = await page.locator('[data-testid="pause-haptics"] input').isChecked();
  record(
    'eski depodan göç: ikinci alan da taşındı (titreşim kapalı)',
    haptics === false,
    `titreşim: ${haptics}`,
  );

  // 1) ayarı değiştir, kalıcılığı gör
  await setVolume(page, 0.3);
  for (let i = 0; i < 40 && fileVolume(deviceFile) !== 0.3; i += 1) await sleep(250);
  record(
    'ayar diske yazıldı (IPC → store → disk)',
    fileVolume(deviceFile) === 0.3,
    `dosya: ${fileVolume(deviceFile)}`,
  );
  await browser.close();

  // 2) sert öldür, yeniden aç
  killHard(child);
  await sleep(1500);
  child = launch();
  ({ browser, page } = await connect());
  await openPause(page);
  const afterKill = await readVolume(page);
  record(
    'TerminateProcess sonrası ayar geri gelir',
    Math.abs(afterKill - 0.3) < 1e-6,
    `arayüz: ${afterKill}`,
  );
  await browser.close();

  // 3) ikinci jenerasyon (0.4) → önceki jenerasyon `.bak` olur; ana kaydı boz → yedekten (0.3) açılır
  killHard(child);
  await sleep(1500);
  child = launch();
  ({ browser, page } = await connect());
  await openPause(page);
  await setVolume(page, 0.4);
  for (let i = 0; i < 40 && fileVolume(deviceFile) !== 0.4; i += 1) await sleep(250);
  record(
    'ikinci yazım öncekini .bak olarak bağlar',
    fileVolume(`${deviceFile}.bak`) === 0.3,
    `bak: ${fileVolume(`${deviceFile}.bak`)}`,
  );
  await browser.close();
  killHard(child);
  await sleep(1500);
  writeFileSync(deviceFile, '{"bozuk": ');
  child = launch();
  ({ browser, page } = await connect());
  await openPause(page);
  const afterCorrupt = await readVolume(page);
  record(
    'bozuk ana kayıt yedek jenerasyondan geri yüklenir',
    Math.abs(afterCorrupt - 0.3) < 1e-6,
    `arayüz: ${afterCorrupt}`,
  );
  const recoveredToast = await page.locator('.vol-toast').allTextContents();
  record(
    'kurtarma oyuncuya görünür bildirimle söylenir',
    recoveredToast.some((text) => /backup|yedeğinden/i.test(text)),
    recoveredToast.join(' | '),
  );

  // 4) hem ana hem yedek bozuk → karantina + boş kayıtla açılır, çökmez
  await browser.close();
  killHard(child);
  await sleep(1500);
  writeFileSync(deviceFile, '{"bozuk": ');
  writeFileSync(`${deviceFile}.bak`, '{"yarim": ');
  child = launch();
  ({ browser, page } = await connect());
  await openPause(page);
  const afterBoth = await readVolume(page);
  const files = readdirSync(dataDir);
  record(
    'iki jenerasyon da bozukken açılır (çökme yok); korunan eski depodan yeniden göçer',
    Math.abs(afterBoth - 0.7) < 1e-6,
    `arayüz: ${afterBoth}`,
  );
  const resetToast = await page.locator('.vol-toast').allTextContents();
  record(
    'sıfırlama oyuncuya görünür bildirimle söylenir',
    resetToast.some((text) => /fresh save|yeni kayıt/i.test(text)),
    resetToast.join(' | '),
  );
  record(
    'bozuk dosyalar karantinaya alınır',
    files.filter((name) => name.includes('.corrupt-')).length >= 1,
    files.join(', '),
  );

  // 5) son değer + pencere kapatma isteği
  await setVolume(page, 0.6);
  await browser.close();
  try {
    execFileSync('taskkill', ['/PID', String(child.pid)], { stdio: 'ignore' }); // /F yok → WM_CLOSE
  } catch {
    /* pencere yoksa */
  }
  const code = await waitExit(child, 15_000);
  record('WM_CLOSE sonrası süreç temiz çıkar', code === 0, `çıkış kodu: ${code}`);
  record(
    'kapanışta son değer yazılmış',
    fileVolume(deviceFile) === 0.6,
    `dosya: ${fileVolume(deviceFile)}`,
  );

  // 6) yazım ortasında sert öldürme: onaylanan (IPC'den dönen) her yazım kalıcıdır, dosya hiçbir turda sıfırlanmaz.
  const stormName = 'voltest-storm.json';
  const invokeInPage = (page, command, args) =>
    page.evaluate(
      ([cmd, payload]) => globalThis.__TAURI_INTERNALS__.invoke(cmd, payload),
      [command, args],
    );
  const rounds = [];
  for (let round = 1; round <= 5; round += 1) {
    child = launch();
    let session = await connect();
    await session.page.evaluate((name) => {
      globalThis.__acked = 0;
      const invoke = globalThis.__TAURI_INTERNALS__.invoke;
      const pad = 'x'.repeat(60_000);
      void (async () => {
        for (let n = 1; ; n += 1) {
          await invoke('vol_store_write', { name, data: JSON.stringify({ n, pad }) });
          globalThis.__acked = n;
        }
      })();
    }, stormName);
    await sleep(300 + round * 170);
    const acked = await session.page.evaluate(() => globalThis.__acked);
    killHard(child);
    await session.browser.close().catch(() => undefined);
    await sleep(1200);
    child = launch();
    session = await connect();
    const read = await invokeInPage(session.page, 'vol_store_read', { name: stormName });
    let n = -1;
    try {
      n = JSON.parse(read.data).n;
    } catch {
      /* ayrıştırılamadı */
    }
    rounds.push({ round, acked, afterKill: n, reset: read.reset, recovered: read.recovered });
    await session.browser.close().catch(() => undefined);
    killHard(child);
    await sleep(1200);
  }
  record(
    'yazım ortası öldürme: dosya hiçbir turda sıfırlanmaz ve ayrıştırılır',
    rounds.every((entry) => entry.reset === false && entry.afterKill > 0),
    JSON.stringify(rounds),
  );
  record(
    'yazım ortası öldürme: onaylanan her yazım kalıcıdır (sonraki değer ≥ onaylanan)',
    rounds.every((entry) => entry.afterKill >= entry.acked),
    rounds.map((entry) => `${entry.acked}→${entry.afterKill}`).join(', '),
  );
} finally {
  if (child.exitCode === null) killHard(child);
  await sleep(1000);
  rmSync(dataDir, { recursive: true, force: true });
  if (hadData) cpSync(backup, dataDir, { recursive: true });
}

const failed = steps.filter((step) => !step.ok);
console.log(JSON.stringify({ exe, dataDir, steps }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
