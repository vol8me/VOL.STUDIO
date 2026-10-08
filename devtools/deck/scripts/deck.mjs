#!/usr/bin/env node
/**
 * Steam Deck devkit otomasyonu — KAPI DEĞİLDİR, referans ölçümdür.
 * Cihaz her zaman bağlı değildir; çıktı `devtools/deck/records/` altına
 * sürümlü kayıt olarak yazılır (depoya girmez).
 *
 *   pnpm deck <komut> [seçenekler]
 *
 *   discover                      Deck'i bulur (→ --host / DECK_HOST / mDNS / Avahi)
 *   deploy   <workspace> [--appdir <AppDir>]  Yeni release yükler (--appdir: HOST derlemesi, SLR4 değil)
 *   run      <workspace> [--release=<kayıt>]  Seçilen kısayolu başlatır
 *   stop     <workspace> [--release=<kayıt>] Seçilen sürece SIGTERM gönderir
 *   log      <workspace>          diagnostics.jsonl kaydını yazdırır
 *   shot     <ad>                 gamescopectl ekran görüntüsü → devtools/deck/records/
 *   power    [saniye]             Güç sayaçları örneği (RAPL enerjisi + hwmon)
 *   measure  <workspace> <etiket> [--until <işaret>] [--seconds <n>]
 *                                   run → bekle → rapor+güç+görüntü → kayıt
 *                                   (varsayılan işaret prob fazı; oyunda
 *                                   --seconds ya da kendi işareti)
 *   mode     <workspace> A=B ...  Bir sonraki run'da etkili ortam dosyası yazar
 *   clean    <workspace> --confirm-delete=<gameid>  Açık kimlik onayıyla siler
 *   full     <workspace> <etiket> [--seconds <n>] build → yeni release mode → measure
 *
 * Ortam: DECK_HOST, DECK_SSH_KEY (varsayılan ~/.config/steamos-devkit/devkit_rsa)
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  assertCleanConfirmation,
  assertInventoryPreserved,
  buildReleaseShortcutParms,
  buildRsyncArgs,
  fullMeasurementPlan,
  validateMeasureSeconds,
  HWMON_FIELDS,
  hwmonByName,
  parseAvahiBrowse,
  POWER_COUNTERS,
  hwmonWatts,
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
  shortcutRegistrationSucceeded,
  shellQuote,
  toDeckGameId,
} from './deck-contract.mjs';
import { loadRepoLifecycle } from '../../../scripts/quality/workspaceLifecycle.mjs';
import { appImageAppDir, steamrt4TargetDir } from '../../../scripts/linux/targets.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const RECORDS = join(ROOT, 'devtools', 'deck', 'records');
const SSH_KEY =
  process.env.DECK_SSH_KEY ?? join(homedir(), '.config', 'steamos-devkit', 'devkit_rsa');
const SSH_OPTS = ['-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8'];

function usage() {
  console.error(
    readFileSync(new URL(import.meta.url), 'utf8')
      .split('\n')
      .slice(1, 24)
      .join('\n'),
  );
  process.exit(2);
}

function runOut(command, args, opts = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...opts,
  }).trim();
}

function optional(command, args) {
  try {
    return runOut(command, args);
  } catch {
    return null;
  }
}

/* ---------- keşif ---------- */

function discoverHost(cliHost) {
  const getent = optional('getent', ['hosts', 'steamdeck.local']);
  const avahi = getent
    ? null
    : parseAvahiBrowse(
        optional('avahi-browse', ['-rtp', '--no-db-lookup', '_steamos-devkit._tcp']) ?? '',
      );
  const resolved = resolveDeckHost({
    cli: cliHost,
    env: process.env.DECK_HOST,
    getent: getent ? 'steamdeck.local' : null,
    avahi,
  });
  if (!resolved) {
    throw new Error(
      'Deck bulunamadı: --host ya da DECK_HOST verin, ya da cihazı devkit ağında açın.',
    );
  }
  return resolved;
}

function ssh(host, remote, { quiet = false } = {}) {
  return runOut('ssh', [...SSH_OPTS, `deck@${host}`, remote], {
    stdio: quiet ? ['ignore', 'pipe', 'ignore'] : undefined,
  });
}

