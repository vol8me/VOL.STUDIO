#!/usr/bin/env node
/**
 * Windows yerel vitrin platform turu (kapı değil, cihaz kabul kaydı; UI-06.3/UI-06.4).
 *
 *   node devtools/vol-showcase/scripts/native-platform-tour.mjs <VOL.UI.exe>
 *
 * WebView2'yi uzak hata ayıklama portuyla açar, Playwright'ı CDP ile bağlar ve vitrinin gerçek platform
 * yolunu sürer: kabuk türü/oturum bildirimi → görünür ayar özeti → tam ekran düğmesi GERÇEK pencereyi
 * değiştirir → tercih diske yazılır → sert öldürmeden sonra yeniden açılışta tercih geri gelir → pencere
 * kapatma isteği (WM_CLOSE) temiz çıkar. Her adım PASS/FAIL yazılır; sonuç hiçbir şekilde taklit edilmez.
 */
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const exe = process.argv[2];
if (!exe || !existsSync(exe)) {
  console.error('Kullanım: node native-platform-tour.mjs <VOL.UI.exe>');
  process.exit(2);
}
const PORT = 9335;
const IDENTIFIER = 'studio.vol.showcase';
const dataDir = join(process.env.APPDATA ?? '', IDENTIFIER);
const deviceFile = join(dataDir, 'volui-device.json');
const profile = mkdtempSync(join(tmpdir(), 'vol-showcase-tour-'));
const steps = [];
const record = (name, ok, detail = '') => {
  steps.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function launch() {
  return spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
    stdio: 'ignore',
    windowsHide: false,
  });
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
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
  });
  await page.locator('.vol-showcase-root').waitFor({ timeout: 30_000 });
  return { browser, page, warnings };
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

const invokeInPage = (page, command, args) =>
  page.evaluate(
    ([cmd, payload]) => globalThis.__TAURI_INTERNALS__.invoke(cmd, payload),
    [command, args],
  );
const nativeFullscreen = (page) => invokeInPage(page, 'window_fullscreen_state');

function storedDisplay() {
  try {
    const raw = JSON.parse(readFileSync(deviceFile, 'utf8'));
    const value = raw['device.volui:display'];
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return undefined;
  }
}

async function waitFor(predicate, ms = 10_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await predicate()) return true;
    await sleep(200);
  }
  return false;
}

// Gerçek kullanıcı kayıtlarına dokunulmaz: tur öncesi yedeklenir, sonunda geri yüklenir.
const backup = join(profile, 'appdata-backup');
const hadData = existsSync(dataDir);
if (hadData) cpSync(dataDir, backup, { recursive: true });
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
console.log(`Veri dizini: ${dataDir} (önceki içerik ${hadData ? 'yedeklendi' : 'yoktu'})`);

