import { execFileSync } from 'node:child_process';
import {
  accessSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import {
  buildGStreamerScannerCandidates,
  extractGStreamerPluginFilename,
  OPTIONAL_GSTREAMER_ELEMENTS,
  REQUIRED_GSTREAMER_ELEMENTS,
} from './linux-appimage-media.mjs';

const root = resolve(import.meta.dirname, '..');
const bundleDir = join(root, 'tauri-v2/src-tauri/target/release/bundle/appimage');
const appDir = join(bundleDir, 'VOL.HELL.AppDir');
const binary = join(root, 'tauri-v2/src-tauri/target/release/VOL.HELL');
const deploy =
  process.env.LINUXDEPLOY ?? join(homedir(), '.cache/tauri/linuxdeploy-x86_64.AppImage');
const canonical = join(bundleDir, 'VOL.HELL_0.1.0_amd64.AppImage');
const legacyGenerated = join(bundleDir, 'VOL.HELL-x86_64.AppImage');
const launcher = join(root, 'tauri-v2/src-tauri/linux.AppRun');

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function commandText(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  }).trim();
}

function optionalCommandText(command, args) {
  try {
    return commandText(command, args);
  } catch {
    return undefined;
  }
}

function resolveGStreamerPlugin(element, required) {
  try {
    const inspectOutput = commandText('gst-inspect-1.0', [element]);
    const filename = extractGStreamerPluginFilename(inspectOutput);
    if (!filename) throw new Error('Filename alanı bulunamadı');
    accessSync(filename);
    return filename;
  } catch (error) {
    if (!required) {
      console.warn(`Opsiyonel GStreamer elementi paketlenemedi: ${element}`);
      return null;
    }
    throw new Error(
      `Zorunlu GStreamer elementi paketlenemedi: ${element}. ` +
        'Linux build bağımlılıklarını ve gst-inspect-1.0 kurulumunu denetleyin.',
      { cause: error },
    );
  }
}

function bundleGStreamerRuntime() {
  const pluginDir = join(appDir, 'usr/lib/gstreamer-1.0');
  rmSync(pluginDir, { recursive: true, force: true });
  mkdirSync(pluginDir, { recursive: true });

  const pluginFiles = new Set();
  for (const element of REQUIRED_GSTREAMER_ELEMENTS) {
    pluginFiles.add(resolveGStreamerPlugin(element, true));
  }
  for (const element of OPTIONAL_GSTREAMER_ELEMENTS) {
    const filename = resolveGStreamerPlugin(element, false);
    if (filename) pluginFiles.add(filename);
  }

  for (const filename of pluginFiles) {
    copyFileSync(filename, join(pluginDir, basename(filename)));
  }

  const scannerSource = buildGStreamerScannerCandidates({
    envOverride: process.env.GST_PLUGIN_SCANNER_1_0,
    pluginScannerDir: optionalCommandText('pkg-config', [
      '--variable=pluginscannerdir',
      'gstreamer-1.0',
    ]),
    libexecDir: optionalCommandText('pkg-config', ['--variable=libexecdir', 'gstreamer-1.0']),
  }).find((candidate) => existsSync(candidate));
  if (!scannerSource) {
    throw new Error(
      'GStreamer plugin scanner bulunamadı. GST_PLUGIN_SCANNER_1_0 ile yolu belirtin.',
    );
  }
  const scannerTarget = join(appDir, 'usr/libexec/gstreamer-1.0/gst-plugin-scanner');
  mkdirSync(dirname(scannerTarget), { recursive: true });
  copyFileSync(scannerSource, scannerTarget);
  chmodSync(scannerTarget, 0o755);

  console.log(`${pluginFiles.size} GStreamer plugin'i ve plugin scanner paketlendi.`);
  return { pluginDir, scannerTarget };
}

