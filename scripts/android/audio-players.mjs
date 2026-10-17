#!/usr/bin/env node
/**
 * Bağlı cihazda bir uygulamanın ses çıkışı oynatıcılarını örnekler (UI-02.5):
 * `dumpsys audio` oynatıcılarını uygulamanın uid'ine süzer ve özetler.
 *
 *   node scripts/android/audio-players.mjs <paket> [--serial <no>]
 *
 * Çalma sürerken koşulur (ses laboratuvarında tetiklerken ya da bir döngüde).
 * Çıktı JSON'dur ve cihaz kimliği taşımaz. Duyulabilirlik ölçülmez: oynatıcı
 * `started` ve `mutedState: none` ise ses hoparlöre iletilir; `streamVolume`
 * ise cihaz akış seviyesi sıfırdır (kanıt "çıkışa ulaştı"yla sınırlıdır).
 */
import { execFileSync } from '../quality/command.mjs';
import { selectDevice } from './device-benchmark-contract.mjs';
import { parseAudioPlayers, parsePackageUid, summarizeAudioOutput } from './audioPlayers.mjs';

const ADB = process.env.ADB ?? 'adb';
const argv = process.argv.slice(2);
const pkg = argv.find((value) => !value.startsWith('--'));
if (!pkg || !/^[a-zA-Z][\w.]*$/.test(pkg)) {
  console.error('Kullanım: audio-players.mjs <paket> [--serial <no>]');
  process.exit(2);
}
const serialIndex = argv.indexOf('--serial');

const listing = execFileSync(ADB, ['devices', '-l'], { encoding: 'utf8' });
const serial = selectDevice(
  listing
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[0])
    .map(([deviceSerial, state]) => ({ serial: deviceSerial, state })),
  (serialIndex >= 0 ? argv[serialIndex + 1] : undefined) ?? process.env.ANDROID_SERIAL,
);
const adb = (args) => execFileSync(ADB, ['-s', serial, ...args], { encoding: 'utf8' });

const uid = parsePackageUid(adb(['shell', 'pm', 'list', 'packages', '-U', pkg]), pkg);
if (uid === null) {
  console.error(`Paket cihazda bulunamadı: ${pkg}`);
  process.exit(1);
}
const sdk = Number(adb(['shell', 'getprop', 'ro.build.version.sdk']).trim()) || null;
const players = parseAudioPlayers(adb(['shell', 'dumpsys', 'audio']));
console.log(JSON.stringify({ package: pkg, sdk, ...summarizeAudioOutput(players, uid) }, null, 2));