function recordDirectory(label) {
  const safe =
    String(label)
      .replaceAll(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 80) || 'record';
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  const parent = join(RECORDS, stamp.slice(0, 10));
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = join(parent, `${safe}-${stamp}-${randomUUID()}`);
  mkdirSync(directory, { mode: 0o700 });
  return directory;
}

function privateFile(path, data) {
  writeFileSync(path, data, { flag: 'wx', mode: 0o600 });
}

/** @param {string} host @param {string} path @param {{ size: number, sha256: string, endsWithNewline: boolean } | null} [baseline] */
function readLog(host, path, baseline = null) {
  return JSON.parse(ssh(host, renderLogReadCommand(path, baseline), { quiet: true }));
}

function readDeployment(workspace, baseGameid, records) {
  if (!records) return null;
  let deployment;
  try {
    deployment = JSON.parse(
      readFileSync(join(resolve(records), 'deployment.private.json'), 'utf8'),
    );
  } catch {
    throw new Error('Release kaydı okunamadı');
  }
  if (deployment.workspace !== workspace || deployment.baseGameid !== baseGameid) {
    throw new Error('Release kaydı seçilen workspace ile eşleşmiyor');
  }
  buildReleaseShortcutParms({ gameid: deployment.gameid, release: deployment.directory });
  releaseDirectory(deployment.directory, 'validation');
  return deployment;
}

/* ---------- workspace çözümü ---------- */

function readShell(root, workspace) {
  if (
    typeof workspace !== 'string' ||
    workspace.startsWith('/') ||
    workspace.split('/').includes('..')
  ) {
    throw new Error('Workspace depo içindeki göreli paket yolu olmalı');
  }
  const dir = join(root, workspace);
  const confPath = join(dir, 'src-tauri', 'tauri.conf.json');
  if (!existsSync(confPath)) {
    throw new Error(`${workspace}: src-tauri/tauri.conf.json yok — Tauri kabuğu değil.`);
  }
  // Donmuş ürünler ölçüm adayı değildir: kısayol ve yükleme rutin iş değildir.
  const record = loadRepoLifecycle(root)?.workspaces.find((w) => w.path === workspace);
  if (record?.status === 'frozen') {
    throw new Error(
      `${workspace} frozen (${record.freezeTag}) — Deck ölçümü rutin adaylara uygulanır.`,
    );
  }
  if (record?.status !== 'active') throw new Error('Workspace lifecycle içinde active olmalı');
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  if (!/^[A-Za-z0-9_.-]+$/.test(conf.identifier))
    throw new Error('Kabuk kimliği güvenli dosya adı değil');
  const productName = conf.productName;
  return {
    dir,
    productName,
    identifier: conf.identifier,
    gameid: toDeckGameId(productName),
    appDir: appImageAppDir(steamrt4TargetDir(ROOT), productName),
    remoteLog: `~/.local/share/${conf.identifier}/diagnostics.jsonl`,
  };
}

/* ---------- komutlar ---------- */

function cmdDiscover(argv) {
  const idx = argv.indexOf('--host');
  const { host, via } = discoverHost(idx >= 0 ? argv[idx + 1] : undefined);
  console.log(`${host}  (${via})`);
}

/**
 * @param {string} root @param {string} workspace @param {string} host
 * @param {{ compat?: string, appdir?: string }} [options]
 */
