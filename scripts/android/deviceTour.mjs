/**
 * Android cihaz turu ayrıştırıcıları ve sonuç kuralları (F09.2 / UI-11.3–11.4).
 *
 * Yalnız saf işlev: `dumpsys`/`am` metnini ve sayfa anlık görüntüsünü okur, hiçbir
 * komut çalıştırmaz. Kanıtın sınırı: bir komutun sistem servisine ulaşması, sonucun
 * kullanıcıya görünmesi/hissedilmesi değildir (titreşim, ses, dokunma hissi).
 */

/** @typedef {'PASS' | 'FAIL' | 'NOT-RUN'} Verdict */

/**
 * `mCurrentFocus=Window{hash u0 paket/Etkinlik}`; sistem pencerelerinde (`Bouncer`,
 * `NotificationShade`) paket yoktur.
 * @returns {{ package: string | null, activity: string | null, window: string } | null}
 */
export function parseFocusedWindow(text) {
  const match = /mCurrentFocus=Window\{[0-9a-f]+ u\d+ ([^}\s]+)\}/.exec(text);
  if (!match) return null;
  const name = match[1];
  const slash = name.indexOf('/');
  if (slash < 0) return { package: null, activity: null, window: name };
  return { package: name.slice(0, slash), activity: name.slice(slash + 1), window: name };
}

/** `isKeyguardShowing=true|false`; satır yoksa `null` (bilinmiyor). */
export function parseKeyguardShowing(text) {
  const match = /isKeyguardShowing=(true|false)/.exec(text);
  return match ? match[1] === 'true' : null;
}

/** `mWakefulness=Awake|Dozing|Asleep`. */
export function parseWakefulness(text) {
  return /mWakefulness=(\w+)/.exec(text)?.[1] ?? null;
}

/** `dumpsys input_method` içindeki `mInputShown`; satır yoksa `null`. */
export function parseInputShown(text) {
  const match = /mInputShown=(true|false)/.exec(text);
  return match ? match[1] === 'true' : null;
}

/** `am start -W` çıktısı: durum, soğuk/sıcak başlangıç ve toplam süre. */
export function parseAmStart(text) {
  const pick = (name) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(text)?.[1].trim() ?? null;
  const total = pick('TotalTime');
  return {
    status: pick('Status'),
    launchState: pick('LaunchState'),
    totalMs: total === null ? null : Number(total),
  };
}

/**
 * `dumpsys vibrator_manager` geçmişinden bir paketin titreşim istekleri.
 *
 * İki biçim okunur: Android 14'ün `Previous vibrations for usage X:` listesi ve Android 16'nın tablo satırları.
 * Durum metni cihaz yerelinde küçük harfe çevrilmiş olabilir (Türkçe yerelde `ıgnored_for_settıngs`);
 * noktasız ı → i ve küçük harf ile normalleştirilir ki `ignored_for_settings` her yerelde aynı olsun.
 * @returns {{ createTime: string, usage: string, status: string, durationMs: number }[]}
 */
