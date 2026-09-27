import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildShortcutParms,
  hwmonByName,
  hwmonWatts,
  parseAvahiBrowse,
  renderLauncher,
  renderModeEnv,
  resolveDeckHost,
  summarizeReport,
  toDeckGameId,
} from '../../deck-contract.mjs';

test('toDeckGameId: ürün adı devkit desenine çevrilir', () => {
  assert.equal(toDeckGameId('vol-deck-probe'), 'vol_deck_probe');
  assert.equal(toDeckGameId('VOL.HELL'), 'VOL.HELL');
  assert.throws(() => toDeckGameId(''), /desen/);
  assert.throws(() => toDeckGameId('1oyun'), /desen/);
});

test('resolveDeckHost: öncelik sırası ve sabit IP yokluğu', () => {
  assert.deepEqual(resolveDeckHost({ cli: '10.0.0.5' }), { host: '10.0.0.5', via: '--host' });
  assert.deepEqual(resolveDeckHost({ env: '192.168.9.9' }).via, 'DECK_HOST');
  assert.equal(resolveDeckHost({ getent: 'x' }).host, 'steamdeck.local');
  const avahi = [{ host: 'steamdeck.local', ip: '192.168.1.162', port: 22 }];
  assert.equal(resolveDeckHost({ avahi }).host, '192.168.1.162');
  assert.equal(resolveDeckHost({}), null);
});

test('parseAvahiBrowse: yalnız çözülmüş kayıtlar', () => {
  const text = [
    '=;wlan0;IPv4;steamdeck;_steamos-devkit._tcp;local;steamdeck.local;192.168.1.162;22;',
    '+;wlan0;IPv6;steamdeck;_steamos-devkit._tcp;local;steamdeck.local;fe80::1;22;',
    'bozuk satır',
  ].join('\n');
  assert.deepEqual(parseAvahiBrowse(text), [
    { host: 'steamdeck.local', ip: '192.168.1.162', port: 22 },
  ]);
});

test('buildShortcutParms: sözleşme şekli ve env dışarıda tutulur', () => {
  const parms = buildShortcutParms({
    gameid: 'vol_deck_probe',
    directory: '/home/deck/devkit-game/vol_deck_probe',
    argv: ['./run.sh'],
  });
  assert.equal(parms.gameid, 'vol_deck_probe');
  assert.equal(parms.settings.steam_play, '0');
  // `env` anahtarı araç tarafında zorunlu (KeyError) ama boş kalmalı:
  // değişkenler launcher'ın okuduğu mode.env üzerinden gider.
  assert.deepEqual(parms.env, {});
  assert.throws(() => buildShortcutParms({ gameid: 'vol-probe', argv: ['./run.sh'] }), /desen/);
  assert.throws(
    () => buildShortcutParms({ gameid: 'ok', directory: '/x', argv: ['/abs/path'] }),
    /argv\[0\]/,
  );
});

test('renderLauncher: ortam mode.env üzerinden, argv AppRun', () => {
  const sh = renderLauncher('vol_deck_probe');
  assert.match(sh, /\.vol-studio\/deck\/vol_deck_probe\.env/);
  assert.match(sh, /exec \.\/AppRun/);
});

test('renderModeEnv: meta karakterler reddedilir', () => {
  assert.equal(
    renderModeEnv({ WEBKIT_DISABLE_DMABUF_RENDERER: '1' }),
    'WEBKIT_DISABLE_DMABUF_RENDERER=1',
  );
  assert.throws(() => renderModeEnv({ A: '$(kötü)' }), /meta/);
  assert.throws(() => renderModeEnv({ 'KÖTÜ-AD': '1' }), /Geçersiz/);
});

test('hwmonByName: ada göre düğüm; numara sabitlenmez', () => {
  const scan = [
    '/sys/class/hwmon/hwmon0 ACAD',
    '/sys/class/hwmon/hwmon3 steamdeck_hwmon',
    '/sys/class/hwmon/hwmon5 amdgpu',
  ].join('\n');
  assert.equal(hwmonByName(scan, 'amdgpu'), '/sys/class/hwmon/hwmon5');
  assert.equal(hwmonByName(scan, 'steamdeck_hwmon'), '/sys/class/hwmon/hwmon3');
  assert.equal(hwmonByName(scan, 'yok'), null);
});

test('hwmonWatts: µW → W; okunamayan alan null', () => {
  assert.equal(hwmonWatts(5_045_000), 5.045);
  assert.equal(hwmonWatts('7002000'), 7.002);
  assert.equal(hwmonWatts('-'), null);
  assert.equal(hwmonWatts(0), null);
  assert.equal(hwmonWatts(undefined), null);
});

test('summarizeReport: fazlar, sinyaller, sanal kol ve runtime ayrışır', () => {
  const lines = [
    JSON.stringify({ v: 1, src: 'rust', type: 'start' }),
    JSON.stringify({
      src: 'js',
      type: 'info',
      env: { PRESSURE_VESSEL_RUNTIME: 'steamrt4_platform_4.0' },
    }),
    JSON.stringify({
      src: 'js',
      type: 'phase',
      phase: 'boş',
      sprites: 0,
      fps: 59.6,
      p95: 19,
      over20ms: 10,
      over34ms: 0,
    }),
    JSON.stringify({ src: 'rust', type: 'signal', signal: 15 }),
    JSON.stringify({ src: 'rust', type: 'suspend-gap', seconds: 61.2 }),
    JSON.stringify({
      src: 'js',
      type: 'pad-connected',
      id: 'Microsoft X-Box 360 pad 0',
      mapping: 'standard',
    }),
    'bozuk satır',
  ];
  const s = summarizeReport(lines);
  assert.equal(s.runtime, 'steamrt4_platform_4.0');
  assert.equal(s.phases.length, 1);
  assert.equal(s.phases[0].fps, 59.6);
  assert.deepEqual(s.signals, [15]);
  assert.deepEqual(s.suspendGaps, [61.2]);
  assert.equal(s.gamepads[0].id, 'Microsoft X-Box 360 pad 0');
  assert.equal(s.total, 6);
});

test('summarizeReport: oyun perf pencereleri, pad-input ve steamworks ayrışır', () => {
  const lines = [
    JSON.stringify({ src: 'js', type: 'info', env: { STEAM_GAMESCOPE: '1' } }),
    JSON.stringify({
      src: 'js',
      type: 'steamworks',
      available: true,
      manifestOk: true,
      appId: 480,
      deck: true,
    }),
    JSON.stringify({ src: 'js', type: 'pad-connected', id: 'Steam Deck', mapping: 'standard' }),
    JSON.stringify({ src: 'js', type: 'pad-input', button: 9, axis: null, t: 1234 }),
    JSON.stringify({
      src: 'js',
      type: 'perf',
      phase: 'vol-hell oyun',
      window: 0,
      fps: 59.9,
      p95: 17.2,
      over20ms: 2,
      over34ms: 0,
    }),
    JSON.stringify({
      src: 'js',
      type: 'perf',
      phase: 'vol-hell oyun',
      window: 1,
      fps: 60.0,
      p95: 16.9,
      over20ms: 0,
      over34ms: 0,
      final: true,
    }),
  ];
  const s = summarizeReport(lines);
  // İki pencere aynı faz adını taşır — window anahtarıyla ayrışmalı.
  assert.equal(s.phases.length, 2);
  assert.equal(s.phases[0].window, 0);
  assert.equal(s.phases[1].fps, 60.0);
  assert.deepEqual(s.padInputs, [{ button: 9, axis: null }]);
  assert.deepEqual(s.steamworks, { available: true, manifestOk: true, appId: 480, deck: true });
});
