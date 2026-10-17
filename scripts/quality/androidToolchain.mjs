import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from './command.mjs';

export const ANDROID_PROFILE = Object.freeze({
  jdk: 21,
  sdk: 36,
  buildTools: '36.0.0',
  ndk: '27.0.12077973',
  cmake: '3.22.1',
  rustTarget: 'aarch64-linux-android',
});

export function checkAndroidToolchain(env = process.env, run = spawnSync) {
  const problems = [];
  const normalized = (value) => {
    const path = resolve(value);
    return process.platform === 'win32' ? path.toLowerCase() : path;
  };
  const select = (names) => {
    const values = names.map((name) => env[name]).filter(Boolean);
    if (!values.length) {
      problems.push(`${names.join('/')} tanımlı değil.`);
      return null;
    }
    if (new Set(values.map(normalized)).size > 1)
      problems.push(`${names.join('/')} farklı köklere işaret ediyor.`);
    return values[0];
  };
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const requireFile = (base, parts, label) => {
    const file = join(base, ...parts);
    if (!existsSync(file)) problems.push(`${label} eksik.`);
    return file;
  };
  const javaHome = select(['JAVA_HOME']);
  const sdk = select(['ANDROID_HOME', 'ANDROID_SDK_ROOT']);
  const ndk = select(['NDK_HOME', 'ANDROID_NDK_HOME']);
  if (javaHome) {
    const java = requireFile(javaHome, ['bin', `java${suffix}`], 'JDK java');
    const result = run(java, ['-version'], { encoding: 'utf8', env, windowsHide: true });
    const banner = `${result.stderr ?? ''}${result.stdout ?? ''}`;
    if (result.error || result.status !== 0 || !/version "21(?:\.|"|[-+])/.test(banner))
      problems.push(`JDK ${ANDROID_PROFILE.jdk} profili doğrulanamadı.`);
    const javac = requireFile(javaHome, ['bin', `javac${suffix}`], 'JDK javac');
    const compiler = run(javac, ['-version'], { encoding: 'utf8', env, windowsHide: true });
    if (
      compiler.error ||
      compiler.status !== 0 ||
      !/javac 21(?:\.|\s|$)/.test(`${compiler.stdout ?? ''}${compiler.stderr ?? ''}`)
    )
      problems.push('JDK 21 javac doğrulanamadı.');
  }
  if (sdk) {
    requireFile(
      sdk,
      ['platforms', `android-${ANDROID_PROFILE.sdk}`, 'android.jar'],
      'SDK android-36',
    );
    requireFile(
      sdk,
      ['build-tools', ANDROID_PROFILE.buildTools, `aapt2${suffix}`],
      'Build tools 36.0.0',
    );
    requireFile(sdk, ['platform-tools', `adb${suffix}`], 'Android platform-tools');
    requireFile(sdk, ['cmake', ANDROID_PROFILE.cmake, 'bin', `cmake${suffix}`], 'CMake 3.22.1');
  }
  if (ndk) {
    const properties = requireFile(ndk, ['source.properties'], 'NDK source.properties');
    const revision = existsSync(properties)
      ? /^Pkg\.Revision\s*=\s*(.+)$/m.exec(readFileSync(properties, 'utf8'))?.[1].trim()
      : null;
    if (revision !== ANDROID_PROFILE.ndk)
      problems.push(`NDK ${ANDROID_PROFILE.ndk} profili doğrulanamadı.`);
    const host =
      process.platform === 'win32'
        ? 'windows-x86_64'
        : process.platform === 'darwin'
          ? 'darwin-x86_64'
          : 'linux-x86_64';
    const toolchain = join(ndk, 'toolchains', 'llvm', 'prebuilt', host);
    const clang = requireFile(toolchain, ['bin', `clang${suffix}`], 'NDK clang');
    requireFile(toolchain, ['sysroot', 'usr', 'include', 'android', 'api-level.h'], 'NDK sysroot');
    const compiler = run(clang, ['--version'], { encoding: 'utf8', env, windowsHide: true });
    if (
      compiler.error ||
      compiler.status !== 0 ||
      !/clang version/.test(`${compiler.stdout ?? ''}${compiler.stderr ?? ''}`)
    )
      problems.push('NDK clang çalıştırılamadı.');
  }
  if (sdk && ndk && javaHome) {
    const targets = run('rustup', ['target', 'list', '--installed'], {
      encoding: 'utf8',
      env,
      windowsHide: true,
    });
    if (
      targets.error ||
      targets.status !== 0 ||
      !targets.stdout?.split(/\s+/).includes(ANDROID_PROFILE.rustTarget)
    )
      problems.push(`Rust target ${ANDROID_PROFILE.rustTarget} eksik.`);
  }
  return { problems };
}
