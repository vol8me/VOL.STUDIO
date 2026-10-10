#!/usr/bin/env node
/**
 * Vitrini bağlı Android cihazda (Chrome, CDP) gerçek dokunma/yerleşim/ses/gecikme olarak koşar.
 * KAPI DEĞİL, cihaz kabul kaydıdır: çıktı `records/ui-device/<etiket>-<yön>/` altındadır (git dışı).
 *
 *   node devtools/vol-showcase/scripts/device-ui.mjs [--serial <s>] [--orientation portrait|landscape|both]
 *                                                  [--tag <ad>] [--no-build] [--font-scale <n>] [--spec <ad>] [--game]
 *
 * `--spec` yalnız dosya adı bu ifadeyi içeren belirtimi koşar (örn. `--spec textEntry`); verilmezse `tests/device` hepsi.
 * `--game` ayrıca VOL.TEST'i derler ve `VOL_DEVICE_GAME_URL` ile sunar (oyunun dokunmatik kontrolleri: `volTest.spec.ts`);
 * verilmezse o belirtim kendini atlar.
 *
 * Yerel `vite preview` sunucusunu açar, `adb reverse` ile cihazın `localhost`una bağlar, Chrome'un
 * DevTools soketini `adb forward` eder, `tests/device` belirtimini koşar ve her şeyi geri alır
 * (köprüler, sunucu, ekran dönüşü ayarı).
 */
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { startPreview } from './device-preview.mjs';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const ADB = process.env.ADB ?? 'adb';
const PORT = Number(process.env.VOL_DEVICE_PORT ?? 4175);
const GAME_PORT = PORT + 1;
const CDP_PORT = 9222;
const orientation = option('orientation', 'both');
const tag = option('tag', new Date().toISOString().slice(0, 10));
let serial = option('serial', '');
// Sistem yazı ölçeği (Ayarlar > Ekran > Yazı boyutu): 1 varsayılan, 2 en büyük erişilebilirlik ölçeği (UI-07.3).
const fontScale = option('font-scale', '');
const spec = option('spec', '');
const withGame = flag('game');

const adb = (parts, opts = {}) =>
  execFileSync(ADB, serial ? ['-s', serial, ...parts] : parts, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim();

function pickDevice() {
  const lines = execFileSync(ADB, ['devices'], { encoding: 'utf8' }).split('\n').slice(1);
  const ready = lines
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device');
  if (ready.length === 0) throw new Error('Bağlı Android cihaz yok (adb devices).');
  if (!serial) {
    if (ready.length > 1) throw new Error('Birden çok cihaz bağlı: --serial verin.');
    serial = ready[0][0];
  }
}

function setting(name) {
  return adb(['shell', 'settings', 'get', 'system', name]);
}

async function run(rotation) {
  const out = resolve(root, 'records/ui-device', `${tag}-${rotation.name}`);
  adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
  adb(['shell', 'settings', 'put', 'system', 'user_rotation', String(rotation.value)]);
  await new Promise((done) => setTimeout(done, 2500));
  console.log(`\n== ${rotation.name} (user_rotation=${rotation.value}) → ${out}`);
  const result = spawn(
    'pnpm',
    [
      'exec',
      'playwright',
      'test',
      '-c',
      'tests/device/playwright.config.ts',
      ...(spec ? [spec] : []),
    ],
    {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        VOL_DEVICE_URL: `http://localhost:${PORT}/`,
        ...(withGame ? { VOL_DEVICE_GAME_URL: `http://localhost:${GAME_PORT}/` } : {}),
        VOL_DEVICE_CDP: `http://127.0.0.1:${CDP_PORT}`,
        VOL_DEVICE_OUT: out,
        VOL_DEVICE_SERIAL: serial,
        VOL_DEVICE_FONT_SCALE: fontScale || original.fontScale,
      },
    },
  );
  return new Promise((done) => result.on('close', (code) => done(code ?? 1)));
}

/** Koşunun açtığı boş sekmeler cihazda birikmesin: `about:blank` ve sunucu sekmeleri kapatılır. */
async function closeProbeTabs() {
  try {
    const tabs = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    for (const tab of tabs) {
      if (
        tab.type === 'page' &&
        (tab.url === 'about:blank' ||
          tab.url.includes(`localhost:${PORT}`) ||
          tab.url.includes(`localhost:${GAME_PORT}`))
      ) {
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`);
      }
    }
  } catch {
    /* en iyi çaba */
  }
}

pickDevice();
const original = {
  auto: setting('accelerometer_rotation'),
  user: setting('user_rotation'),
  fontScale: setting('font_scale'),
};
let server;
let gameServer;
let failed = 0;
try {
  if (!flag('no-build')) {
    execFileSync('pnpm', ['--filter', '@volstudio/vol-showcase', 'build'], {
      cwd: repo,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }
  if (withGame && !flag('no-build')) {
    execFileSync('pnpm', ['--filter', '@volstudio/vol-test', 'build'], {
      cwd: repo,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  }
  if (fontScale) adb(['shell', 'settings', 'put', 'system', 'font_scale', fontScale]);
  server = await startPreview({ cwd: root, port: PORT });
  adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`]);
  if (withGame) {
    gameServer = await startPreview({ cwd: resolve(repo, 'games/vol-test'), port: GAME_PORT });
    adb(['reverse', `tcp:${GAME_PORT}`, `tcp:${GAME_PORT}`]);
  }
  adb([
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'about:blank',
    'com.android.chrome',
  ]);
  await new Promise((done) => setTimeout(done, 3000));
  adb(['forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote']);

  const plan = [
    { name: 'portrait', value: 0 },
    { name: 'landscape', value: 1 },
  ].filter((entry) => orientation === 'both' || orientation === entry.name);
  for (const rotation of plan) failed += (await run(rotation)) === 0 ? 0 : 1;
} finally {
  try {
    adb(['shell', 'settings', 'put', 'system', 'user_rotation', original.user]);
    adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', original.auto]);
    if (fontScale) {
      // `settings get` ayar yoksa "null" döner; geri alma varsayılana (1.0) iner.
      const restore =
        original.fontScale === 'null' || !original.fontScale ? '1.0' : original.fontScale;
      adb(['shell', 'settings', 'put', 'system', 'font_scale', restore]);
    }
    await closeProbeTabs();
    adb(['reverse', '--remove', `tcp:${PORT}`]);
    if (withGame) adb(['reverse', '--remove', `tcp:${GAME_PORT}`]);
    adb(['forward', '--remove', `tcp:${CDP_PORT}`]);
  } catch {
    /* geri alma en iyi çabadır */
  }
  await gameServer?.stop();
  await server?.stop();
}
process.exit(failed === 0 ? 0 : 1);