function verifyGStreamerRuntime({ pluginDir, scannerTarget }) {
  const registryDir = mkdtempSync(join(tmpdir(), 'vol-gstreamer-registry-'));
  const libraryPath = [join(appDir, 'usr/lib'), join(appDir, 'usr/lib64')].join(':');
  const env = {
    ...process.env,
    LC_ALL: 'C',
    LD_LIBRARY_PATH: libraryPath,
    GST_PLUGIN_PATH_1_0: '',
    GST_PLUGIN_SYSTEM_PATH_1_0: pluginDir,
    GST_PLUGIN_SCANNER_1_0: scannerTarget,
    GST_REGISTRY_1_0: join(registryDir, 'registry.bin'),
  };

  try {
    for (const element of REQUIRED_GSTREAMER_ELEMENTS) {
      execFileSync('gst-inspect-1.0', [element], { env, stdio: 'ignore' });
    }

    const stereoProbeAudio = join(
      root,
      'games/vol-hell/public/assets/audio/music/main-menu/hollow-signal.ogg',
    );
    run(
      'gst-launch-1.0',
      [
        '-q',
        'filesrc',
        `location=${stereoProbeAudio}`,
        '!',
        // WebKit de açık demux/decoder zinciri değil decodebin kullanır. Bu
        // yol typefindfunctions eksikse üretim sırasında kesin olarak düşer.
        'decodebin',
        '!',
        'audioconvert',
        '!',
        // WebKit AudioFileReader ile aynı stereo kanal ayrıştırma yolunu
        // zorlarız; yalnız decodebin smoke testi interleave eklentisini
        // kullanmadığı için gerçek uygulamadaki sessizliği kaçırabilir.
        'deinterleave',
        'name=channels',
        'channels.src_0',
        '!',
        'queue',
        '!',
        'fakesink',
        'channels.src_1',
        '!',
        'queue',
        '!',
        'fakesink',
      ],
      { env, timeout: 15_000 },
    );
  } finally {
    rmSync(registryDir, { recursive: true, force: true });
  }

  console.log(
    'Paketlenmiş GStreamer elementleri ve WebKit uyumlu stereo OGG/Vorbis decode zinciri doğrulandı.',
  );
}

accessSync(deploy);
accessSync(appDir);
accessSync(binary);
accessSync(launcher);

// Tauri'nin AppImage bundling adımı linuxdeploy sonlandırmasında düşerse
// AppDir kalır. Yeniden çalıştırmada eski binary'nin sessizce paketlenmemesi
// için güncel release binary'si her zaman açıkça kopyalanır.
copyFileSync(binary, join(appDir, 'usr/bin/VOL.HELL'));
chmodSync(join(appDir, 'usr/bin/VOL.HELL'), 0o755);

// Tauri'nin media framework kopyalama adımı Fedora'nın `/usr/lib64` düzeninde
// pluginleri AppDir'e taşımıyor. Boş plugin yolu WebKitGTK sesini tamamen
// susturduğu için gereken elementler gerçek GStreamer registry'sinden çözülür.
const gStreamerRuntime = bundleGStreamerRuntime();

// Fedora'da linuxdeploy'nin strip adımı .relr.dyn bölümlerinde kırılabiliyor.
// İlk çağrı AppDir bağımlılıklarını dağıtır; paket adı ve mimariyi sabit tutar.
run(deploy, ['--appdir', appDir, '--output', 'appimage'], {
  cwd: bundleDir,
  env: { ...process.env, NO_STRIP: '1', ARCH: 'x86_64', APPIMAGE_EXTRACT_AND_RUN: '1' },
});

verifyGStreamerRuntime(gStreamerRuntime);

// linuxdeploy AppRun'ı otomatik ürettiği için VOL launcher'ını bundan sonra
// yerleştiriyoruz. appimagetool aynı AppDir'ı yeniden paketler.
copyFileSync(launcher, join(appDir, 'AppRun'));
chmodSync(join(appDir, 'AppRun'), 0o755);

const toolDir = mkdtempSync(join(tmpdir(), 'vol-appimagetool-'));
try {
  run(deploy, ['--appimage-extract'], {
    cwd: toolDir,
    env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' },
  });

  const appimageToolLauncher = join(
    toolDir,
    'squashfs-root/plugins/linuxdeploy-plugin-appimage/appimagetool-prefix/AppRun',
  );
  accessSync(appimageToolLauncher);
  rmSync(canonical, { force: true });
  run(appimageToolLauncher, [appDir, canonical], {
    cwd: dirname(canonical),
    env: { ...process.env, ARCH: 'x86_64' },
  });
  chmodSync(canonical, 0o755);
} finally {
  rmSync(toolDir, { recursive: true, force: true });
  rmSync(legacyGenerated, { force: true });
}
console.log(`AppImage hazır: ${canonical}`);
