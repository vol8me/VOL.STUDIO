#!/usr/bin/env node
/**
 * Windows yerel vitrin kare ve CPU sondası (cihaz ölçüm kaydı; kapı değil — UI-06.4/UI-12.4).
 *
 *   node devtools/vol-showcase/scripts/native-frame-probe.mjs <VOL.UI.exe> [--runs 2] [--idle-only]
 *
 * Vitrinin kendi kare ölçerini (`Shift+B`, `window.__volFrameBench`; sekme başına 3 sn, yöntem tarayıcı
 * ölçümüyle aynı) WebView2 içinde CDP ile sürer; ölçüm sırasında uygulama + `msedgewebview2` süreç ağacının işlemci süresi okunur. `--runs 2` aynı koşuyu iki kez
 * yapar: A/A farkı, ölçümün gürültü tabanıdır — bir önce/sonra karşılaştırması bu tabanın altındaysa fark
 * sayılmaz. Çıktı git dışı records alanına yazılır; kimlik/seri bilgisi içermez.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const exe = args.find((arg) => !arg.startsWith('--'));
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
if (!exe || !existsSync(exe)) {
  console.error('Kullanım: node native-frame-probe.mjs <VOL.UI.exe> [--runs 2] [--idle-only]');
  process.exit(2);
}
const RUNS = option('runs', 2);
const IDLE_ONLY = args.includes('--idle-only');
const PORT = 9336;
const here = dirname(fileURLToPath(import.meta.url));
const recordsDir = resolve(here, '../records/ui-device');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function powershell(script) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();
}

/** Kök sürecin ve soyunun toplam işlemci süresi (sn). */
function treeCpuSeconds(rootPid) {
  const script = `
    $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
    $ids = New-Object System.Collections.Generic.HashSet[int]
    [void]$ids.Add(${rootPid})
    do { $before = $ids.Count
      foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } }
    } while ($ids.Count -ne $before)
    $sum = 0.0
    foreach ($id in $ids) { $proc = Get-Process -Id $id -ErrorAction SilentlyContinue; if ($proc) { $sum += $proc.CPU } }
    $sum.ToString('0.000', [cultureinfo]::InvariantCulture)
  `;
  return Number(powershell(script));
}

function killHard(child) {
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/F', '/T'], { stdio: 'ignore' });
  } catch {
    /* zaten çıktı */
  }
}

