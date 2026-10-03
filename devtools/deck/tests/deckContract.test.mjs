import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import posix from 'node:path/posix';
import { isWindows, runCommand, writeCommand } from '../../../scripts/quality/tests/runCommand.mjs';
import {
  assertCleanConfirmation,
  assertInventoryPreserved,
  buildRsyncArgs,
  buildReleaseShortcutParms,
  buildShortcutParms,
  shortcutRegistrationSucceeded,
  fullMeasurementPlan,
  hwmonByName,
  hwmonWatts,
  parseAvahiBrowse,
  renderLauncher,
  renderAtomicWriteCommand,
  renderInventoryCommand,
  renderLogReadCommand,
  renderPrepareReleaseCommand,
  renderReleaseStopCommand,
  renderModeEnv,
  resolveDeckHost,
  summarizeReport,
  releaseDirectory,
  sanitizeReport,
  shellQuote,
  toDeckGameId,
} from '../scripts/deck-contract.mjs';

function remote(command) {
  // `sh` gerçek bir yürütülebilirdir; `shell: true` `cmd.exe` üzerinden çağırır
  // ve tek tırnaklı Python kodunun argüman sınırını bozar.
  //
  // Windows'ta `HOME` tanımsızdır; devkit komutları `os.path.expanduser` ve
  // `$HOME` ile ev dizinini çözer. HOME geçici diske eşlenir, aksi halde
  // komutlar gerçek kullanıcı profilini hedefler.
  return runCommand('sh', ['-c', command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: {
      ...process.env,
      HOME: process.env.HOME ?? '',
      USERPROFILE: process.env.USERPROFILE ?? process.env.HOME ?? '',
    },
  });
}

// Windows yolları kabuk betiğine gömülürken `\` kaçış karakteridir. Render
// fonksiyonlarına verilen yerel yol POSIX'a çevrilir; komut her iki platformda
// aynı yolu görür.
function shellPath(value) {
  return String(value).replace(/\\/g, '/');
}

function shellInventory(...args) {
  // Yalnız yol ARGÜMANLARI normalize edilir; komutun kendisi (Python kodu)
  // dokunulmadan kalır.
  return renderInventoryCommand(...args.map((arg) => (typeof arg === 'string' ? shellPath(arg) : arg)));
}

function shellLogRead(...args) {
  return renderLogReadCommand(...args.map((arg) => (typeof arg === 'string' ? shellPath(arg) : arg)));
}

function shellAtomicWrite(...args) {
  return renderAtomicWriteCommand(...args.map((arg) => (typeof arg === 'string' ? shellPath(arg) : arg)));
}

function shellReleaseStop(...args) {
  return renderReleaseStopCommand(...args.map((arg) => (typeof arg === 'string' ? shellPath(arg) : arg)));
}

