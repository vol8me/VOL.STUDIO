import { basename, dirname } from 'node:path';

/**
 * `deck.mjs`'nin test edilebilir çekirdeği. Burada komut satırı yoktur:
 * keşif ayrıştırması, oyun kimliği türetmesi, kısayol kaydı gövdesi,
 * başlatıcı betik ve güç/kayıt özetleri saf fonksiyonlardır; kabuk tarafı
 * (deck.mjs) yalnız ssh/rsync/podman çağrılarını yapar.
 */

/** Devkit sözleşmesinin oyun kimliği deseni — tire kabul edilmez. */
const GAME_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]+$/;

/**
 * Ürün adından devkit oyun kimliği türetir. `vol-deck-probe` → `vol_deck_probe`.
 * Desene uymayan bir isim (boş, sayıyla başlayan) açıkça reddedilir —
 * Deck'te kısayol kaydının sessizce reddedilmesindense burada düşer.
 */
export function toDeckGameId(productName) {
  const candidate = productName.trim().replaceAll('-', '_').replaceAll(' ', '_');
  if (!GAME_ID_PATTERN.test(candidate)) {
    throw new Error(
      `Oyun kimliği desenine uymuyor: ${JSON.stringify(productName)} → ${JSON.stringify(
        candidate,
      )} ` + `(beklenen ${GAME_ID_PATTERN})`,
    );
  }
  return candidate;
}

/**
 * Devkit keşfi için hedef önceliği: açık `--host` > `DECK_HOST` > mDNS
 * (`steamdeck.local` NSS çözümü) > Avahi `_steamos-devkit._tcp` taraması.
 * Sabit IP hiçbir yerde yazılmaz.
 *
 * @param {{cli?: string, env?: string, getent?: string|null, avahi?: {host: string, ip: string}[]}} sources
 */
export function resolveDeckHost({ cli, env, getent, avahi } = {}) {
  const resolved = (host, via) => {
    if (!/^(?:[A-Za-z0-9][A-Za-z0-9_.:%-]*|\[[A-Fa-f0-9:.%]+\])$/.test(host)) {
      throw new Error('Deck host güvenli DNS/IP biçiminde olmalı');
    }
    return { host, via };
  };
  if (cli) return resolved(cli, '--host');
  if (env) return resolved(env, 'DECK_HOST');
  if (getent) return resolved('steamdeck.local', 'mDNS (nsswitch)');
  const found = avahi?.[0];
  if (found) return resolved(found.ip ?? found.host, 'avahi _steamos-devkit._tcp');
  return null;
}

/**
 * `avahi-browse -rtp _steamos-devkit._tcp` çıktısından kayıtları çıkarır.
 * Biçim: `=;<if>;<proto>;<name>;<type>;<domain>;<host>;<ip>;<port>;...`
 */
export function parseAvahiBrowse(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('='))
    .map((line) => {
      const fields = line.split(';');
      return { host: fields[6], ip: fields[7], port: Number(fields[8]) };
    })
    .filter((record) => record.host && record.ip);
}

/**
 * `steam-client-create-shortcut --parms` gövdesi.
 * `env` alanı boş sözlüktür: anahtar ZORUNLUDUR (araç KeyError ile düşer)
 * ama değerleri oyuna güvenilir ulaşmaz; değişkenler
 * başlatıcı betiğin okuduğu mode.env dosyasından verilir.
 */
export function buildShortcutParms({ gameid, directory, argv, settings = {} }) {
  if (!GAME_ID_PATTERN.test(gameid)) {
    throw new Error(`gameid desen dışı: ${JSON.stringify(gameid)}`);
  }
  if (!argv?.length || argv[0].startsWith('/') || argv[0].split('/').includes('..')) {
    throw new Error('argv[0] yüklenen dizinin içindeki göreli bir betik olmalı (ör. ./run.sh)');
  }
  return {
    gameid,
    directory,
    argv,
    env: {},
    settings: { steam_play: '0', ...settings },
    force_appid: '',
  };
}

