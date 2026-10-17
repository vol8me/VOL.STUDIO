import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { checkAndroidToolchain } from '../androidToolchain.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'vol android ölçüm-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const java = join(root, 'jdk');
  const sdk = join(root, 'sdk');
  const ndk = join(sdk, 'ndk', '27.0.12077973');
  const files = {
    [join(java, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')]: '',
    [join(java, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')]: '',
    [join(sdk, 'platforms', 'android-36', 'android.jar')]: '',
    [join(sdk, 'build-tools', '36.0.0', process.platform === 'win32' ? 'aapt2.exe' : 'aapt2')]: '',
    [join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')]: '',
    [join(sdk, 'cmake', '3.22.1', 'bin', process.platform === 'win32' ? 'cmake.exe' : 'cmake')]: '',
    [join(ndk, 'source.properties')]: 'Pkg.Revision = 27.0.12077973\n',
    [join(
      ndk,
      'toolchains',
      'llvm',
      'prebuilt',
      process.platform === 'win32'
        ? 'windows-x86_64'
        : process.platform === 'darwin'
          ? 'darwin-x86_64'
          : 'linux-x86_64',
      'bin',
      process.platform === 'win32' ? 'clang.exe' : 'clang',
    )]: '',
    [join(
      ndk,
      'toolchains',
      'llvm',
      'prebuilt',
      process.platform === 'win32'
        ? 'windows-x86_64'
        : process.platform === 'darwin'
          ? 'darwin-x86_64'
          : 'linux-x86_64',
      'sysroot',
      'usr',
      'include',
      'android',
      'api-level.h',
    )]: '',
  };
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  return { env: { JAVA_HOME: java, ANDROID_HOME: sdk, NDK_HOME: ndk }, sdk, ndk };
}

test('Android profilinde JDK21, SDK36 ve NDK gerçek dosyalarla doğrulanır', (t) => {
  const { env } = fixture(t);
  const result = checkAndroidToolchain(env, (command) => ({
    status: 0,
    stdout:
      command === 'rustup'
        ? 'aarch64-linux-android\n'
        : command.includes('javac')
          ? 'javac 21.0.12'
          : command.includes('clang')
            ? 'clang version 18.0'
            : '',
    stderr: 'openjdk version "21.0.12"',
  }));
  assert.deepEqual(result.problems, []);
});

test('yanlış JDK, eksik SDK/NDK ve ayrışan SDK aliasları reddedilir', (t) => {
  const { env, sdk, ndk } = fixture(t);
  rmSync(join(sdk, 'platforms', 'android-36', 'android.jar'));
  writeFileSync(join(ndk, 'source.properties'), 'Pkg.Revision = 26.1.0');
  const result = checkAndroidToolchain({ ...env, ANDROID_SDK_ROOT: sdk + '-başka' }, () => ({
    status: 0,
    stderr: 'openjdk version "25.0.1"',
  }));
  assert.ok(result.problems.some((p) => p.includes('JDK 21')));
  assert.ok(result.problems.some((p) => p.includes('android-36')));
  assert.ok(result.problems.some((p) => p.includes('27.0.12077973')));
  assert.ok(result.problems.some((p) => p.includes('farklı')));
});

test('ortam değişkenleri eksikse host başarısı Android başarısına dönüşmez', () => {
  const result = checkAndroidToolchain({}, () => {
    throw new Error('çağrılmamalı');
  });
  assert.ok(result.problems.length >= 3);
});

test('JRE ve yalnız revision taşıyan eksik NDK hazır araç profili sayılamaz', (t) => {
  const { env, ndk } = fixture(t);
  rmSync(join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac'));
  rmSync(join(ndk, 'toolchains'), { recursive: true });
  const result = checkAndroidToolchain(env, () => ({
    status: 0,
    stdout: 'aarch64-linux-android',
    stderr: 'openjdk version "21.0.12"',
  }));
  assert.ok(result.problems.some((p) => p.includes('javac')));
  assert.ok(result.problems.some((p) => p.includes('clang')));
  assert.ok(result.problems.some((p) => p.includes('sysroot')));
});