export function parseVibrations(text, pkg) {
  const entries = [];
  let usage = 'UNKNOWN';
  for (const line of text.split(/\r?\n/)) {
    const header = /Previous vibrations for usage (\w+):/.exec(line);
    if (header) {
      usage = header[1];
      continue;
    }
    const entry =
      /createTime: (\S+ \S+),.*?durationMs: (\d+), status: (\S+),.*?opPkg=([\w.]+)/.exec(line);
    if (entry) {
      if (entry[4] !== pkg) continue;
      entries.push({
        createTime: entry[1],
        usage,
        status: entry[3].replaceAll('ı', 'i').toLowerCase(),
        durationMs: Number(entry[2]),
      });
      continue;
    }
    // Android 16 tablo biçimi: `MM-DD HH:mm:ss.SSS | effect | finished | duration: 124ms | ... | usage: TOUCH | paket (uid=...)`.
    const table =
      /^\s*(\d\d-\d\d \d\d:\d\d:\d\d\.\d+) \|\s*\w+ \|\s*(\S+) \| duration:\s*(\d+)ms \|.*?\| usage: (\w+) \| ([\w.]+) \(uid=/.exec(
        line,
      );
    if (!table || table[5] !== pkg) continue;
    entries.push({
      createTime: table[1],
      usage: table[4],
      status: table[2].replaceAll('ı', 'i').toLowerCase(),
      durationMs: Number(table[3]),
    });
  }
  return entries;
}

/** Turdan önce görülmeyen titreşim kayıtları (`createTime` anahtarıyla). */
export function newVibrations(before, after) {
  const seen = new Set(before.map((entry) => entry.createTime));
  return after.filter((entry) => !seen.has(entry.createTime));
}

/**
 * Titreşim istekleri için iki ayrı hüküm: sistem servisine ULAŞTI mı, ve ÇALINDI mı.
 * Cihaz ayarı titreşimi kapatmışsa (`ignored_for_settings`) istek ulaşmıştır ama çalınmamıştır.
 * @returns {{ reached: { verdict: Verdict, detail: string }, played: { verdict: Verdict, detail: string } }}
 */
export function judgeVibrations(entries) {
  if (entries.length === 0) {
    return {
      reached: {
        verdict: 'NOT-RUN',
        detail: 'tur sırasında uygulamadan titreşim isteği görülmedi',
      },
      played: { verdict: 'NOT-RUN', detail: 'istek yok' },
    };
  }
  const counts = {};
  for (const entry of entries) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  const summary = Object.entries(counts)
    .map(([status, count]) => `${status}×${count}`)
    .join(', ');
  const played = entries.some((entry) => !entry.status.startsWith('ignored'));
  return {
    reached: {
      verdict: 'PASS',
      detail: `${entries.length} istek sistem servisine ulaştı (${summary})`,
    },
    played: played
      ? { verdict: 'PASS', detail: `çalınan istek var (${summary}); his insan doğrulaması ister` }
      : {
          verdict: 'NOT-RUN',
          detail: `bütün istekler cihaz ayarı yüzünden yok sayıldı (${summary}); titreşim ayarı açılmadan çalındığı söylenemez`,
        },
  };
}

/**
 * Landscape kilidi: manifest `screenOrientation="landscape"` iki yatay yönü de serbest bırakır.
 * Dikey istek yatay kalmalı; sayfa yeniden yüklenmemiş (belirteç korunmuş) ve süreç aynı olmalı.
 */
export function judgeOrientation(snapshot, expected) {
  const problems = [];
  if (!snapshot.type?.startsWith('landscape'))
    problems.push(`yön ${snapshot.type ?? 'bilinmiyor'}`);
  if (snapshot.width <= snapshot.height) {
    problems.push(`görünüm yatay değil (${snapshot.width}×${snapshot.height})`);
  }
  if (!snapshot.tokenKept) problems.push('sayfa yeniden yüklendi (Activity yeniden yaratıldı)');
  if (snapshot.pid !== expected.pid)
    problems.push(`süreç değişti (${expected.pid} → ${snapshot.pid})`);
  return problems.length === 0
    ? { verdict: 'PASS', detail: `${snapshot.type} ${snapshot.width}×${snapshot.height}` }
    : { verdict: 'FAIL', detail: problems.join('; ') };
}

/** Kontrol listesinden tek hüküm: biri FAIL ise FAIL; hepsi NOT-RUN ise NOT-RUN; aksi PASS. */
export function overallVerdict(checks) {
  if (checks.some((check) => check.verdict === 'FAIL')) return 'FAIL';
  if (checks.length === 0 || checks.every((check) => check.verdict === 'NOT-RUN')) return 'NOT-RUN';
  return checks.some((check) => check.verdict === 'NOT-RUN') ? 'PARTIAL' : 'PASS';
}