/** Devkit, argv yolunu `gameid` köküne göre arar; release alt dizinini argv taşır. */
export function buildReleaseShortcutParms({ gameid, release, settings = {} }) {
  if (!/^\.vol-release-[A-Za-z0-9_-]+$/.test(basename(release)))
    throw new Error('Release dizini beklenen ad biçiminde değil');
  return buildShortcutParms({
    gameid,
    directory: dirname(release),
    argv: [`./${basename(release)}/run.sh`],
    settings,
  });
}

export function shortcutRegistrationSucceeded(response) {
  return (
    response !== null &&
    typeof response === 'object' &&
    !Object.hasOwn(response, 'error') &&
    Object.hasOwn(response, 'success')
  );
}

/**
 * Yüklenen dizindeki başlatıcı. Ortam değişkenleri kayıt gövdesi yerine
 * `$HOME/.vol-studio/deck/<gameid>.env` dosyasından okunur — `deck:m mode`
 * komutu o dosyayı yazar ve kısayolu yeniden kurmaya gerek kalmaz.
 */
export function renderLauncher(gameid) {
  if (!GAME_ID_PATTERN.test(gameid)) throw new Error('gameid desen dışı');
  return `#!/bin/sh
cd "$(dirname "$0")"
MODE="$HOME/.vol-studio/deck/${gameid}.env"
if [ -f "$MODE" ]; then
  set -a
  . "$MODE"
  set +a
fi
exec ./AppRun "$@"
`;
}

/** Full akışı yalnız yeni release ortamını açar. Oyun paketleri faz işareti üretmez; duvar saati penceresiyle ölçülür. */
export function fullMeasurementPlan(workspace, release, seconds) {
  if (typeof release !== 'string' || release.length === 0)
    throw new Error('full için yeni release kaydı gerekli');
  validateMeasureSeconds(seconds);
  return {
    release,
    flags: { VOL_DECK_MEASURE: '1' },
    seconds: seconds ?? (workspace.startsWith('games/') ? 60 : undefined),
  };
}

export function validateMeasureSeconds(seconds) {
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0 || seconds > 3600))
    throw new Error('Ölçüm penceresi 0–3600 saniye arasında olmalı');
}

const MEASUREMENT_ENUMS = {
  VOL_DECK_WEATHER: /^(clear|dust|rain|snow)$/,
  VOL_DECK_SEASON: /^(spring|summer|autumn|winter)$/,
  VOL_DECK_QUALITY: /^(low|high)$/,
};