async function oneRun(index) {
  const profile = mkdtempSync(join(tmpdir(), 'vol-showcase-probe-'));
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
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
    await page.locator('.vol-showcase-root').waitFor({ timeout: 30_000 });
    await sleep(2500); // açılış yükü otursun (yazı tipleri, ses bağlamı, ilk boyama)
    const idleCpuStart = treeCpuSeconds(child.pid);
    await sleep(5000);
    const idleCpuSeconds = treeCpuSeconds(child.pid) - idleCpuStart;

    // Boşta kimin çalıştığı: 3 sn boyunca rAF çağıranlar (yığın ucu) ve sonsuz çalışan animasyonlar.
    const idleWork = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const original = globalThis.requestAnimationFrame.bind(globalThis);
          const sites = new Map();
          let total = 0;
          globalThis.requestAnimationFrame = (callback) => {
            total += 1;
            const site = (new Error().stack ?? '')
              .split(String.fromCharCode(10))
              .slice(2, 4)
              .map((line) => line.trim().replace(/https?:\/\/[^/]+/, ''))
              .join(' <- ');
            sites.set(site, (sites.get(site) ?? 0) + 1);
            return original(callback);
          };
          setTimeout(() => {
            globalThis.requestAnimationFrame = original;
            const running = globalThis.document
              .getAnimations()
              .filter((animation) => animation.playState === 'running')
              .map((animation) => {
                const target = animation.effect?.target;
                const name = animation.animationName ?? animation.transitionProperty ?? 'animasyon';
                return `${target?.tagName?.toLowerCase() ?? '?'}.${String(target?.className ?? '').split(' ')[0]} ${name}`;
              });
            resolve({
              rafPerSecond: Math.round(total / 3),
              rafSites: [...sites].sort((a, b) => b[1] - a[1]).slice(0, 6),
              runningAnimations: [...new Set(running)].slice(0, 10),
              runningAnimationCount: running.length,
            });
          }, 3000);
        }),
    );

    if (IDLE_ONLY) {
      // Boşta CPU kime ait: A) olduğu gibi, B) rAF döngüleri öldürülmüş, C) ayrıca CSS animasyonları durdurulmuş.
      const window5 = async () => {
        const start = treeCpuSeconds(child.pid);
        await sleep(5000);
        return Number((treeCpuSeconds(child.pid) - start).toFixed(2));
      };
      const baseline = await window5();
      await page.evaluate(() => {
        globalThis.requestAnimationFrame = () => 0;
      });
      await sleep(500);
      const withoutRaf = await window5();
      await page.evaluate(() => {
        for (const animation of globalThis.document.getAnimations()) animation.pause();
      });
      await sleep(500);
      const withoutAnimations = await window5();
      await browser.close();
      return {
        run: index + 1,
        idleOnly: true,
        summary: {
          idleCpuSecondsPer5s: baseline,
          attribution: { baseline, withoutRaf, withoutAnimations },
          idleWork,
        },
      };
    }
    const cpuStart = treeCpuSeconds(child.pid);
    const wallStart = Date.now();
    await page.keyboard.press('Shift+B');
    await page.waitForFunction(() => globalThis.__volFrameBench?.done === true, null, {
      timeout: 600_000,
    });
    const wallSeconds = (Date.now() - wallStart) / 1000;
    const cpuSeconds = treeCpuSeconds(child.pid) - cpuStart;
    const slot = await page.evaluate(() => ({
      results: globalThis.__volFrameBench.results,
      bisected: globalThis.__volFrameBench.bisect.length,
      environment: globalThis.__volFrameBench.environment,
    }));
    await browser.close();
    const fpsValues = slot.results.map((row) => row.fps);
    return {
      run: index + 1,
      environment: {
        devicePixelRatio: slot.environment.devicePixelRatio,
        viewport: slot.environment.viewport,
        cores: slot.environment.cores,
        webview: /Edg\/[\d.]+/.exec(slot.environment.userAgent)?.[0] ?? 'bilinmiyor',
      },
      tabs: slot.results.map((row) => ({
        tab: row.tab,
        fps: Number(row.fps.toFixed(1)),
        p95Ms: Number(row.p95Ms.toFixed(1)),
        worstMs: Number(row.worstMs.toFixed(1)),
        slowShare: Number(row.slowShare.toFixed(4)),
      })),
      summary: {
        medianFps: Number(
          [...fpsValues].sort((a, b) => a - b)[Math.floor(fpsValues.length / 2)].toFixed(1),
        ),
        minFps: Number(Math.min(...fpsValues).toFixed(1)),
        idleCpuSecondsPer5s: Number(idleCpuSeconds.toFixed(2)),
        benchCpuSeconds: Number(cpuSeconds.toFixed(2)),
        benchWallSeconds: Number(wallSeconds.toFixed(1)),
        benchCpuCores: Number((cpuSeconds / wallSeconds).toFixed(2)),
        bisectedTabs: slot.bisected,
        idleWork,
      },
    };
  } finally {
    killHard(child);
    await sleep(800);
    rmSync(profile, { recursive: true, force: true });
  }
}

const runs = [];
for (let index = 0; index < RUNS; index += 1) {
  const run = await oneRun(index);
  runs.push(run);
  console.log(`Boşta: ${JSON.stringify(run.summary.idleWork)}`);
  if (run.idleOnly) {
    console.log(
      `Koşu ${run.run} (yalnız boşta): CPU sn/5 sn ${JSON.stringify(run.summary.attribution)}`,
    );
    continue;
  }
  console.log(
    `Koşu ${run.run}: medyan ${run.summary.medianFps} FPS, en düşük ${run.summary.minFps} FPS, ` +
      `boşta ${run.summary.idleCpuSecondsPer5s} sn CPU/5 sn, ölçüm ${run.summary.benchCpuCores} çekirdek`,
  );
}

const aa =
  !IDLE_ONLY && runs.length >= 2
    ? {
        medianFpsDelta: Number(
          Math.abs(runs[0].summary.medianFps - runs[1].summary.medianFps).toFixed(1),
        ),
        minFpsDelta: Number(Math.abs(runs[0].summary.minFps - runs[1].summary.minFps).toFixed(1)),
        benchCpuCoresDelta: Number(
          Math.abs(runs[0].summary.benchCpuCores - runs[1].summary.benchCpuCores).toFixed(2),
        ),
      }
    : null;
if (aa) console.log(`A/A farkı: ${JSON.stringify(aa)}`);

mkdirSync(recordsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = join(recordsDir, `windows-native-frame-${stamp}.json`);
writeFileSync(
  file,
  JSON.stringify({ schemaVersion: 1, kind: 'windows-native-frame-probe', runs, aa }, null, 2) +
    '\n',
);
console.log(`Kayıt: ${file}`);