// Windows'ta `HOME` tanımsızdır ve Python `expanduser` `USERPROFILE`'ı okur;
// devkit komutları ikisini de ev dizini olarak kullanır. Test kapsamı
// boyunca ikisi geçici diske bağlanır ve sonra geri alınır.
function bindHome(directory) {
  const posix = directory.replace(/\\/g, '/');
  const previous = {
    home: process.env.HOME,
    userProfile: process.env.USERPROFILE,
  };
  process.env.HOME = posix;
  process.env.USERPROFILE = posix;
  return () => {
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    if (previous.userProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previous.userProfile;
  };
}

function inDisk(task) {
  const directory = mkdtempSync(join(tmpdir(), 'vol-deck-contract-'));
  const restore = bindHome(directory);
  try {
    task(directory);
  } finally {
    restore();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('toDeckGameId: ürün adı devkit desenine çevrilir', () => {
  assert.equal(toDeckGameId('vol-deck-probe'), 'vol_deck_probe');
  assert.equal(toDeckGameId('SAMPLE.GAME'), 'SAMPLE.GAME');
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
  for (const host of ['-oProxyCommand=bad', 'host; command', 'host\ncommand', 'host$(command)']) {
    assert.throws(() => resolveDeckHost({ cli: host }));
  }
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

test('devkit release kısayolu betiği gameid köküne göre bulur', () => {
  const root = '/home/deck/devkit-game/SAMPLE.GAME_unique';
  const release = `${root}/.vol-release-2026-unique`;
  const parms = buildReleaseShortcutParms({ gameid: 'SAMPLE.GAME_unique', release });
  assert.equal(parms.directory, root);
  assert.equal(posix.join(parms.directory, parms.argv[0]), `${release}/run.sh`);
  assert.throws(() => buildReleaseShortcutParms({ gameid: 'SAMPLE.GAME', release: root }));
});

test('devkit boş başarı yanıtını kayıt başarısı olarak kabul eder', () => {
  assert.equal(shortcutRegistrationSucceeded({ success: '' }), true);
  assert.equal(shortcutRegistrationSucceeded({ success: 'registered' }), true);
  assert.equal(shortcutRegistrationSucceeded({ error: 'missing file' }), false);
  assert.equal(shortcutRegistrationSucceeded({}), false);
});

test('renderLauncher: ortam mode.env üzerinden, argv AppRun', () => {
  const sh = renderLauncher('vol_deck_probe');
  assert.match(sh, /\.vol-studio\/deck\/vol_deck_probe\.env/);
  assert.match(sh, /exec \.\/AppRun/);
});

test('full yeni release kaydı ile ölçüm flagını açar ve oyun için süre kullanır', () => {
  const records = '/private/new-release-record';
  assert.deepEqual(fullMeasurementPlan('games/sample-game', records), {
    release: records,
    flags: { VOL_DECK_MEASURE: '1' },
    seconds: 60,
  });
  assert.equal(fullMeasurementPlan('games/sample-game', records, 30).seconds, 30);
  assert.equal(fullMeasurementPlan('devtools/deck', records).seconds, undefined);
  assert.throws(() => fullMeasurementPlan('games/sample-game', undefined), /release/);
  assert.throws(() => fullMeasurementPlan('games/sample-game', records, 0), /saniye/);
});

test('ölçüm hava, mevsim ve kalite değerleri sıkı izin listesiyle taşınır', () => {
  for (const [key, allowed] of Object.entries({
    VOL_DECK_WEATHER: ['clear', 'dust', 'rain', 'snow'],
    VOL_DECK_SEASON: ['spring', 'summer', 'autumn', 'winter'],
    VOL_DECK_QUALITY: ['low', 'high'],
  })) {
    for (const value of allowed) {
      assert.equal(renderModeEnv({ [key]: value }), `${key}=${value}`);
      assert.deepEqual(
        JSON.parse(sanitizeReport(JSON.stringify({ type: 'info', env: { [key]: value } }))).env,
        { [key]: value },
      );
    }
    for (const value of ['unknown', allowed[0].toUpperCase(), 'low:high', '1']) {
      assert.throws(() => renderModeEnv({ [key]: value }));
      assert.deepEqual(
        JSON.parse(sanitizeReport(JSON.stringify({ type: 'info', env: { [key]: value } }))).env,
        {},
      );
    }
  }
});

test('renderModeEnv: meta karakterler reddedilir', () => {
  assert.equal(
    renderModeEnv({ WEBKIT_DISABLE_DMABUF_RENDERER: '1' }),
    'WEBKIT_DISABLE_DMABUF_RENDERER=1',
  );
  assert.throws(() => renderModeEnv({ A: '$(kötü)' }), /meta/);
  assert.throws(() => renderModeEnv({ 'KÖTÜ-AD': '1' }), /Geçersiz/);
  for (const value of [
    '1; touch injected',
    '1\nINJECTED=1',
    '1 #comment',
    '1 >output',
    '1\tother',
  ]) {
    assert.throws(() => renderModeEnv({ VOL_DECK_MEASURE: value }));
  }
  assert.throws(() => renderModeEnv({ UNKNOWN_MEASURE_FLAG: '1' }));
});

test('scenario ve seed yalniz sinirli deterministik degerleri kabul eder', () => {
  assert.equal(
    renderModeEnv({ VOL_DECK_SCENARIO: '20', VOL_DECK_SEED: '4294967295' }),
    'VOL_DECK_SCENARIO=20\nVOL_DECK_SEED=4294967295',
  );
  assert.equal(renderModeEnv({ VOL_DECK_SCENARIO: '40' }), 'VOL_DECK_SCENARIO=40');
  for (const value of ['1', '50', '-1', '20;bad'])
    assert.throws(() => renderModeEnv({ VOL_DECK_SCENARIO: value }));
  for (const value of ['4294967296', '-1', '1.5', 'NaN'])
    assert.throws(() => renderModeEnv({ VOL_DECK_SEED: value }));
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
      phase: 'oyun',
      window: 0,
      fps: 59.9,
      p95: 17.2,
      over20ms: 2,
      over34ms: 0,
    }),
    JSON.stringify({
      src: 'js',
      type: 'perf',
      phase: 'oyun',
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

test('yeni release eski AppDir, launcher, ortam ve kullanici kaydini korur', () => {
  inDisk((disk) => {
    const target = join(disk, "upload with 'quotes; spaces");
    const source = join(disk, 'build');
    mkdirSync(target);
    mkdirSync(source);
    for (const file of ['AppRun', 'run.sh', 'mode.env', 'store.json', 'diagnostics.jsonl']) {
      writeFileSync(join(target, file), `previous ${file}`);
    }
    writeFileSync(join(source, 'AppRun'), 'new binary');
    const before = JSON.parse(remote(shellInventory(target)));
    // `releaseDirectory` devkit kökünü ister: mutlak POSIX yol. Sözleşme Linux
    // yolunu konuşur; yerel diskte yalnız PATH dışında kalan bir kök kullanılır.
    const releaseRoot = '/home/deck/devkit-game/upload';
    const release = releaseDirectory(releaseRoot, '2026-09-27-unique');
    assert.notEqual(release, releaseRoot);
    const localRelease = join(disk, '.vol-release-2026-09-27-unique');
    mkdirSync(localRelease);
    cpSync(source, localRelease, { recursive: true });
    const after = JSON.parse(remote(shellInventory(target, release.split('/').at(-1))));
    assertInventoryPreserved(before, after);
    assert.equal(readFileSync(join(target, 'AppRun'), 'utf8'), 'previous AppRun');
    assert.equal(readFileSync(join(localRelease, 'AppRun'), 'utf8'), 'new binary');
    assert.throws(() => releaseDirectory('/', 'ok'));
    assert.throws(() => releaseDirectory(releaseRoot, '../escape'));
    assert.throws(() => releaseDirectory(target, 'ok'));
  });
});

test('log byte siniri UTF-8 ve yarim satirda onceki kaniti korur', () => {
  inDisk((disk) => {
    const path = join(disk, "log 'quoted'.jsonl");
    const old = '{"type":"info","text":"önceki"}\n{"partial":';
    writeFileSync(path, old);
    const baseline = JSON.parse(remote(shellLogRead(path)));
    assert.equal(Buffer.from(baseline.dataBase64, 'base64').toString(), old);
    const full = `${old}true}\n{"type":"signal","signal":15}\n`;
    writeFileSync(path, full);
    const tail = JSON.parse(remote(shellLogRead(path, baseline)));
    assert.equal(
      Buffer.from(tail.dataBase64, 'base64').toString(),
      '{"type":"signal","signal":15}\n',
    );
    assert.equal(readFileSync(path, 'utf8'), full);
    writeFileSync(path, 'replacement\n');
    assert.throws(() => remote(shellLogRead(path, baseline)));
  });
});

test('ortam yazma atomik ve kullanicinin onceki kopyasi korunabilir', () => {
  inDisk((disk) => {
    const path = join(disk, "mode 'quotes'.env");
    writeFileSync(path, 'VOL_DECK_MEASURE=0\n');
    const previous = readFileSync(path);
    writeFileSync(join(disk, 'previous.env'), previous, { flag: 'wx', mode: 0o600 });
    remote(shellAtomicWrite(path, 'VOL_DECK_MEASURE=1\n', 'unique'));
    assert.equal(readFileSync(path, 'utf8'), 'VOL_DECK_MEASURE=1\n');
    assert.deepEqual(readFileSync(join(disk, 'previous.env')), previous);
    assert.equal(
      remote(`printf '%s' ${shellQuote("$(touch injected); \nquoted'")}`),
      "$(touch injected); \nquoted'",
    );
  });
});

test('paylasilan kayit izin listesi disindaki kimlik ve metni tasimaz', () => {
  const raw = [
    {
      type: 'info',
      env: {
        HOME: '/private/user',
        SteamAppId: '123',
        TOKEN: 'SECRET',
        WEBKIT_FORCE_VBLANK_TIMER: '1',
      },
    },
    { type: 'pad-connected', id: 'device-serial-SECRET', mapping: 'standard' },
    { type: 'steamworks', available: true, appId: 123, deck: true, manifestOk: true },
    { type: 'haptics', backend: 'hidraw', lastError: 'personal path SECRET', device: 'SECRET' },
    { type: 'error', message: 'personal typed text SECRET' },
    { type: 'perf', phase: 'oyun', fps: 60, p95: 17, enemies: 20, window: 3 },
  ]
    .map(JSON.stringify)
    .join('\n');
  const sanitized = sanitizeReport(raw);
  assert.doesNotMatch(sanitized, /SECRET|private|SteamAppId|appId|device-serial|typed text/);
  const records = sanitized.split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(records.find((record) => record.type === 'perf').enemies, 20);
  assert.equal(records.find((record) => record.type === 'haptics').backend, 'hidraw');
});

test('kare penceresi baglami ve izinli sayisal yuk metrikleri raporda kalir', () => {
  const line = JSON.stringify({
    type: 'perf',
    phase: 'loading',
    start: 100,
    end: 200,
    p99: 23,
    quality: 'low',
    scenario: 'sandbox',
    seed: 731,
    weather: 'rain',
    season: 'spring',
    metrics: {
      enemies: { min: 10, max: 20, avg: 15, samples: 30 },
      updateMs: { min: 1, max: 5, avg: 3, samples: 30 },
      'cpuMs.simulation': { min: 1, max: 4, avg: 2, samples: 30 },
      scenarioEnemies: { min: 10, max: 20, avg: 15, samples: 30 },
      scenarioSeed: { min: 42, max: 42, avg: 42, samples: 30 },
      SteamAppId: { min: 123, max: 123 },
    },
  });
  const record = JSON.parse(sanitizeReport(line));
  assert.equal(record.phase, 'loading');
  assert.equal(record.scenario, 'sandbox');
  assert.equal(record.quality, 'low');
  assert.equal(record.weather, 'rain');
  assert.equal(record.season, 'spring');
  assert.equal(record.seed, 731);
  assert.equal(record.metrics['cpuMs.simulation'].avg, 2);
  assert.deepEqual(record.metrics.enemies, { min: 10, max: 20, avg: 15, samples: 30 });
  assert.deepEqual(record.metrics.updateMs, { min: 1, max: 5, avg: 3, samples: 30 });
  assert.equal(record.metrics.scenarioEnemies.avg, 15);
  assert.equal(record.metrics.scenarioSeed.avg, 42);
  assert.equal(record.metrics.SteamAppId, undefined);
  const summary = summarizeReport([JSON.stringify(record)]);
  assert.equal(summary.phases[0].scenario, 'sandbox');
  assert.equal(summary.phases[0].quality, 'low');
  assert.equal(summary.phases[0].p99, 23);
  assert.equal(summary.phases[0].start, 100);
  assert.deepEqual(summary.phases[0].metrics.enemies, record.metrics.enemies);
  const background = JSON.parse(
    sanitizeReport(
      JSON.stringify({
        type: 'perf',
        phase: 'background',
        context: 'background',
        metrics: { enemies: { avg: 0, samples: 2, max: null, type: 'private-user' } },
      }),
    ),
  );
  assert.equal(background.phase, 'background');
  assert.equal(background.context, 'background');
  assert.deepEqual(background.metrics.enemies, { avg: 0, samples: 2 });
});

test('ayrı oyun oturumları aynı pencere numarasıyla kaybolmaz; yavaş kare ve yüzdelikler korunur', () => {
  const runIds = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const records = runIds.map((runId) =>
    sanitizeReport(
      JSON.stringify({
        type: 'perf',
        runId,
        window: 1,
        phase: 'gameplay',
        lostReports: 2,
        metrics: {
          updateMs: { p50: 2, p95: 8, p99: 9 },
          vehicles: { avg: 4 },
          'simulation.rawDeltaMs': { max: 5000 },
        },
        slowestFrame: { at: 80, intervalMs: 44, metrics: { updateMs: 8, private: 99 } },
        gpuTimeMs: null,
        presentTimeMs: null,
      }),
    ),
  );
  const summary = summarizeReport(records);
  assert.equal(summary.phases.length, 2);
  assert.equal(summary.phases[0].runId, runIds[0]);
  assert.equal(summary.phases[0].lostReports, 2);
  assert.equal(summary.phases[0].metrics.updateMs.p95, 8);
  assert.equal(summary.phases[0].metrics.vehicles.avg, 4);
  assert.equal(summary.phases[0].metrics['simulation.rawDeltaMs'].max, 5000);
  assert.deepEqual(summary.phases[0].slowestFrame, {
    at: 80,
    intervalMs: 44,
    metrics: { updateMs: 8 },
  });
  assert.equal(JSON.parse(records[0]).gpuTimeMs, null);
  assert.equal(JSON.parse(records[0]).presentTimeMs, null);
  assert.equal(
    JSON.parse(sanitizeReport(JSON.stringify({ type: 'perf', runId: 'private-SECRET' }))).runId,
    undefined,
  );
});

test('touchpad kisayol raporu yalniz sabit siniflari ve boolean alanlari tasir', () => {
  const event = JSON.stringify({
    v: 1,
    type: 'deck-shortcut',
    shortcut: 'undo',
    target: 'editable',
    phase: 'gameplay',
    trusted: true,
    repeat: false,
    rawKey: 'private-secret',
    text: 'private-secret',
  });
  assert.deepEqual(JSON.parse(sanitizeReport(event)), {
    v: 1,
    type: 'deck-shortcut',
    shortcut: 'undo',
    target: 'editable',
    phase: 'gameplay',
    trusted: true,
    repeat: false,
  });
  const invalid = JSON.parse(
    sanitizeReport(
      JSON.stringify({
        type: 'deck-shortcut',
        shortcut: 'private-secret',
        target: 'private-secret',
      }),
    ),
  );
  assert.equal(invalid.shortcut, undefined);
  assert.equal(invalid.target, undefined);
});

test('silme acik oyun kimligi onayi olmadan reddedilir', () => {
  assert.throws(() => assertCleanConfirmation('vol_deck_probe', undefined), /onay/);
  assert.throws(() => assertCleanConfirmation('vol_deck_probe', 'other'), /onay/);
  assert.doesNotThrow(() => assertCleanConfirmation('vol_deck_probe', 'vol_deck_probe'));
});

test('rsync kendi yeni release dizinine korumali argumanlarla silmeden kopyalar', () => {
  const args = buildRsyncArgs({
    host: 'example.test',
    key: "/private/key with 'quotes'",
    source: '/build dir',
    directory: '/upload/.vol-release-unique',
  });
  assert.ok(!args.includes('--delete'));
  assert.ok(args.includes('--protect-args'));
  assert.equal(args.at(-2), '/build dir/');
  assert.equal(args.at(-1), 'deck@example.test:/upload/.vol-release-unique/');
  assert.throws(() =>
    buildRsyncArgs({ host: 'host;bad', key: '/key', source: '/build', directory: '/upload' }),
  );
});

test('clean CLI onaysizken SSH dahil hicbir uzak islem baslatmaz', () => {
  inDisk((disk) => {
    const bin = join(disk, 'bin');
    const marker = join(disk, 'ssh-called');
    mkdirSync(bin);
    writeCommand(bin, 'getent', '#!/bin/sh\nprintf "fake host\\n"\n');
    writeFileSync(join(bin, 'ssh'), `#!/bin/sh\nprintf called > ${shellQuote(marker)}\n`, {
      mode: 0o755,
    });
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '../scripts/deck.mjs'), 'clean', 'devtools/deck'],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DECK_HOST: 'example.test' },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /onay/);
    assert.equal(existsSync(marker), false);
  });
});

test('release hazirligi eski dosyalari ve oturum sentinelini korur', () => {
  inDisk((disk) => {
    mkdirSync(join(disk, '.config'));
    mkdirSync(join(disk, 'devkit-game', 'old_game'), { recursive: true });
    const sentinel = join(disk, '.config', 'inhibit-short-session-tracker');
    writeFileSync(sentinel, 'previous setting');
    writeFileSync(join(disk, 'devkit-game', 'old_game', 'AppRun'), 'old binary');
    // Windows yolu kabuk değişken atamasına gömülürken `\` kaçış karakteridir.
    const command = `HOME=${shellQuote(shellPath(disk))} ${renderPrepareReleaseCommand('new_game_unique')}`;
    const result = JSON.parse(remote(command));
    // Komut `HOME` değerini olduğu gibi yankılar; devkit yolları daima POSIX'tir.
    assert.equal(result.directory, shellPath(join(disk, 'devkit-game', 'new_game_unique')));
    assert.equal(existsSync(sentinel), true);
    assert.equal(readFileSync(sentinel, 'utf8'), 'previous setting');
    assert.equal(
      readFileSync(join(disk, 'devkit-game', 'old_game', 'AppRun'), 'utf8'),
      'old binary',
    );
    assert.throws(() => remote(command));
  });
});

test('release SIGTERM ayni urunun eski surecine ulasmaz', async (t) => {
  // SIGTERM gönderme `/proc` taramasıyla Linux'a özgüdür; Windows'ta süreç
  // sinyali farklı çalışır ve bu sözleşme orada ölçülemez.
  if (isWindows) {
    t.skip('SIGTERM gönderme /proc taraması gerektirir; Linux sözleşmesidir');
    return;
  }
  const disk = mkdtempSync(join(tmpdir(), 'vol-deck-process-'));
  const oldDirectory = join(disk, 'old');
  const newDirectory = join(disk, 'new');
  mkdirSync(oldDirectory);
  mkdirSync(newDirectory);
  // `/usr/bin/sleep` yalnız POSIX'te vardır; testin amacı aynı adlı iki
  // sürecin ayrı kalması olduğu için platformun kendi kalıcı komutu kopyalanır.
// Windows kopyalanmış bir `.exe`yi doğrudan başlatamaz (yan yükleme/izin),
  // bu yüzden kabuk üzerinden `shell: true` ile çalıştırılır.
  const sleeper = isWindows
    ? join(process.env.SystemRoot, 'System32', 'ping.exe')
    : '/usr/bin/sleep';
  cpSync(sleeper, join(oldDirectory, 'same-game'));
  cpSync(sleeper, join(newDirectory, 'same-game'));
  const sleepArgs = isWindows ? ['-n', '30', '127.0.0.1'] : ['30'];
  const oldProcess = spawn(`"${join(oldDirectory, 'same-game')}"`, sleepArgs, { shell: isWindows });
  const newProcess = spawn(`"${join(newDirectory, 'same-game')}"`, sleepArgs, { shell: isWindows });
  const oldExit = once(oldProcess, 'exit');
  const newExit = once(newProcess, 'exit');
  try {
    await Promise.all([once(oldProcess, 'spawn'), once(newProcess, 'spawn')]);
    // `renderReleaseStopCommand` devkit kökünü ister: mutlak POSIX yol. Sözleşme
    // Linux yolunu konuşur; yerel süreçler geçici diskte tutulur.
    remote(shellReleaseStop('/home/deck/devkit-game/new'));
    const [, signal] = await newExit;
    assert.equal(signal, 'SIGTERM');
    assert.equal(oldProcess.exitCode, null);
    assert.equal(oldProcess.signalCode, null);
  } finally {
    oldProcess.kill('SIGTERM');
    newProcess.kill('SIGTERM');
    await Promise.all([oldExit, newExit]);
    rmSync(disk, { recursive: true, force: true });
  }
});