let child = launch();
try {
  let { browser, page, warnings } = await connect();

  // 1) kabuk türü ve oturum gerçek kabuktan gelir
  const root = await page.evaluate(() => {
    const element = globalThis.document.querySelector('.vol-showcase-root');
    return { platform: element?.dataset.volPlatform, session: element?.dataset.volSession };
  });
  record(
    'kabuk türü masaüstü bildirilir',
    root.platform === 'desktop',
    `platform: ${root.platform}`,
  );
  record(
    'oturum sınıfı kabuktan okunur (Windows: desktop)',
    root.session === 'desktop',
    `session: ${root.session}`,
  );

  // 2) görünür ayar özeti ve satırlar
  await page.locator('[role="tab"][id$="-tab-forms"]').click();
  const demo = page.locator('.vol-display-settings');
  await demo.scrollIntoViewIfNeeded();
  const summary = await demo.locator('.vol-display-settings__summary').textContent();
  record(
    'ayar kartı gerçek özeti gösterir',
    /Desktop app|Masaüstü uygulaması/.test(summary ?? ''),
    summary ?? '',
  );
  const visibleRows = await demo.locator('.vol-settings-row:visible').count();
  record('masaüstü oturumunda dört satır sunulur', visibleRows === 4, `satır: ${visibleRows}`);
  const sessionDisabled = await demo
    .locator('.vol-settings-row')
    .first()
    .locator('.vol-select')
    .isDisabled();
  record('oturum satırı bildirilir, seçilemez (simülasyon değil)', sessionDisabled);

  // 3) tam ekran düğmesi GERÇEK pencereyi değiştirir
  const fullscreenButton = page.locator('.vol-showcase-fullscreen-button');
  record('başlangıçta pencereli', (await nativeFullscreen(page)) === false);
  await fullscreenButton.click();
  record(
    'düğme native pencereyi tam ekran yapar',
    await waitFor(async () => (await nativeFullscreen(page)) === true),
  );
  record(
    'düğme durumu aria-pressed ile yansır',
    (await fullscreenButton.getAttribute('aria-pressed')) === 'true',
  );
  record(
    'tercih diske yazıldı (IPC → store → disk)',
    await waitFor(() => storedDisplay()?.mode === 'fullscreen'),
    JSON.stringify(storedDisplay()),
  );
  const modeText = await demo
    .locator('.vol-settings-row')
    .nth(1)
    .locator('.vol-select')
    .textContent();
  record(
    'ayar satırı F11/düğme değişimini gösterir',
    /Fullscreen|Tam ekran/.test(modeText ?? ''),
    modeText ?? '',
  );
  await browser.close();

  // 4) sert öldür → yeniden aç: tercih geri gelir ve pencere tam ekran açılır
  killHard(child);
  await sleep(1500);
  child = launch();
  ({ browser, page, warnings } = await connect());
  record(
    'TerminateProcess sonrası tercih geri gelir ve pencere tam ekran açılır',
    await waitFor(async () => (await nativeFullscreen(page)) === true, 15_000),
  );
  record(
    'açılışta düğme tam ekranı gösterir',
    (await page.locator('.vol-showcase-fullscreen-button').getAttribute('aria-pressed')) === 'true',
  );

  // 5) pencereli kipe dön ve çözünürlük uygula (yalnız ekrana sığıyorsa)
  await page.locator('.vol-showcase-fullscreen-button').click();
  record(
    'ikinci basış pencereli kipe döner',
    await waitFor(async () => (await nativeFullscreen(page)) === false),
  );
  await page.locator('[role="tab"][id$="-tab-forms"]').click();
  const demo2 = page.locator('.vol-display-settings');
  await demo2.scrollIntoViewIfNeeded();
  const screenSize = await page.evaluate(() => ({
    w: globalThis.screen.availWidth,
    h: globalThis.screen.availHeight,
  }));
  if (screenSize.w >= 1920 && screenSize.h >= 1080) {
    await demo2.locator('.vol-settings-row').nth(2).locator('.vol-select').click();
    await page.locator('.vol-select__listbox [role="option"][data-value="1920x1080"]').click();
    const resized = await waitFor(
      async () =>
        (await page.evaluate(() => Math.abs(globalThis.innerWidth - 1920) <= 24)) === true,
      10_000,
    );
    record(
      'çözünürlük seçimi pencere boyutunu uygular',
      resized,
      `ekran: ${screenSize.w}×${screenSize.h}`,
    );
  } else {
    console.log(
      `NOT-RUN  çözünürlük uygulaması — ekran ${screenSize.w}×${screenSize.h} 1920×1080'i taşımıyor`,
    );
  }
  record(
    'tur boyunca pencere/yetki uyarısı yok',
    warnings.filter((text) => /Görüntü kipi|not allowed|izin/i.test(text)).length === 0,
    warnings.join(' | ').slice(0, 300),
  );
  await browser.close();

  // 6) pencere kapatma isteği: temiz çıkış
  try {
    execFileSync('taskkill', ['/PID', String(child.pid)], { stdio: 'ignore' }); // /F yok → WM_CLOSE
  } catch {
    /* pencere yoksa */
  }
  const code = await waitExit(child, 15_000);
  record('WM_CLOSE sonrası süreç temiz çıkar', code === 0, `çıkış kodu: ${code}`);
} catch (error) {
  record('tur istisnasız tamamlandı', false, String(error?.stack ?? error));
} finally {
  killHard(child);
  await sleep(500);
  rmSync(dataDir, { recursive: true, force: true });
  if (hadData) cpSync(backup, dataDir, { recursive: true });
  rmSync(profile, { recursive: true, force: true });
}

const failed = steps.filter((step) => !step.ok);
console.log(`\n${steps.length - failed.length}/${steps.length} adım geçti`);
process.exit(failed.length === 0 ? 0 : 1);