function cmdDeploy(root, workspace, host, { compat, appdir } = {}) {
  const shell = readShell(root, workspace);
  if (appdir) shell.appDir = resolve(appdir);
  if (!existsSync(shell.appDir)) {
    throw new Error(
      `${shell.appDir} yok — önce derleyin: node scripts/linux/build-steamrt4.mjs ${workspace}`,
    );
  }

  const records = recordDirectory('deploy');
  const gameid = `${shell.gameid}_${randomUUID().replaceAll('-', '')}`;
  const prepJson = ssh(host, renderPrepareReleaseCommand(gameid), { quiet: true });
  const { directory: previousDirectory } = JSON.parse(prepJson);
  const release = `${new Date().toISOString().replaceAll(/[^A-Za-z0-9]/g, '-')}-${randomUUID()}`;
  const directory = releaseDirectory(previousDirectory, release);
  const before = JSON.parse(ssh(host, renderInventoryCommand(previousDirectory), { quiet: true }));
  privateFile(join(records, 'inventory-before.private.json'), JSON.stringify(before));
  privateFile(
    join(records, 'release.private.json'),
    JSON.stringify({ previousDirectory, directory }),
  );
  ssh(host, `mkdir -- ${shellQuote(directory)}`, { quiet: true });

  execFileSync('rsync', buildRsyncArgs({ host, key: SSH_KEY, source: shell.appDir, directory }), {
    stdio: 'inherit',
  });

  ssh(host, renderAtomicWriteCommand(`${directory}/run.sh`, renderLauncher(gameid), randomUUID()), {
    quiet: true,
  });
  ssh(
    host,
    `chmod +x -- ${shellQuote(`${directory}/run.sh`)} ${shellQuote(`${directory}/AppRun`)}`,
    { quiet: true },
  );
  const after = JSON.parse(
    ssh(host, renderInventoryCommand(previousDirectory, directory.split('/').at(-1)), {
      quiet: true,
    }),
  );
  privateFile(join(records, 'inventory-after.private.json'), JSON.stringify(after));
  assertInventoryPreserved(before, after);

  const parms = buildReleaseShortcutParms({
    gameid,
    release: directory,
    // Valve'in kısayol aracı `settings.compat_tool` anahtarını ZORUNLU okur (yoksa KeyError);
    // yerel Linux çalışmasında (`steam_play: 0`) değer boş bırakılır ve yok sayılır.
    settings: { compat_tool: compat ?? '' },
  });
  const out = ssh(
    host,
    `python3 ~/devkit-utils/steam-client-create-shortcut --parms ${shellQuote(
      JSON.stringify(parms),
    )}`,
    { quiet: true },
  );
  privateFile(join(records, 'shortcut-result.private.txt'), out);
  let result;
  try {
    result = JSON.parse(out);
  } catch {
    throw new Error('Kısayol yanıtı JSON değil; mevcut kısayol korunuyor');
  }
  if (!shortcutRegistrationSucceeded(result))
    throw new Error('Yeni kısayol kaydedilemedi; mevcut kısayol korunuyor');
  privateFile(
    join(records, 'deployment.private.json'),
    JSON.stringify({
      baseGameid: shell.gameid,
      gameid,
      directory,
      workspace,
      // Kabuk sahibi ortamı: steamrt4 kabı mı, host derlemesi mi (ölçüm raporu bunu taşır).
      build: appdir ? 'host' : 'steamrt4',
    }),
  );
  console.log(`[deploy] ${shell.gameid}: ayrı yeni kısayol kaydedildi; mevcut kısayol korundu`);
  console.log(`[deploy] kayıt: ${relative(ROOT, records)}`);
  return { directory, gameid, records };
}

function cmdRun(root, workspace, host, records) {
  const shell = readShell(root, workspace);
  const gameid = readDeployment(workspace, shell.gameid, records)?.gameid ?? shell.gameid;
  ssh(host, `python3 ~/devkit-utils/steam-devkit-rpc run-game ${shellQuote(`gameid=${gameid}`)}`, {
    quiet: true,
  });
  console.log(`[run] ${gameid} başlatma isteği gönderildi`);
}

function cmdStop(root, workspace, host, records) {
  const { productName, gameid } = readShell(root, workspace);
  const deployment = readDeployment(workspace, gameid, records);
  if (deployment) {
    ssh(host, renderReleaseStopCommand(deployment.directory), { quiet: true });
  } else {
    ssh(host, `pkill -TERM -x -- ${shellQuote(productName)} || true`, { quiet: true });
  }
  console.log(`[stop] ${productName} için SIGTERM gönderildi`);
}

function cmdLog(root, workspace, host) {
  const { remoteLog } = readShell(root, workspace);
  try {
    const log = readLog(host, remoteLog);
    process.stdout.write(sanitizeReport(Buffer.from(log.dataBase64, 'base64').toString('utf8')));
  } catch {
    console.log(`[log] ${remoteLog} henüz yok — sonda hiç koşmadı mı?`);
  }
}

