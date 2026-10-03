#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseDeviceBenchmarkArgs, selectDevice } from './device-benchmark-contract.mjs';
import {
  appendedDiagnostics,
  gameDiagnostics,
  nativeRuntime,
} from './device-benchmark-records.mjs';
import { deviceBenchmarkCandidates } from '../quality/deviceApps.mjs';
import { loadWorkspaceLifecycle } from '../quality/workspaceLifecycle.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const ADB = process.env.ADB ?? 'adb';
let serial;

function adb(args) {
  // `shell: true` Windows'ta `adb.cmd`/`.CMD` çalıştırmanın tek yoludur
  // (`EINVAL`); POSIX'te aynı çağrıyı değiştirmez.
  return execFileSync(ADB, serial ? ['-s', serial, ...args] : args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: true,
  });
}

/** Ölçüm beklemeleri kabuk `sleep`ine değil Node saatine bağlıdır. */
function sleepSeconds(seconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    seconds * 1000,
  );
}

function optionalAdb(args) {
  try {
    return adb(args);
  } catch {
    return null;
  }
}

function requireDevice(requestedSerial) {
  const output = optionalAdb(['devices', '-l']);
  if (output === null) throw new Error('Android platform-tools çalıştırılamadı.');
  return selectDevice(
    output
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([deviceSerial, state]) => ({ serial: deviceSerial, state })),
    requestedSerial,
  );
}

function pick(text, pattern) {
  return pattern.exec(text ?? '')?.[1] ?? null;
}

function coldStart(pkg, runs = 3) {
  const nativeActivityTotalMs = [];
  for (let i = 0; i < runs; i++) {
    adb(['shell', 'am', 'force-stop', pkg]);
    sleepSeconds(2);
    const output = adb(['shell', 'am', 'start', '-W', '-n', `${pkg}/.MainActivity`]);
    const total = pick(output, /TotalTime:\s*(\d+)/);
    nativeActivityTotalMs.push(total === null ? null : Number(total));
  }
  return { nativeActivityTotalMs, gameReadyMs: null, firstPresentMs: null };
}

function readDiagnostics(pkg) {
  const paths = optionalAdb([
    'shell',
    'run-as',
    pkg,
    'find',
    'files',
    '-name',
    'diagnostics.jsonl',
  ]);
  if (paths === null) return null;
  const path = paths
    .trim()
    .split('\n')
    .find((file) => /^files\/[\w./-]*diagnostics\.jsonl$/.test(file));
  if (!path) return '';
  return optionalAdb(['shell', 'run-as', pkg, 'cat', path]);
}

function runtimeProfile(pkg, seconds) {
  adb(['shell', 'am', 'force-stop', pkg]);
  const before = readDiagnostics(pkg);
  adb(['shell', 'dumpsys', 'gfxinfo', pkg, 'reset']);
  adb(['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`]);
  sleepSeconds(seconds);
  const game = gameDiagnostics(appendedDiagnostics(before, readDiagnostics(pkg)));
  const gfx = optionalAdb(['shell', 'dumpsys', 'gfxinfo', pkg]) ?? '';
  const mem = optionalAdb(['shell', 'dumpsys', 'meminfo', pkg]) ?? '';
  return { game, ...nativeRuntime(gfx, mem) };
}

function buildInfo(pkg) {
  const info = optionalAdb(['shell', 'dumpsys', 'package', pkg]);
  return {
    versionName: pick(info, /versionName=([^\s]+)/),
    versionCode: pick(info, /versionCode=(\d+)/),
  };
}

function printReport(report) {
  const known = (value) => value ?? 'bilinmiyor';
  console.log(`[device] SDK ${known(report.device.sdk)} — ${report.durationSeconds} sn ölçüm\n`);
  for (const app of report.apps) {
    console.log(`  ${app.name}`);
    const profile = app.runtime;
    console.log(
      `    native açılış: ${app.startup.nativeActivityTotalMs.map(known).join(' / ')} ms`,
    );
    console.log('    oyuna hazır / ilk fiziksel sunum: bilinmiyor');
    console.log(`    oyun FPS     : ${known(profile.game.fps)}`);
    console.log(
      `    native çizim : ${known(profile.nativeRenderer.totalFrames)} kare, jank %${known(profile.nativeRenderer.jankPercent)}`,
    );
    console.log(`    renderer     : ${known(profile.game.renderer)}`);
    console.log(
      `    bellek       : PSS ${known(profile.memory.pssMb)} MB (grafik ${known(profile.memory.graphicsMb)} MB)\n`,
    );
  }
  for (const name of report.skipped) console.log(`  ${name}: KURULU DEĞİL — atlandı`);
}

try {
  const cli = parseDeviceBenchmarkArgs(process.argv.slice(2), process.env.ANDROID_SERIAL);
  const candidates = deviceBenchmarkCandidates(
    ROOT,
    loadWorkspaceLifecycle(join(ROOT, 'workspace-lifecycle.json')),
  );
  /** @type {{ schemaVersion: number, durationSeconds: number, device: { sdk: number | null }, apps: Array<{ name: string, build: ReturnType<typeof buildInfo>, startup: ReturnType<typeof coldStart>, runtime: ReturnType<typeof runtimeProfile> }>, skipped: string[] }} */
  const report = {
    schemaVersion: 1,
    durationSeconds: cli.seconds,
    device: { sdk: null },
    apps: [],
    skipped: [],
  };
  if (candidates.length) {
    serial = requireDevice(cli.serial);
    const sdk = Number(optionalAdb(['shell', 'getprop', 'ro.build.version.sdk']));
    report.device.sdk = sdk > 0 && Number.isFinite(sdk) ? sdk : null;
    for (const app of candidates) {
      if (
        !adb(['shell', 'pm', 'list', 'packages', app.pkg])
          .split('\n')
          .includes(`package:${app.pkg}`)
      ) {
        report.skipped.push(app.name);
        continue;
      }
      report.apps.push({
        name: app.name,
        build: buildInfo(app.pkg),
        startup: coldStart(app.pkg),
        runtime: runtimeProfile(app.pkg, cli.seconds),
      });
    }
  }
  if (cli.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
} catch {
  console.error(
    '[device-benchmark] Ölçüm tamamlanamadı; cihaz seçimini, bağlantıyı ve komut seçeneklerini kontrol edin.',
  );
  process.exitCode = 1;
}
