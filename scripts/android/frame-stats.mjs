#!/usr/bin/env node
/**
 * Android resmi kare zamanlaması örneği (UI-00.6): bağlı cihazda bir uygulamanın
 * `dumpsys gfxinfo <paket> framestats` karelerini örnekler, sunum (DisplayPresentTime)
 * ve girdi→sunum kapsamlarını özetler.
 *
 *   node scripts/android/frame-stats.mjs <paket> [--taps N] [--serial <no>]
 *
 * Çıktı JSON'dur ve cihaz kimliği taşımaz. Uygulamayı açar, ısıtır, boşta kareleri
 * ve her dokunuşun HEMEN ardından kareleri örnekler (tampon ≈120 kare), sonunda
 * uygulamayı durdurur. Sunum sütunu yoksa kapsam `unsupported` yazılır.
 */
import { execFileSync } from '../quality/command.mjs';
import { selectDevice } from './device-benchmark-contract.mjs';
import { mergeFrames, parseFrameStats, summarizeFrameStats } from './frameStats.mjs';

const ADB = process.env.ADB ?? 'adb';
const argv = process.argv.slice(2);
const pkg = argv.find((value) => !value.startsWith('--'));
if (!pkg || !/^[a-zA-Z][\w.]*$/.test(pkg)) {
  console.error('Kullanım: frame-stats.mjs <paket> [--taps N] [--serial <no>]');
  process.exit(2);
}
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const taps = Number(option('--taps') ?? 4);
if (!Number.isInteger(taps) || taps < 0 || taps > 20) {
  console.error('--taps 0..20 arası tam sayı olmalı.');
  process.exit(2);
}

function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

const listing = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' });
const serial = selectDevice(
  listing
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .map(([deviceSerial, state]) => ({ serial: deviceSerial, state })),
  option('--serial') ?? process.env.ANDROID_SERIAL,
);
const adb = (args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' });

const size = /(\d+)x(\d+)/.exec(adb(['shell', 'wm', 'size']));
const [x, y] = size
  ? [Math.round(Number(size[1]) / 2), Math.round(Number(size[2]) / 2)]
  : [200, 200];
const sdk = Number(adb(['shell', 'getprop', 'ro.build.version.sdk']).trim()) || null;

adb(['shell', 'am', 'force-stop', pkg]);
adb(['shell', 'am', 'start', '-n', `${pkg}/.MainActivity`]);
try {
  sleepSeconds(9);
  adb(['shell', 'dumpsys', 'gfxinfo', pkg, 'reset']);
  sleepSeconds(1.5);
  const samples = [parseFrameStats(adb(['shell', 'dumpsys', 'gfxinfo', pkg, 'framestats']))];
  for (let index = 0; index < taps; index += 1) {
    samples.push(
      parseFrameStats(
        adb(['shell', `input tap ${x} ${y}; sleep 0.25; dumpsys gfxinfo ${pkg} framestats`]),
      ),
    );
    sleepSeconds(0.8);
  }
  const merged = mergeFrames(...samples);
  console.log(
    JSON.stringify(
      {
        schema: 'AndroidFrameStatsV1',
        package: pkg,
        sdk,
        taps,
        method:
          'dumpsys gfxinfo framestats: DisplayPresentTime (sunum), InputEventId/HandleInputStart (girdi), FrameTimelineVsyncId',
        summary: summarizeFrameStats(merged),
      },
      null,
      2,
    ),
  );
} finally {
  adb(['shell', 'am', 'force-stop', pkg]);
}
