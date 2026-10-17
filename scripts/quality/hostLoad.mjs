/**
 * Makine yükü ön kontrolü. Süre ve zaman aşımı sonuçları, makine kapıdan ÖNCE zaten meşgulse yük taşır: ihmal
 * edilmiş geliştirme sunucuları makinenin büyük kısmını yediğinde tam bir e2e aşaması kat kat uzadı ve yük kaynaklı
 * zaman aşımları gerçek regresyondan ayırt edilemedi. Burada yük örneklenir; meşgulse hangi süreçlerin yediği ADIYLA
 * yazılır. Yalnız bildirir: bir süreci KAPATMAZ (geliştirme sunucusu başkasının açık işi olabilir).
 */
import { availableParallelism, cpus } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { execFileSync } from './command.mjs';

/** Kapıdan önce makinenin bu oranından fazlası meşgulse uyarılır. */
export const BUSY_WARN_FRACTION = 0.3;
/** Bir süreç makinenin bu oranından fazlasını yiyorsa adıyla listelenir. */
export const PROCESS_LIST_FRACTION = 0.03;
/** Uyarıda en çok bu kadar süreç yazılır (en çok yiyenden başlayarak). */
export const PROCESS_LIST_LIMIT = 6;
export const SAMPLE_MS = 1000;
const COMMAND_WIDTH = 110;

/** İki `os.cpus()` örneği arasındaki meşgul oran (0–1). */
export function busyFraction(before, after) {
  const total = (times) => times.user + times.nice + times.sys + times.idle + times.irq;
  let idle = 0;
  let all = 0;
  for (let index = 0; index < Math.min(before.length, after.length); index += 1) {
    idle += after[index].times.idle - before[index].times.idle;
    all += total(after[index].times) - total(before[index].times);
  }
  return all > 0 ? Math.min(1, Math.max(0, 1 - idle / all)) : 0;
}

/** Makinenin tamamının `sampleMs` boyunca meşgul oranı (0–1). */
export async function sampleBusy(sampleMs = SAMPLE_MS) {
  const before = cpus();
  await delay(sampleMs);
  return busyFraction(before, cpus());
}

/**
 * PowerShell: her sürecin örnekleme penceresindeki işlemci saniyesi, üst süreci ve komut satırı. Yalnız pencerede
 * çalışanlar yazılır (yüzlerce boşta sürecin komut satırı çözülmez); örnekleyicinin kendisi (`$PID`) hariçtir.
 */
const WINDOWS_SAMPLE_SCRIPT = `
$before = @{}
Get-Process | ForEach-Object { if ($null -ne $_.CPU) { $before[$_.Id] = $_.CPU } }
$clock = [Diagnostics.Stopwatch]::StartNew()
Start-Sleep -Milliseconds ${SAMPLE_MS}
$seconds = $clock.Elapsed.TotalSeconds
$active = @(Get-Process | Where-Object { $_.Id -ne $PID -and $null -ne $_.CPU -and $before.ContainsKey($_.Id) -and ($_.CPU - $before[$_.Id]) -gt 0.01 })
$info = @{}
Get-CimInstance Win32_Process | ForEach-Object { $info[[int]$_.ProcessId] = $_ }
$rows = @($active | ForEach-Object {
  $own = $info[$_.Id]
  [pscustomobject]@{
    pid = $_.Id
    ppid = if ($own) { [int]$own.ParentProcessId } else { 0 }
    name = $_.ProcessName
    command = if ($own) { [string]$own.CommandLine } else { '' }
    cpuSeconds = $_.CPU - $before[$_.Id]
  }
})
[pscustomobject]@{ seconds = $seconds; rows = $rows } | ConvertTo-Json -Depth 4 -Compress
`;

/** @typedef {{ pid: number, ppid: number, name: string, command: string, fraction: number }} ProcessRow */

/** PowerShell örneğini makine oranına çevirir (`fraction`: tüm çekirdeklerin payı). @returns {ProcessRow[]} */
export function parseWindowsSample(json, cores) {
  const sample = JSON.parse(json.replace(/^\uFEFF/, ''));
  const rows = Array.isArray(sample.rows) ? sample.rows : sample.rows ? [sample.rows] : [];
  const window = Math.max(sample.seconds, 0.001);
  return rows.map((row) => ({
    pid: row.pid,
    ppid: row.ppid,
    name: row.name,
    command: row.command ?? '',
    fraction: row.cpuSeconds / (window * cores),
  }));
}

/** `ps -eo pid=,ppid=,pcpu=,comm=,args=` çıktısı; `pcpu` bir çekirdeğin yüzdesi, ömür ortalamasıdır. @returns {ProcessRow[]} */
export function parsePosixTable(text, cores) {
  const rows = [];
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      name: match[4],
      command: match[5],
      fraction: Number(match[3]) / 100 / cores,
    });
  }
  return rows;
}