/** mode.env gövdesi: yalnız `KEY=VALUE` satırları; kabuk meta karakteri yok. */
export function renderModeEnv(entries) {
  return Object.entries(entries)
    .map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Geçersiz değişken adı: ${JSON.stringify(key)}`);
      }
      if (!/^[A-Za-z0-9_.:-]+$/.test(String(value))) {
        throw new Error(`Değişken değeri kabuk meta karakteri içeremez: ${key}`);
      }
      const booleans = [
        'VOL_DECK_MEASURE',
        'VOL_DECK_HAPTICS_PROBE',
        'WEBKIT_DISABLE_DMABUF_RENDERER',
        'WEBKIT_FORCE_VBLANK_TIMER',
        '__NV_DISABLE_EXPLICIT_SYNC',
      ];
      const valid = booleans.includes(key)
        ? /^[01]$/.test(String(value))
        : key === 'GDK_BACKEND'
          ? /^(x11|wayland)$/.test(String(value))
          : key === 'WEBKIT_DISPLAY_REFRESH_THROTTLE_FPS'
            ? /^(?:[1-9]\d?|1\d\d|2[0-3]\d|240)$/.test(String(value))
            : key === 'VOL_DECK_SCENARIO'
              ? /^(0|10|20|30|40)$/.test(String(value))
              : key === 'VOL_DECK_SEED'
                ? /^\d{1,10}$/.test(String(value)) && Number(value) <= 4294967295
                : Object.hasOwn(MEASUREMENT_ENUMS, key)
                  ? MEASUREMENT_ENUMS[key].test(String(value))
                  : false;
      if (!valid) throw new Error(`Ölçüm değişkeni veya değeri izin listesinde değil: ${key}`);
      return `${key}=${value}`;
    })
    .join('\n');
}

export function shellQuote(value) {
  if (String(value).includes('\0')) throw new Error('Kabuk argümanı NUL içeremez');
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function pythonCommand(script, args = []) {
  return `python3 -c ${shellQuote(script)} ${args.map(shellQuote).join(' ')}`;
}

export function releaseDirectory(directory, release) {
  if (
    !directory.startsWith('/') ||
    directory === '/' ||
    /[\r\n\0]/.test(directory) ||
    directory.split('/').includes('..')
  ) {
    throw new Error('Yükleme kökü güvenli bir mutlak dizin olmalı');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(release)) throw new Error('Release adı güvenli dosya adı olmalı');
  return `${directory.replace(/\/+$/, '')}/.vol-release-${release}`;
}

export function buildRsyncArgs({ host, key, source, directory }) {
  resolveDeckHost({ cli: host });
  return [
    '-a',
    '--protect-args',
    '-e',
    `ssh -i ${shellQuote(key)} -o BatchMode=yes -o ConnectTimeout=8`,
    '--',
    `${source}/`,
    `deck@${host}:${directory}/`,
  ];
}

export function renderPrepareReleaseCommand(gameid) {
  if (!GAME_ID_PATTERN.test(gameid)) throw new Error('gameid desen dışı');
  return pythonCommand(
    `import os, sys, json
directory = os.path.expanduser("~/devkit-game/" + sys.argv[1])
os.makedirs(directory, exist_ok=False)
print(json.dumps({"directory": directory}))`,
    [gameid],
  );
}

export function renderReleaseStopCommand(directory) {
  releaseDirectory(directory, 'validation');
  return pythonCommand(
    `import os, sys, signal
root = os.path.realpath(sys.argv[1]) + os.sep
for entry in os.listdir("/proc"):
    if not entry.isdigit(): continue
    try:
        if os.path.realpath(os.readlink("/proc/" + entry + "/exe")).startswith(root):
            os.kill(int(entry), signal.SIGTERM)
    except (OSError, ProcessLookupError): pass`,
    [directory],
  );
}

export function renderInventoryCommand(directory, exclude = '') {
  return pythonCommand(
    `import os, sys, json, hashlib, stat
root, excluded = sys.argv[1:]
entries = []
for base, dirs, files in os.walk(root, followlinks=False):
    if base == root and excluded in dirs: dirs.remove(excluded)
    for name in sorted(dirs + files):
        path = os.path.join(base, name)
        entry = {"path": os.path.relpath(path, root), "mode": stat.S_IMODE(os.lstat(path).st_mode)}
        if os.path.islink(path):
            entry.update(type="link", sha256=hashlib.sha256(os.readlink(path).encode()).hexdigest())
        elif os.path.isdir(path): entry.update(type="directory")
        else:
            digest = hashlib.sha256()
            with open(path, "rb") as file:
                for block in iter(lambda: file.read(1048576), b""): digest.update(block)
            entry.update(type="file", sha256=digest.hexdigest())
        entries.append(entry)
print(json.dumps(sorted(entries, key=lambda entry: entry["path"])))`,
    [directory, exclude],
  );
}

export function assertInventoryPreserved(before, after) {
  const entries = new Map(after.map((entry) => [entry.path, entry]));
  for (const entry of before) {
    if (JSON.stringify(entries.get(entry.path)) !== JSON.stringify(entry)) {
      throw new Error('Yükleme öncesindeki uzak dosyalardan biri değişti; kısayol güncellenmedi');
    }
  }
}

/** @param {string} path @param {{ size: number, sha256: string, endsWithNewline: boolean } | null} [baseline] */
export function renderLogReadCommand(path, baseline = null) {
  return pythonCommand(
    `import os, sys, json, hashlib, base64
path = os.path.expanduser(sys.argv[1])
baseline = json.loads(sys.argv[2])
exists = os.path.exists(path)
data = open(path, "rb").read() if exists else b""
offset = baseline["size"] if baseline else 0
if baseline and (len(data) < offset or hashlib.sha256(data[:offset]).hexdigest() != baseline["sha256"]):
    sys.exit("Önceki kayıt değişti; ölçüm sınırı korunamadı")
tail = data[offset:]
if baseline and not baseline["endsWithNewline"] and offset:
    tail = tail.partition(b"\\n")[2]
print(json.dumps({"exists": exists, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(), "endsWithNewline": not data or data.endswith(b"\\n"), "dataBase64": base64.b64encode(tail).decode()}))`,
    [
      path,
      JSON.stringify(
        baseline
          ? {
              size: baseline.size,
              sha256: baseline.sha256,
              endsWithNewline: baseline.endsWithNewline,
            }
          : null,
      ),
    ],
  );
}

export function renderAtomicWriteCommand(path, body, nonce) {
  if (!/^[A-Za-z0-9_-]+$/.test(nonce)) throw new Error('Geçici dosya kimliği güvenli olmalı');
  return pythonCommand(
    `import os, sys, base64
path = os.path.expanduser(sys.argv[1])
temp = path + ".vol-new-" + sys.argv[3]
os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
with open(temp, "xb") as file:
    os.chmod(temp, 0o600)
    file.write(base64.b64decode(sys.argv[2]))
    file.flush()
    os.fsync(file.fileno())
os.replace(temp, path)
fd = os.open(os.path.dirname(path), os.O_RDONLY | os.O_DIRECTORY)
os.fsync(fd)
os.close(fd)`,
    [path, Buffer.from(body).toString('base64'), nonce],
  );
}

export function sanitizeReport(text) {
  const metricNames = new Set([
    'enemies',
    'bullets',
    'particles',
    'wave',
    'seed',
    'updateMs',
    'renderCpuMs',
    'inputMs',
    'entitiesMs',
    'collisionMs',
    'audioUpdateMs',
    'hudMs',
    'simulationDroppedMs',
    'canvasWidth',
    'canvasHeight',
    'canvasClientWidth',
    'canvasClientHeight',
    'viewportWidth',
    'viewportHeight',
    'dpr',
    'audioState',
    'sfxVoices',
    'inputDelayMs',
    'scenarioEnemies',
    'scenarioSeed',
  ]);
  const numeric = new Set([
    'v',
    't',
    'wall',
    'mono',
    'boot',
    'window',
    'sprites',
    'fps',
    'meanMs',
    'p50',
    'p95',
    'p99',
    'min',
    'max',
    'mean',
    'samples',
    'avg',
    'start',
    'end',
    'frames',
    'over20ms',
    'over34ms',
    'seconds',
    'signal',
    'button',
    'axis',
    'enemies',
    'enemyCount',
    'bullets',
    'bulletCount',
    'projectiles',
    'particles',
    'particleCount',
    'wave',
    'waveIndex',
    'seed',
    'width',
    'height',
    'clientWidth',
    'clientHeight',
    'backingWidth',
    'backingHeight',
    'dpr',
    'renderScale',
    'sampleRate',
    'baseLatency',
    'outputLatency',
    'nodes',
    'opened',
    'rumbleCapable',
    'uploadFailed',
    'hidrawNodes',
    'hidrawValve',
    'statusBits',
  ]);
  const boolean = new Set([
    'available',
    'compiled',
    'deck',
    'bigPicture',
    'overlayEnabled',
    'cloudEnabled',
    'inputReady',
    'manifestOk',
    'manifest_ok',
    'platformSupported',
    'final',
    'paused',
    'boss',
    'webgl',
    'fullscreen',
    'ok',
    'hasError',
    'trusted',
    'repeat',
  ]);
  const nested = new Set([
    'haptics',
    'status',
    'scan',
    'viewport',
    'canvas',
    'context',
    'load',
    'update',
    'render',
    'audio',
    'input',
    'gc',
    'frame',
    'simulation',
    'subsystems',
  ]);
  const enums = {
    src: /^(js|rust)$/,
    backend: /^(none|hidraw|evdev|native|gamepad|vibration|error)$/,
    mapping: /^(standard|)$/,
    state: /^(running|suspended|closed)$/,
    result: /^(ok|error|unavailable|pending-human)$/,
    sessionKind: /^(gamescope|desktop|web|unknown)$/,
    phase:
      /^(oyun|\d+ sprite|boş|empty|gameplay|menu|pause|settings|cards|shop|boss|death|loading|unclassified|background)$/u,
    context: /^(menu|settings|gameplay|pause|cards|death|loading|unclassified|background)$/,
    shortcut: /^(undo|print|printscreen)$/,
    target: /^(editable|canvas|other)$/,
  };
  const safe = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
    const result = {};
    for (const [key, value] of Object.entries(record)) {
      if (numeric.has(key) && typeof value === 'number' && Number.isFinite(value))
        result[key] = value;
      else if (boolean.has(key) && (typeof value === 'boolean' || value === null))
        result[key] = value;
      else if (enums[key] && typeof value === 'string' && enums[key].test(value))
        result[key] = value;
      else if (nested.has(key)) result[key] = safe(value);
      else if (key === 'metrics' && value && typeof value === 'object') {
        result.metrics = Object.fromEntries(
          Object.entries(value)
            .filter(([name]) => metricNames.has(name))
            .map(([name, metric]) => [
              name,
              Object.fromEntries(
                Object.entries(metric && typeof metric === 'object' ? metric : {}).filter(
                  ([stat, number]) =>
                    ['min', 'max', 'avg', 'samples'].includes(stat) &&
                    typeof number === 'number' &&
                    Number.isFinite(number),
                ),
              ),
            ]),
        );
      } else if (
        key === 'type' &&
        typeof value === 'string' &&
        /^[a-z][a-z0-9-]{0,40}$/.test(value)
      )
        result[key] = value;
      else if (key === 'error' || key === 'lastError' || key === 'message' || key === 'reason')
        result.hasError = Boolean(value);
      else if (key === 'env' && value && typeof value === 'object') {
        const env = {};
        for (const [name, pattern] of Object.entries(MEASUREMENT_ENUMS))
          if (pattern.test(String(value[name]))) env[name] = String(value[name]);
        for (const name of [
          'WEBKIT_DISABLE_DMABUF_RENDERER',
          'WEBKIT_FORCE_VBLANK_TIMER',
          'VOL_DECK_MEASURE',
          'VOL_DECK_HAPTICS_PROBE',
          'STEAM_GAMESCOPE',
        ]) {
          if (/^[01]$/.test(String(value[name]))) env[name] = String(value[name]);
        }
        if (/^(0|10|20|30|40)$/.test(String(value.VOL_DECK_SCENARIO)))
          env.VOL_DECK_SCENARIO = String(value.VOL_DECK_SCENARIO);
        if (
          /^\d{1,10}$/.test(String(value.VOL_DECK_SEED)) &&
          Number(value.VOL_DECK_SEED) <= 4294967295
        )
          env.VOL_DECK_SEED = String(value.VOL_DECK_SEED);
        const runtime = String(value.PRESSURE_VESSEL_RUNTIME ?? '').match(
          /steamrt[34]_[A-Za-z0-9_.-]+/,
        );
        if (runtime) env.PRESSURE_VESSEL_RUNTIME = runtime[0];
        result.env = env;
      }
    }
    return result;
  };
  return (
    text
      .split('\n')
      .flatMap((line) => {
        try {
          const record = safe(JSON.parse(line));
          return record.type ? [JSON.stringify(record)] : [];
        } catch {
          return [];
        }
      })
      .join('\n') + '\n'
  );
}

export function assertCleanConfirmation(gameid, confirmation) {
  if (confirmation !== gameid) throw new Error('Silme açık onay ister: --confirm-delete=<gameid>');
}

/**
 * İzlenen güç sayaçları (LCD Deck'te doğrulandı; bkz. docs/steam-deck.md).
 * RAPL `energy_uj` root-readable (açılamaz); paket gücü `amdgpu` hwmon'unun
 * `power*_average` (µW) alanlarından okunur. hwmon numarası sürüme göre
 * değişebilir; `hwmonByName` uzaktaki sayacı ada göre bulur, sabit numara
 * yazılmaz.
 */
export const POWER_COUNTERS = {
  batteryChargeUah: '/sys/class/power_supply/BAT1/charge_now',
  batteryStatus: '/sys/class/power_supply/BAT1/status',
  batteryCurrentUa: '/sys/class/power_supply/BAT1/current_now',
  batteryVoltageUv: '/sys/class/power_supply/BAT1/voltage_now',
};

/** hwmon sayaç alanları — ada göre bulunan düğümün altındaki dosya adları. */
export const HWMON_FIELDS = {
  amdgpu: ['power1_average', 'power2_average', 'power1_input', 'temp1_input'],
  steamdeck_hwmon: ['curr1_input', 'in0_input', 'temp1_input', 'fan1_input'],
};

/** `for hwmon in /sys/class/hwmon/hwmon*: name` taramasını ada göre çözer. */
export function hwmonByName(scan, wanted) {
  const match = scan
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2)
    .find(([, name]) => name === wanted);
  return match ? match[0] : null;
}

/**
 * hwmon güç alanları µW bildirir; W'a çevirir. Okunamayan alan ('-' ya da
 * boş) null döner — paket gücü ölçülemediyse kayıtta bunu söylemek dürüsttür.
 *
 * @param {string|number|null|undefined} uw
 * @returns {number|null} watt
 */
export function hwmonWatts(uw) {
  const value = Number(uw);
  return Number.isFinite(value) && value > 0 ? Math.round(value / 1000) / 1000 : null;
}

/** JSONL raporu özetler: faz satırları ve sondanın gördüğü ortam gerçekleri. */
export function summarizeReport(lines) {
  const records = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  // Sonda faz kaydı (`phase`/`phase-raf`) üretir; oyun ise
  // faz değil duvar-saati penceresi koşar — `perf` kayıtları aynı alanları
  // taşır ve burada aynı tabloya girer.
  const phases = records.filter(
    (r) => r.type === 'phase' || r.type === 'phase-raf' || r.type === 'perf',
  );
  // Sayfa yeniden yüklenirse aynı faz iki kez yazılır — son kayıt günceldir.
  // `perf` pencereleri aynı faz adını taşıdığı için `window` anahtarla ayrılır.
  const byPhase = new Map(phases.map((p) => [`${p.phase}#${p.window ?? ''}`, p]));
  const info = [...records].reverse().find((r) => r.type === 'info');
  const signals = records.filter((r) => r.type === 'signal');
  const suspendGaps = records.filter((r) => r.type === 'suspend-gap');
  const pads = records.filter((r) => r.type === 'pad-connected');
  const padInputs = records.filter((r) => r.type === 'pad-input');
  const steamworks = [...records].reverse().find((r) => r.type === 'steamworks');
  return {
    env: info?.env ?? null,
    runtime: info?.env?.PRESSURE_VESSEL_RUNTIME ?? 'host',
    phases: [...byPhase.values()].map((p) => ({
      phase: p.phase,
      window: p.window ?? null,
      sprites: p.sprites ?? null,
      fps: p.fps,
      p95: p.p95,
      p99: p.p99 ?? null,
      start: p.start ?? null,
      end: p.end ?? null,
      metrics: p.metrics ?? {},
      over20ms: p.over20ms,
      over34ms: p.over34ms,
    })),
    signals: signals.map((s) => s.signal),
    suspendGaps: suspendGaps.map((s) => s.seconds),
    gamepads: pads.map((p) => ({ id: p.id, mapping: p.mapping })),
    // Oyun kaydı fiziksel ilk kol basımını `pad-input` olarak yazar; listede
    // olması "kol girdisi WebView'a ulaştı" demektir.
    padInputs: padInputs.map((p) => ({ button: p.button ?? null, axis: p.axis ?? null })),
    // Oyunun bildirdiği Steamworks durumu — eklenti yoksa kayıt hiç olmaz.
    steamworks: steamworks
      ? {
          available: steamworks.available ?? false,
          manifestOk: steamworks.manifestOk ?? steamworks.manifest_ok ?? null,
          appId: steamworks.appId ?? steamworks.app_id ?? null,
          deck: steamworks.deck ?? null,
        }
      : null,
    total: records.length,
  };
}
