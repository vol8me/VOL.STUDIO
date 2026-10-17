import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { runCommandSync, writeCommand } from '../../quality/tests/runCommand.mjs';

/** Süreci eşzamansız koşar; eşzamanlı testler birbirini beklemesin. */
function runAsync(command, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => resolveRun({ status: null, stdout, stderr: String(error) }));
    child.on('close', (status) => resolveRun({ status, stdout, stderr }));
  });
}

async function measure(args = [], env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'android-metrics-'));
  try {
    const adb = writeCommand(
      dir,
      'adb',
      `#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
case "$*" in
  "devices -l") printf 'List of devices attached\\nPRIVATE_SERIAL device\\n' ;;
  *ro.product.model*) echo PRIVATE_OWNER_MODEL ;;
  *ro.build.version.sdk*) echo 35 ;;
  *"pm list packages"*) echo package:com.volstudio.voltest ;;
  *"am start"*) printf 'Status: ok\\nTotalTime: 100\\n' ;;
  *"dumpsys gfxinfo"*) printf 'Total frames rendered: 120\\nJanky frames: 0 (0%%)\\n' ;;
  *run-as*) exit 1 ;;
  *pidof*) echo 123 ;;
  *"dumpsys package"*) printf 'versionCode=1\\nversionName=0.1.0\\n' ;;
esac
`,
    );
    const loader = join(dir, 'loader.mjs');
    writeFileSync(
      loader,
      `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const original = childProcess.execFileSync;
childProcess.execFileSync = (file, ...args) => file === 'sleep' ? '' : original(file, ...args);
syncBuiltinESMExports();\n`,
    );
    const childEnv = { ...process.env, ADB: adb, ANDROID_SERIAL: '', ...env };
    delete childEnv.NODE_TEST_CONTEXT;
    const fixture = runCommandSync(adb, ['devices', '-l'], { encoding: 'utf8', env: childEnv });
    assert.equal(fixture.status, 0, fixture.stderr);
    assert.match(fixture.stdout, /PRIVATE_SERIAL device/, fixture.stderr);
    return await runAsync(
      process.execPath,
      [
        '--import',
        pathToFileURL(loader).href,
        resolve('scripts/android/device-benchmark.mjs'),
        ...args,
        '0.001',
      ],
      { env: childEnv },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Her test kendi geçici dizininde ve kendi süreçlerinde koşar; birbirini beklemezler.
describe('device-benchmark çıktısı', { concurrency: true }, () => {
  test('Android çıktısı cihaz serial ve sahip modelini yayımlamaz', async () => {
    const result = await measure();
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /PRIVATE_SERIAL|PRIVATE_OWNER_MODEL/);
  });

  test('native çizim sayacı oyun FPS olarak sunulmaz', async () => {
    const result = await measure();
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /120000 fps/);
    assert.match(result.stdout, /native çizim/);
  });

  test('boş renderer logu WebGL kanıtı sayılmaz', async () => {
    const result = await measure();
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /renderer\s+: webgl/);
    assert.match(result.stdout, /renderer\s+: bilinmiyor/);
  });

  test('JSON ölçümü bilinmeyen oyuna hazır ve ilk sunum zamanlarını null tutar', async () => {
    const result = await measure(['--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.apps[0].startup.gameReadyMs, null);
    assert.equal(report.apps[0].startup.firstPresentMs, null);
    assert.deepEqual(report.apps[0].startup.nativeActivityTotalMs, [100, 100, 100]);
    assert.equal(report.apps[0].runtime.game.fps, null);
    assert.equal(report.apps[0].runtime.nativeRenderer.totalFrames, 120);
    assert.equal(report.apps[0].runtime.memory.pssMb, null);
    assert.equal(report.apps[0].build.versionName, '0.1.0');
    assert.doesNotMatch(result.stdout, /PRIVATE_SERIAL|PRIVATE_OWNER_MODEL/);
  });

  test('başarısız seçimin hata çıktısı seriali yayımlamaz', async () => {
    const result = await measure(['--serial', 'PRIVATE_MISSING']);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_MISSING/);
  });
});