function cmdShot(host, name) {
  const dir = recordDirectory(`shot-${name}`);
  const remote = `/tmp/vol-shot-${randomUUID()}.png`;
  ssh(host, `gamescopectl screenshot ${shellQuote(remote)} >/dev/null 2>&1 && sleep 1`, {
    quiet: true,
  });
  const local = join(dir, 'screen.png');
  const bytes = execFileSync('ssh', [...SSH_OPTS, `deck@${host}`, `cat -- ${shellQuote(remote)}`], {
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  privateFile(local, bytes);
  privateFile(join(dir, 'remote-path.private.txt'), remote);
  console.log(`[shot] ${relative(ROOT, local)}`);
  return local;
}

/** Uzaktan tek örnek: isimle bulunan hwmon alanları (µW) + pil sayaçları. */
function powerSample(host, seconds = 8) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    throw new Error('Güç penceresi 0–600 saniye arasında olmalı');
  const scan = ssh(
    host,
    'for h in /sys/class/hwmon/hwmon*; do echo "$h $(cat $h/name 2>/dev/null)"; done',
    { quiet: true },
  );
  const reads = [];
  for (const [name, fields] of Object.entries(HWMON_FIELDS)) {
    const node = hwmonByName(scan, name);
    if (!node || !/^\/sys\/class\/hwmon\/hwmon\d+$/.test(node)) continue;
    for (const field of fields) reads.push(`${name}.${field}=${node}/${field}`);
  }
  const script = `
t0=$(date +%s%3N)
sleep ${seconds}
t1=$(date +%s%3N)
echo "t0=$t0 t1=$t1"
for kv in ${reads.join(' ')}; do
  name=\${kv%%=*}; path=\${kv#*=}
  echo "$name=$(cat $path 2>/dev/null || echo -)"
done
echo "bat.status=$(cat ${POWER_COUNTERS.batteryStatus} 2>/dev/null || echo -)"
echo "bat.charge_uah=$(cat ${POWER_COUNTERS.batteryChargeUah} 2>/dev/null || echo -)"
echo "bat.current_ua=$(cat ${POWER_COUNTERS.batteryCurrentUa} 2>/dev/null || echo -)"
echo "bat.voltage_uv=$(cat ${POWER_COUNTERS.batteryVoltageUv} 2>/dev/null || echo -)"
`;
  const raw = ssh(host, script, { quiet: true });
  const entries = Object.fromEntries(
    raw
      .split('\n')
      .flatMap((line) => line.trim().split(/\s+/))
      .filter((kv) => kv.includes('='))
      .map((kv) => {
        const idx = kv.indexOf('=');
        return [kv.slice(0, idx), kv.slice(idx + 1)];
      }),
  );
  // amdgpu power1_average = APU paket gücü (µW); pil tarafı current×voltage.
  const packageW = hwmonWatts(entries['amdgpu.power1_average']);
  const batteryW = (() => {
    const ua = Number(entries['bat.current_ua']);
    const uv = Number(entries['bat.voltage_uv']);
    return ua > 0 && uv > 0 ? Math.round(((ua * uv) / 1e12) * 100) / 100 : null;
  })();
  return { seconds, packageW, batteryW, raw: entries };
}

function cmdPower(host, seconds) {
  const sample = powerSample(host, seconds);
  console.log(
    `[power] APU paketi ${sample.packageW ?? '?'} W, pil ${
      sample.batteryW ?? '?'
    } W (${seconds}s pencere)`,
  );
  for (const [key, value] of Object.entries(sample.raw)) {
    if (!/^(t0|t1|rapl)/.test(key)) console.log(`  ${key} = ${value}`);
  }
  return sample;
}

function cmdMode(root, workspace, host, pairs, records) {
  const shell = readShell(root, workspace);
  const gameid = readDeployment(workspace, shell.gameid, records)?.gameid ?? shell.gameid;
  const entries = Object.fromEntries(
    pairs.map((pair) => {
      const idx = pair.indexOf('=');
      if (idx <= 0) throw new Error(`mode girdisi KEY=VALUE olmalı: ${pair}`);
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    }),
  );
  const body = renderModeEnv(entries);
  const path = `~/.vol-studio/deck/${gameid}.env`;
  const previous = readLog(host, path);
  const bytes = Buffer.from(previous.dataBase64, 'base64');
  if (previous.exists && bytes.toString('utf8') === `${body}\n`) {
    console.log(`[mode] ${gameid}: ortam zaten aynı`);
    return;
  }
  const modeRecords = recordDirectory('mode');
  privateFile(join(modeRecords, 'previous-mode.private.env'), bytes);
  privateFile(
    join(modeRecords, 'previous-mode.private.json'),
    JSON.stringify({ exists: previous.exists, sha256: previous.sha256 }),
  );
  ssh(host, renderAtomicWriteCommand(path, `${body}\n`, randomUUID()), { quiet: true });
  console.log(`[mode] ${gameid}: izinli ölçüm ortamı atomik yazıldı; önceki kopya korundu`);
}

function cmdClean(root, workspace, host, confirmation) {
  const { gameid } = readShell(root, workspace);
  assertCleanConfirmation(gameid, confirmation);
  ssh(host, `python3 ~/devkit-utils/steamos-delete --delete-title ${shellQuote(gameid)}`, {
    quiet: true,
  });
  console.log(`[clean] ${gameid} silindi`);
}

async function cmdMeasure(root, workspace, host, label, opts = {}) {
  const shell = readShell(root, workspace);
  const { gameid, remoteLog } = shell;
  validateMeasureSeconds(opts.seconds);
  const dir = recordDirectory(label);
  const original = readLog(host, remoteLog);
  privateFile(join(dir, 'previous-log.private.jsonl'), Buffer.from(original.dataBase64, 'base64'));
  const baseline = {
    size: original.size,
    sha256: original.sha256,
    endsWithNewline: original.endsWithNewline,
  };
  privateFile(join(dir, 'log-boundary.private.json'), JSON.stringify(baseline));
  cmdRun(root, workspace, host, opts.release);
  const powerBefore = powerSample(host, 2);

  // İki bekleme kipi: işaret (`--until`, sondanın kendini bitiren fazları) ya
  // da duvar saati (`--seconds`, gerçek oyun turu — oyun kendini durdurmaz).
  // İşaret varsayılanı prob sözleşmesidir: son ölçülen fazın kaydı.
  const catLog = () =>
    Buffer.from(readLog(host, remoteLog, baseline).dataBase64, 'base64').toString('utf8');
  let lines = '';
  if (opts.seconds) {
    const deadline = Date.now() + opts.seconds * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      lines = catLog();
    }
  } else {
    const marker = opts.until ?? '"phase":"4000 sprite"';
    const deadline = Date.now() + 150_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      lines = catLog();
      if (lines.includes(marker)) break;
    }
  }
  const powerAfter = powerSample(host, 2);

  // Görüntü oyun açıkken alınır; sonra SIGTERM gönderilir ve son kayıt
  // sinyal/flush satırlarını da içerir (Steam "Quit Game" yolunun kanıtı).
  const shot = cmdShot(host, label);
  cmdStop(root, workspace, host, opts.release);
  await new Promise((r) => setTimeout(r, 2000));
  const finalLines = catLog();
  if (finalLines.length >= lines.length) lines = finalLines;

  privateFile(join(dir, 'new-log.private.jsonl'), lines);
  const sharedLines = sanitizeReport(lines);
  privateFile(join(dir, 'report.jsonl'), sharedLines);
  const summary = {
    v: 1,
    label: String(label)
      .replaceAll(/[^A-Za-z0-9_-]/g, '_')
      .slice(0, 80),
    workspace,
    gameid,
    measuredAt: new Date().toISOString(),
    kernel: optional('ssh', [...SSH_OPTS, `deck@${host}`, 'uname -r']),
    ...summarizeReport(sharedLines.split('\n')),
    power: { before: powerBefore, after: powerAfter },
  };
  privateFile(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  if (summary.phases.length === 0)
    throw new Error('Yeni kare ölçümü gelmedi; özel ham kayıtlar korundu');

  console.log(`[measure] kayıt: ${relative(ROOT, dir)}`);
  console.log(`[measure] fazlar:`);
  for (const p of summary.phases) {
    console.log(
      `  ${p.phase}: ${p.fps} FPS p95=${p.p95}ms >20ms:${p.over20ms} >34ms:${p.over34ms}`,
    );
  }
  return { dir, shot, summary };
}