/** Çalışan süreçlerin işlemci payı; okunamazsa hata fırlatır (çağıran uyarıyı süreçsiz yazar). */
export function readProcesses(platform = process.platform, cores = availableParallelism()) {
  if (platform === 'win32') {
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_SAMPLE_SCRIPT],
      { encoding: 'utf8', windowsHide: true, timeout: 30_000 },
    );
    return parseWindowsSample(output, cores);
  }
  const output = execFileSync('ps', ['-eo', 'pid=,ppid=,pcpu=,comm=,args='], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  return parsePosixTable(output, cores);
}

const normalizePath = (value) => value.replaceAll('\\', '/').toLowerCase();

/** Kapının kendi süreç zinciri (kendisi ve üst süreçleri) uyarıya girmez. */
function ownChain(processes, selfPid) {
  const parents = new Map(processes.map((row) => [row.pid, row.ppid]));
  const chain = new Set([selfPid]);
  for (let pid = parents.get(selfPid); pid && !chain.has(pid); pid = parents.get(pid))
    chain.add(pid);
  return chain;
}

/**
 * Makine meşgulse uyarı bilgisi, değilse `null`. `repo`: komut satırı bu deponun yolunu taşır (açık geliştirme
 * sunucusu, önceki koşunun artığı); yalnız bunlar için kapatma komutu önerilir.
 */
export function describeBusy({ busy, processes, root, selfPid }) {
  if (busy < BUSY_WARN_FRACTION) return null;
  const own = ownChain(processes, selfPid);
  const rootPath = normalizePath(root);
  const rows = processes
    .filter((row) => !own.has(row.pid) && row.fraction >= PROCESS_LIST_FRACTION)
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, PROCESS_LIST_LIMIT)
    .map((row) => ({ ...row, repo: normalizePath(row.command).includes(rootPath) }));
  return { busy, rows, stop: rows.filter((row) => row.repo).map((row) => row.pid) };
}

const percent = (fraction) => `%${Math.round(fraction * 100)}`;
const clip = (text) =>
  text.length > COMMAND_WIDTH ? `${text.slice(0, COMMAND_WIDTH - 1)}…` : text;

export function stopCommand(pids, platform = process.platform) {
  return platform === 'win32'
    ? `Stop-Process -Id ${pids.join(',')} -Force`
    : `kill ${pids.join(' ')}`;
}

export function formatBusyWarning(report, platform = process.platform) {
  const lines = [
    `⚠ makine kapıdan ÖNCE ${percent(report.busy)} meşgul (uyarı eşiği ${percent(BUSY_WARN_FRACTION)}): süre ve zaman aşımı ` +
      'sonuçları yük taşır; düşen bir testin yükten mi koddan mı olduğu bu koşudan anlaşılmaz.',
  ];
  if (report.rows.length === 0) {
    lines.push(
      `  Tek tek listelenebilen süreç yok (hiçbiri makinenin ${percent(PROCESS_LIST_FRACTION)}'ini aşmıyor): yük dağınık.`,
    );
  }
  for (const row of report.rows) {
    const mark = row.repo ? '[repo]' : '      ';
    lines.push(
      `    PID ${String(row.pid).padEnd(6)} ${percent(row.fraction).padStart(4)} ${mark} ${clip(row.command || row.name)}`,
    );
  }
  if (report.stop.length > 0) {
    lines.push(
      `  [repo] süreçleri artık gerekmiyorsa kapatın (kapı kapatmaz): ${stopCommand(report.stop, platform)}`,
    );
  }
  lines.push('  Bilerek yüklü koşuyorsanız VOL_GATE_ALLOW_BUSY=1 bu denetimi atlar.');
  return lines.join('\n');
}

/**
 * Ağır kapıdan önce yükü örnekler; meşgulse uyarıyı `log`a yazar. Asla fırlatmaz ve kapıyı düşürmez.
 * @returns {Promise<{ busy: number, warned: boolean } | null>} atlandıysa `null`
 */
export async function checkHostLoad({
  root,
  log,
  env = process.env,
  sample = sampleBusy,
  read = readProcesses,
  platform = process.platform,
  selfPid = process.pid,
}) {
  if (env.VOL_GATE_ALLOW_BUSY === '1') return null;
  let busy;
  try {
    busy = await sample();
  } catch {
    return null;
  }
  if (busy < BUSY_WARN_FRACTION) return { busy, warned: false };
  let processes = [];
  try {
    processes = read();
  } catch {
    // Süreç listesi okunamadı: yük yine bildirilir, yalnız adlar eksik kalır.
  }
  log(formatBusyWarning(describeBusy({ busy, processes, root, selfPid }), platform));
  return { busy, warned: true };
}
