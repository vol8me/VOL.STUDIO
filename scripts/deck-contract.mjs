/**
 * `deck.mjs`'nin test edilebilir çekirdeği. Burada komut satırı yoktur:
 * keşif ayrıştırması, oyun kimliği türetmesi, kısayol kaydı gövdesi,
 * başlatıcı betik ve güç/kayıt özetleri saf fonksiyonlardır; kabuk tarafı
 * (deck.mjs) yalnız ssh/rsync/podman çağrılarını yapar.
 */

/** Devkit sözleşmesinin oyun kimliği deseni — tire kabul edilmez. */
export const GAME_ID_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]+$/;

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
  if (cli) return { host: cli, via: '--host' };
  if (env) return { host: env, via: 'DECK_HOST' };
  if (getent) return { host: 'steamdeck.local', via: 'mDNS (nsswitch)' };
  const found = avahi?.[0];
  if (found) return { host: found.ip ?? found.host, via: 'avahi _steamos-devkit._tcp' };
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
 * `env` alanı boş sözlüktür: anahtar ZORUNLUDUR (araç KeyError ile düşer,
 * ölçüldü 2026-09-27) ama değerleri oyuna güvenilir ulaşmaz; değişkenler
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

/**
 * Yüklenen dizindeki başlatıcı. Ortam değişkenleri kayıt gövdesi yerine
 * `$HOME/.vol-studio/deck/<gameid>.env` dosyasından okunur — `deck:m mode`
 * komutu o dosyayı yazar ve kısayolu yeniden kurmaya gerek kalmaz.
 */
export function renderLauncher(gameid) {
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

/** mode.env gövdesi: yalnız `KEY=VALUE` satırları; kabuk meta karakteri yok. */
export function renderModeEnv(entries) {
  return Object.entries(entries)
    .map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`Geçersiz değişken adı: ${JSON.stringify(key)}`);
      }
      if (/["'`\\$]/.test(String(value))) {
        throw new Error(`Değişken değeri kabuk meta karakteri içeremez: ${key}`);
      }
      return `${key}=${value}`;
    })
    .join('\n');
}

/**
 * İzlenen güç sayaçları — 2026-09-27 LCD Deck ölçümüyle doğrulanmış.
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
  // Sonda faz kaydı (`phase`/`phase-raf`) üretir; gerçek oyun (vol-hell) ise
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
