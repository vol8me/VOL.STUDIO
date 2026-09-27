#!/usr/bin/env node
/**
 * Steam Deck devkit otomasyonu — KAPI DEĞİLDİR, referans ölçümdür.
 * Cihaz her zaman bağlı değildir; çıktı `.claude/deck-olcum/` altına sürümlü
 * kayıt olarak yazılır (depoya girmez).
 *
 *   node scripts/deck.mjs <komut> [seçenekler]
 *
 *   discover                      Deck'i bulur (→ --host / DECK_HOST / mDNS / Avahi)
 *   deploy   <workspace>          AppDir'i Deck'e yükler ve Steam kısayolunu kaydeder
 *   run      <workspace>          Kayıtlı oyunu başlatır
 *   stop     <workspace>          Sürece SIGTERM gönderir
 *   log      <workspace>          diagnostics.jsonl kaydını yazdırır
 *   shot     <ad>                 gamescopectl ekran görüntüsü → .claude/deck-olcum/
 *   power    [saniye]             Güç sayaçları örneği (RAPL enerjisi + hwmon)
 *   measure  <workspace> <etiket> run → fazları bekle → rapor+güç+görüntü → kayıt
 *   mode     <workspace> A=B ...  Bir sonraki run'da etkili ortam dosyası yazar
 *   clean    <workspace>          Kısayolu ve yüklenen dosyaları siler
 *   full     <workspace> <etiket> build → deploy → measure → stop (tek komut)
 *
 * Ortam: DECK_HOST, DECK_SSH_KEY (varsayılan ~/.config/steamos-devkit/devkit_rsa)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildShortcutParms,
  HWMON_FIELDS,
  hwmonByName,
  parseAvahiBrowse,
  POWER_COUNTERS,
  hwmonWatts,
  renderLauncher,
  renderModeEnv,
  resolveDeckHost,
  summarizeReport,
  toDeckGameId,
} from './deck-contract.mjs';
import { loadRepoLifecycle } from './quality/workspaceLifecycle.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RECORDS = join(ROOT, '.claude', 'deck-olcum');
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

function scp(host, local, remote) {
  execFileSync('scp', ['-q', '-i', SSH_KEY, local, `deck@${host}:${remote}`], {
    stdio: 'inherit',
  });
}

/** Uzak → yerel kopya (ekran görüntüsü, kayıt dosyası indirme). */
function scpFrom(host, remote, local) {
  execFileSync('scp', ['-q', '-i', SSH_KEY, `deck@${host}:${remote}`, local], {
    stdio: 'inherit',
  });
}

/* ---------- workspace çözümü ---------- */

function readShell(root, workspace) {
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
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  const productName = conf.productName;
  return {
    dir,
    productName,
    identifier: conf.identifier,
    gameid: toDeckGameId(productName),
    appDir: join(
      dir,
      'src-tauri',
      'target',
      'release',
      'bundle',
      'appimage',
      `${productName}.AppDir`,
    ),
    remoteLog: `~/.local/share/${conf.identifier}/diagnostics.jsonl`,
  };
}

/* ---------- komutlar ---------- */

function cmdDiscover(argv) {
  const idx = argv.indexOf('--host');
  const { host, via } = discoverHost(idx >= 0 ? argv[idx + 1] : undefined);
  console.log(`${host}  (${via})`);
}