/* ---------- ana ---------- */

const [command, ...rest] = process.argv.slice(2);
if (!command) usage();

const cleanConfirmation = rest
  .find((arg) => arg.startsWith('--confirm-delete='))
  ?.slice('--confirm-delete='.length);
if (command === 'clean') {
  try {
    assertCleanConfirmation(readShell(ROOT, rest[0]).gameid, cleanConfirmation);
  } catch (error) {
    console.error(`[deck] ${error.message}`);
    process.exit(1);
  }
}

const hostFlag = rest.indexOf('--host');
const releaseFlag = rest.indexOf('--release');
const releaseRecords =
  rest.find((arg) => arg.startsWith('--release='))?.slice('--release='.length) ??
  (releaseFlag >= 0 ? rest[releaseFlag + 1] : undefined);
const host = discoverHost(hostFlag >= 0 ? rest[hostFlag + 1] : undefined).host;
const positional = rest.filter(
  (arg, i) =>
    (hostFlag < 0 || (i !== hostFlag && i !== hostFlag + 1)) &&
    (releaseFlag < 0 || (i !== releaseFlag && i !== releaseFlag + 1)) &&
    !arg.startsWith('--release=') &&
    !arg.startsWith('--confirm-delete='),
);

try {
  switch (command) {
    case 'discover':
      cmdDiscover(rest);
      break;
    case 'deploy':
      cmdDeploy(ROOT, positional[0], host, {
        compat: positional.includes('--compat')
          ? positional[positional.indexOf('--compat') + 1]
          : undefined,
        appdir: positional.includes('--appdir')
          ? positional[positional.indexOf('--appdir') + 1]
          : undefined,
      });
      break;
    case 'run':
      cmdRun(ROOT, positional[0], host, releaseRecords);
      break;
    case 'stop':
      cmdStop(ROOT, positional[0], host, releaseRecords);
      break;
    case 'log':
      cmdLog(ROOT, positional[0], host);
      break;
    case 'shot':
      cmdShot(host, positional[0] ?? 'now');
      break;
    case 'power':
      cmdPower(host, Number(positional[0] ?? 8));
      break;
    case 'measure': {
      const untilIdx = positional.indexOf('--until');
      const secIdx = positional.indexOf('--seconds');
      await cmdMeasure(ROOT, positional[0], host, positional[1] ?? 'measure', {
        until: untilIdx >= 0 ? positional[untilIdx + 1] : undefined,
        seconds: secIdx >= 0 ? Number(positional[secIdx + 1]) : undefined,
        release: releaseRecords,
      });
      break;
    }
    case 'mode':
      cmdMode(ROOT, positional[0], host, positional.slice(1), releaseRecords);
      break;
    case 'clean':
      cmdClean(ROOT, positional[0], host, cleanConfirmation);
      break;
    case 'full': {
      const [ws, label = 'full'] = positional;
      const secIdx = positional.indexOf('--seconds');
      const selectedSeconds = secIdx >= 0 ? Number(positional[secIdx + 1]) : undefined;
      validateMeasureSeconds(selectedSeconds);
      execFileSync('node', [join(ROOT, 'scripts', 'linux', 'build-steamrt4.mjs'), ws], {
        stdio: 'inherit',
      });
      const deployment = cmdDeploy(ROOT, ws, host);
      const plan = fullMeasurementPlan(ws, deployment.records, selectedSeconds);
      cmdMode(
        ROOT,
        ws,
        host,
        Object.entries(plan.flags).map(([key, value]) => `${key}=${value}`),
        plan.release,
      );
      await cmdMeasure(ROOT, ws, host, label, {
        release: plan.release,
        seconds: plan.seconds,
      });
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(`[deck] ${command} düştü: ${error.message}`);
  process.exit(1);
}
