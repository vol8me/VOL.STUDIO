/**
 * Aşama başına test sayımı ve atlama bütçesi (F11.3).
 *
 * Kapı çıktısı yalnız durum ve süre taşırdı: bir e2e aşaması "geçti" derken kaç testin atlandığı
 * görünmez, atlama sayısı da istenildiği kadar artabilirdi (WebKit'te gerçek dokunma, Web Audio,
 * layout-shift ve pano kanıtı atlanır). Bu modül sayımı çıktıdan okur ve `quality.json` →
 * `skipBudget` ile karşılaştırır.
 *
 * Okuma sırası `report.mjs` ile aynı gerekçedendir: önce kendi ürettiğimiz yapılandırılmış satır
 * (`##counts:` — Playwright raporlayıcımız yazar), sonra üçüncü parti insan çıktısı (`node --test`
 * TAP özeti). Üçüncü parti biçimi değişirse sayım kaybolur; bütçesi olan aşamada sayım kaybı
 * "atlama sayısı bilinmiyor" diye düşer, sessiz yeşil olmaz.
 */

export const COUNTS_MARKER = '##counts:';

/** @typedef {{ key: string, passed: number, skipped: number, failed: number, flaky: number }} CountRow */

/** Playwright raporlayıcısının ve ayrıştırıcının ortak satır biçimi. */
export function formatCounts(row) {
  const { key, passed, skipped, failed, flaky } = row;
  return `${COUNTS_MARKER}${JSON.stringify({ key, passed, skipped, failed, flaky })}`;
}

const isCount = (value) => Number.isInteger(value) && value >= 0;

/**
 * @param {string} output aşama çıktısı
 * @param {{ fallbackKey?: string }} [options] işaret yoksa TAP özetinin anahtarı
 * @returns {CountRow[]} aynı anahtar son görülenle değiştirilir, sıra korunur
 */
export function parseCounts(output, options = {}) {
  const rows = new Map();
  for (const line of output.split(/\r?\n/)) {
    const at = line.indexOf(COUNTS_MARKER);
    if (at < 0) continue;
    try {
      const row = JSON.parse(line.slice(at + COUNTS_MARKER.length));
      if (
        typeof row.key === 'string' &&
        row.key &&
        [row.passed, row.skipped, row.failed, row.flaky].every(isCount)
      ) {
        rows.set(row.key, {
          key: row.key,
          passed: row.passed,
          skipped: row.skipped,
          failed: row.failed,
          flaky: row.flaky,
        });
      }
    } catch {
      // Bozuk işaret sayımı kaybettirir; bütçeli aşamada bu "sayım yok" olarak düşer.
    }
  }

  if (rows.size === 0 && options.fallbackKey) {
    const tap = parseTapSummary(output);
    if (tap) rows.set(options.fallbackKey, { key: options.fallbackKey, ...tap });
  }
  return [...rows.values()];
}

/** `node --test` TAP özeti: `# pass N`, `# fail N`, `# skipped N`, `# todo N`. */
function parseTapSummary(output) {
  const field = (name) => {
    const matches = [...output.matchAll(new RegExp(`^# ${name} (\\d+)\\s*$`, 'gm'))];
    return matches.length > 0 ? Number(matches[matches.length - 1][1]) : null;
  };
  const tests = field('tests');
  const passed = field('pass');
  const failed = field('fail');
  const skipped = field('skipped');
  if (tests === null || passed === null || failed === null || skipped === null) return null;
  return { passed, skipped, failed, flaky: 0 };
}

/** Birden çok satırın toplamı; aşama çıktısındaki tek özet için. */
export function totalCounts(rows) {
  return rows.reduce(
    (sum, row) => ({
      passed: sum.passed + row.passed,
      skipped: sum.skipped + row.skipped,
      failed: sum.failed + row.failed,
      flaky: sum.flaky + row.flaky,
    }),
    { passed: 0, skipped: 0, failed: 0, flaky: 0 },
  );
}

/** Kapı çıktısındaki kısa sayım metni; satır yoksa boş. */
export function describeCounts(rows) {
  if (rows.length === 0) return '';
  const total = totalCounts(rows);
  const parts = [`${total.passed} geçti`];
  if (total.skipped > 0) parts.push(`${total.skipped} atlandı`);
  if (total.flaky > 0) parts.push(`${total.flaky} kararsız`);
  if (total.failed > 0) parts.push(`${total.failed} düştü`);
  return parts.join(', ');
}

/**
 * Bir aşamanın sayımlarını bütçeyle karşılaştırır.
 *
 * - Bütçede olmayan anahtar 0 atlama hakkına sahiptir: yeni bir motor/şerit/paket atlama getirirse
 *   bütçeye gerekçesiyle yazılmadıkça düşer.
 * - `owed` anahtarlarının satırı hiç gelmediyse sayım bilinmiyordur; bu hata sayılır.
 *
 * @param {CountRow[]} rows aşamanın tüm koşan/önbellekli satırları
 * @param {Record<string, number>} budget anahtar → izin verilen en çok atlama
 * @param {string[]} [owed] bu koşuda satırı üretmesi gereken bütçe anahtarları
 * @returns {string[]} sorun listesi
 */
export function checkSkipBudget(rows, budget, owed = []) {
  const problems = [];
  for (const row of rows) {
    const allowed = budget[row.key] ?? 0;
    if (row.skipped > allowed) {
      problems.push(
        `${row.key}: ${row.skipped} atlama, bütçe ${allowed}${
          row.key in budget ? '' : ' (anahtar bütçede yok)'
        }. Atlamayı kaldır ya da quality.json → skipBudget'ı gerekçesiyle yükselt.`,
      );
    }
  }
  const seen = new Set(rows.map((row) => row.key));
  for (const key of owed) {
    if (!seen.has(key)) {
      problems.push(
        `${key}: bütçesi var ama sayım okunamadı; atlama sayısı bilinmiyor (çıktı biçimi değişmiş olabilir).`,
      );
    }
  }
  return problems;
}