function cmdDeploy(root, workspace, host, { compat } = {}) {
  const shell = readShell(root, workspace);
  if (!existsSync(shell.appDir)) {
    throw new Error(
      `${shell.appDir} yok — önce derleyin: node scripts/build-linux-steamrt4.mjs ${workspace}`,
    );
  }

  const prepJson = ssh(
    host,
    `python3 ~/devkit-utils/steamos-prepare-upload --gameid ${shell.gameid}`,
    { quiet: true },
  );
  const { directory } = JSON.parse(prepJson);
  console.log(`[deploy] hedef dizin: ${directory}`);

  execFileSync(
    'rsync',
    [
      '-a',
      '--delete',
      '-e',
      `ssh -i ${SSH_KEY} -o BatchMode=yes`,
      `${shell.appDir}/`,
      `deck@${host}:${directory}/`,
    ],
    { stdio: 'inherit' },
  );

  const launcher = renderLauncher(shell.gameid);
  const tmp = join(RECORDS, 'tmp', 'run.sh');
  mkdirSync(join(RECORDS, 'tmp'), { recursive: true });
  writeFileSync(tmp, launcher, { mode: 0o755 });
  scp(host, tmp, `${directory}/run.sh`);
  ssh(host, `chmod +x ${directory}/run.sh ${directory}/AppRun`, { quiet: true });

  const parms = buildShortcutParms({
    gameid: shell.gameid,
    directory,
    argv: ['./run.sh'],
    settings: compat ? { compat_tool: compat } : {},
  });
  const out = ssh(
    host,
    `python3 ~/devkit-utils/steam-client-create-shortcut --parms ${JSON.stringify(
      JSON.stringify(parms),
    )}`,
    { quiet: true },
  );
  console.log(`[deploy] kısayol kaydedildi: ${shell.gameid}${out ? ` — ${out}` : ''}`);
  return { directory, gameid: shell.gameid };
}

function cmdRun(root, workspace, host) {
  const { gameid } = readShell(root, workspace);
  const out = ssh(host, `python3 ~/devkit-utils/steam-devkit-rpc run-game gameid=${gameid}`);
  console.log(out || `[run] ${gameid} başlatıldı`);
}

function cmdStop(root, workspace, host) {
  const { productName } = readShell(root, workspace);
  ssh(host, `pkill -TERM -x ${productName} || true`, { quiet: true });
  console.log(`[stop] ${productName} için SIGTERM gönderildi`);
}

function cmdLog(root, workspace, host) {
  const { remoteLog } = readShell(root, workspace);
  try {
    process.stdout.write(ssh(host, `cat ${remoteLog}`) + '\n');
  } catch {
    console.log(`[log] ${remoteLog} henüz yok — sonda hiç koşmadı mı?`);
  }
}

function cmdShot(host, name) {
  const safe = name.replaceAll(/[^A-Za-z0-9_-]/g, '_');
  const dir = join(RECORDS, new Date().toISOString().slice(0, 10));
  mkdirSync(dir, { recursive: true });
  const remote = `/tmp/vol-shot-${safe}.png`;
  ssh(host, `gamescopectl screenshot ${remote} >/dev/null 2>&1; sleep 1`, { quiet: true });
  const local = join(dir, `deck-${safe}.png`);
  scpFrom(host, remote, local);
  ssh(host, `rm -f ${remote}`, { quiet: true });
  console.log(`[shot] ${local}`);
  return local;
}

