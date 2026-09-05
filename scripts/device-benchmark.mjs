#!/usr/bin/env node
/**
 * Bağlı Android cihazda GERÇEK ölçüm.
 *
 * Masaüstü tarayıcı emülasyonu mobil davranışı tahmin eder, ölçmez: kare
 * bütçesi, bellek baskısı, soğuk açılış ve GC duraklamaları ancak cihazda
 * görünür. Bu betik o ölçümü bir araştırma turundan tek komuta indirir.
 *
 * KAPI DEĞİLDİR ve olamaz: cihaz her zaman bağlı değildir, ve bir kapının
 * koşulu geliştiricinin masasındaki donanım olamaz. Çıktısı bir REFERANStır —
 * bir sonraki ölçüm bununla kıyaslanır.
 *
 *   node scripts/device-benchmark.mjs [saniye]
 */
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB ?? 'adb';
const SECONDS = Number(process.argv[2] ?? 12);

/** Ölçülecek uygulamalar — paket kimliği, Tauri yapılandırmasındakiyle aynı. */
const APPS = [
  { name: 'vol-arachnid', pkg: 'com.volstudio.arachnid' },
  { name: 'vol-hell', pkg: 'com.volstudio.game' },
];

function adb(args) {
  return execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

function requireDevice() {
  let output;
  try {
    output = adb(['devices']);
  } catch {
    throw new Error(`'${ADB}' çalıştırılamadı. Android platform-tools PATH'te mi?`);
  }
  const devices = output
    .split('\n')
    .slice(1)
    .filter((line) => line.trim().endsWith('device'));
  if (devices.length === 0) {
    // Cihaz yoksa SESSİZCE geçmek yanlış olur: ölçüm yapılmadıysa sonuç yoktur.
    throw new Error('Bağlı cihaz yok. USB hata ayıklama açık mı?');
  }
  return devices[0].split(/\s+/)[0];
}

function pick(text, pattern) {
  const match = pattern.exec(text);
  return match === null ? null : match[1];
}

function coldStart(pkg, runs = 3) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    adb(['shell', 'am', 'force-stop', pkg]);
    execFileSync('sleep', ['2']);
    const output = adb(['shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`]);
    const total = pick(output, /TotalTime:\s*(\d+)/);
    if (total !== null) times.push(Number(total));
  }
  return times;
}

/**
 * WebGL kurulamayıp Canvas2D'ye düşüldü mü?
 *
 * Cihazdaki sayılar (fps, jank) geri düşüşü GÖSTERMEZ, yalnız sonucunu:
 * "yavaş" görünür, sebebi görünmez. Oyun geri düşüşte konsola uyarı yazar ve
 * WebView bunu logcat'e aktarır; ölçüm o uyarıyı arar.
 */
function rendererFallback(pkg) {
  try {
    const log = adb(['shell', 'logcat', '-d', '-t', '400', '-s', 'chromium:*']);
    return /WebGL kurulamadı/.test(log) ? 'canvas (⚠ WebGL kurulamadı)' : 'webgl';
  } catch {
    return 'okunamadı';
  }
}

function runtimeProfile(pkg) {
  adb(['shell', 'am', 'force-stop', pkg]);
  adb(['shell', 'logcat', '-c']);
  execFileSync('sleep', ['1']);
  adb(['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`]);
  execFileSync('sleep', [String(SECONDS)]);

  const gfx = adb(['shell', 'dumpsys', 'gfxinfo', pkg]);
  const mem = adb(['shell', 'dumpsys', 'meminfo', pkg]);

  const frames = Number(pick(gfx, /Total frames rendered:\s*(\d+)/) ?? 0);
  return {
    renderer: rendererFallback(pkg),
    frames,
    fps: frames === 0 ? 0 : Math.round((frames / SECONDS) * 10) / 10,
    jankPercent: pick(gfx, /Janky frames:\s*\d+\s*\(([\d.]+)%\)/),
    p50: pick(gfx, /50th percentile:\s*(\d+)ms/),
    p90: pick(gfx, /90th percentile:\s*(\d+)ms/),
    p99: pick(gfx, /99th percentile:\s*(\d+)ms/),
    missedVsync: pick(gfx, /Number Missed Vsync:\s*(\d+)/),
    pssMb: Math.round(Number(pick(mem, /TOTAL PSS:\s*(\d+)/) ?? 0) / 1024),
    graphicsMb: Math.round(Number(pick(mem, /Graphics:\s*(\d+)/) ?? 0) / 1024),
  };
}

const serial = requireDevice();
const model = adb(['shell', 'getprop', 'ro.product.model']).trim();
const sdk = adb(['shell', 'getprop', 'ro.build.version.sdk']).trim();
console.log(`[device] ${model} (SDK ${sdk}, ${serial}) — ${SECONDS} sn ölçüm\n`);

for (const app of APPS) {
  const installed = adb(['shell', 'pm', 'list', 'packages', app.pkg]).includes(app.pkg);
  if (!installed) {
    console.log(`  ${app.name}: KURULU DEĞİL — atlandı\n`);
    continue;
  }
  const starts = coldStart(app.pkg);
  const profile = runtimeProfile(app.pkg);
  console.log(`  ${app.name}`);
  console.log(`    soğuk açılış : ${starts.join(' / ')} ms`);
  console.log(
    `    kare         : ${profile.frames} kare (~${profile.fps} fps), jank %${profile.jankPercent}`,
  );
  console.log(
    `    kare süresi  : p50 ${profile.p50}ms  p90 ${profile.p90}ms  p99 ${profile.p99}ms  ` +
      `kaçan vsync ${profile.missedVsync}`,
  );
  console.log(`    renderer     : ${profile.renderer}`);
  console.log(`    bellek       : PSS ${profile.pssMb} MB (grafik ${profile.graphicsMb} MB)\n`);
}