/** Uzaktan tek örnek: isimle bulunan hwmon alanları (µW) + pil sayaçları. */
function powerSample(host, seconds = 8) {
  const scan = ssh(
    host,
    'for h in /sys/class/hwmon/hwmon*; do echo "$h $(cat $h/name 2>/dev/null)"; done',
    { quiet: true },
  );
  const reads = [];
  for (const [name, fields] of Object.entries(HWMON_FIELDS)) {
    const node = hwmonByName(scan, name);
    if (!node) continue;
    for (const field of fields) reads.push(`${name}.${field}=${node}/${field}`);
  }
  const script = `
t0=$(date +%s%3N)
sleep ${seconds}
t1=$(date +%s%3N)
echo "t0=$t0 t1=$t1"
for kv in ${reads.join(' ')}; do
  name=\${kv%%=*}; path=\${kv#*=}
  echo "$name=\$(cat $path 2>/dev/null || echo -)"
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

function cmdMode(root, workspace, host, pairs) {
  const { gameid } = readShell(root, workspace);
  const entries = Object.fromEntries(
    pairs.map((pair) => {
      const idx = pair.indexOf('=');
      if (idx <= 0) throw new Error(`mode girdisi KEY=VALUE olmalı: ${pair}`);
      return [pair.slice(0, idx), pair.slice(idx + 1)];
    }),
  );
  const body = renderModeEnv(entries);
  // İçerik base64 ile taşınır: SSH argümanlarından geçen çift kaçış
  // tırnak/\n'ı bozuyordu; base64 kabuk için nördür.
  const b64 = Buffer.from(`${body}\n`).toString('base64');
  const out = ssh(
    host,
    `mkdir -p ~/.vol-studio/deck && echo ${b64} | base64 -d > ~/.vol-studio/deck/${gameid}.env && cat ~/.vol-studio/deck/${gameid}.env`,
  );
  console.log(out);
}

function cmdClean(root, workspace, host) {
  const { gameid } = readShell(root, workspace);
  ssh(host, `python3 ~/devkit-utils/steamos-delete --delete-title ${gameid} || true`);
  ssh(host, `rm -f ~/.vol-studio/deck/${gameid}.env`, { quiet: true });
  console.log(`[clean] ${gameid} silindi`);
}

async function cmdMeasure(root, workspace, host, label) {
  const shell = readShell(root, workspace);
  const { gameid, remoteLog } = shell;
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
  const dir = join(RECORDS, new Date().toISOString().slice(0, 10), `${label}-${stamp}`);
  mkdirSync(dir, { recursive: true });

  ssh(host, `rm -f ${remoteLog}`, { quiet: true });
  cmdRun(root, workspace, host);
  const powerBefore = powerSample(host, 2);

  // Fazlar: saf rAF (~4sn) + boş (6) + 1000 (10) + 4000 (10) → ~30 sn + başlangıç.
  // Beklenen işaret son ölçülen fazın kaydıdır — sayfa yeniden yüklenirse faz
  // sayısı şişer, bu yüzden ad sayılmaz, son fazın kendisi beklenir.
  let lines = '';
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    lines = optional('ssh', [...SSH_OPTS, `deck@${host}`, `cat ${remoteLog}`]) ?? '';
    if (lines.includes('"phase":"4000 sprite"')) break;
  }
  const powerAfter = powerSample(host, 2);

  // Görüntü oyun açıkken alınır; sonra SIGTERM gönderilir ve son kayıt
  // sinyal/flush satırlarını da içerir (Steam "Quit Game" yolunun kanıtı).
  const shot = cmdShot(host, `${label}-${stamp}`);
  cmdStop(root, workspace, host);
  await new Promise((r) => setTimeout(r, 2000));
  const finalLines = optional('ssh', [...SSH_OPTS, `deck@${host}`, `cat ${remoteLog}`]) ?? lines;
  if (finalLines.length >= lines.length) lines = finalLines;

  writeFileSync(join(dir, 'report.jsonl'), lines);
  const summary = {
    v: 1,
    label,
    workspace,
    gameid,
    measuredAt: new Date().toISOString(),
    device: optional('ssh', [...SSH_OPTS, `deck@${host}`, 'uname -nr']),
    ...summarizeReport(lines.split('\n')),
    power: { before: powerBefore, after: powerAfter },
  };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

  console.log(`[measure] kayıt: ${dir}`);
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

const hostFlag = rest.indexOf('--host');
const host = discoverHost(hostFlag >= 0 ? rest[hostFlag + 1] : undefined).host;
const positional = rest.filter((_, i) => hostFlag < 0 || (i !== hostFlag && i !== hostFlag + 1));

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
      });
      break;
    case 'run':
      cmdRun(ROOT, positional[0], host);
      break;
    case 'stop':
      cmdStop(ROOT, positional[0], host);
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
    case 'measure':
      await cmdMeasure(ROOT, positional[0], host, positional[1] ?? 'measure');
      break;
    case 'mode':
      cmdMode(ROOT, positional[0], host, positional.slice(1));
      break;
    case 'clean':
      cmdClean(ROOT, positional[0], host);
      break;
    case 'full': {
      const [ws, label = 'full'] = positional;
      execFileSync('node', [join(ROOT, 'scripts', 'build-linux-steamrt4.mjs'), ws], {
        stdio: 'inherit',
      });
      cmdDeploy(ROOT, ws, host);
      await cmdMeasure(ROOT, ws, host, label);
      break;
    }
    default:
      usage();
  }
} catch (error) {
  console.error(`[deck] ${command} düştü: ${error.message}`);
  process.exit(1);
}
