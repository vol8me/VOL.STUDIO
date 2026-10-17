/**
 * Son yeşil `signoff` kaydı (F11.7).
 *
 * Kancalar `high`i koşturur, `signoff` (iki motorlu e2e dahil) pahalı olduğu için push'ta yoktur; bu
 * yüzden `high` yeşilken `signoff` günlerce koşulmamış olabilir ve bunu hiçbir çıktı söylemezdi. Bu
 * modül yeşil `signoff`un ağaç karmasını ve commit'ini makineye özel önbellekte tutar; `high` çıktısı
 * yaşını ve ağacın değişip değişmediğini yazar.
 *
 * Kayıt yalnız bilgi içindir: kapıyı geçirmez ya da düşürmez, makbuz gibi atlama kararı vermez ve
 * imzasızdır (elle yazılabilir). Başka makinedeki bir `signoff`u kanıtlamaz.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { receiptDirectory } from './gateCache.mjs';

export function signoffRecordFile(root) {
  return join(receiptDirectory(root), '..', 'signoff.json');
}

/**
 * @param {string} root
 * @param {{ treeDigest: string, commit: string | null, passedAt: string, durationMs: number }} record
 */
export function writeSignoffRecord(root, record) {
  const file = signoffRecordFile(root);
  mkdirSync(join(file, '..'), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temp, file);
}

/** Geçerli kayıt ya da `null`; bozuk/eksik dosya "kayıt yok" sayılır. */
export function readSignoffRecord(root) {
  try {
    const record = JSON.parse(readFileSync(signoffRecordFile(root), 'utf8'));
    const valid =
      typeof record?.treeDigest === 'string' &&
      typeof record?.passedAt === 'string' &&
      Number.isFinite(Date.parse(record.passedAt));
    return valid
      ? {
          treeDigest: record.treeDigest,
          commit: typeof record.commit === 'string' ? record.commit : null,
          passedAt: record.passedAt,
          durationMs: Number.isFinite(record.durationMs) ? record.durationMs : 0,
        }
      : null;
  } catch {
    return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

function humanAge(ms) {
  if (ms < 90_000) return 'az önce';
  if (ms < 90 * 60_000) return `${Math.round(ms / 60_000)} dk önce`;
  if (ms < 2 * DAY_MS) return `${(ms / (60 * 60_000)).toFixed(1)} sa önce`;
  return `${Math.round(ms / DAY_MS)} gün önce`;
}

/**
 * Kaydı şimdiki ağaçla karşılaştırır.
 *
 * `same` ağaç karmasının bayt bayt eşit olduğu; `changed` ağacın o günden beri değiştiği; `none` hiç
 * yeşil kayıt olmadığı demektir. `commitsSince` kayıttaki commit ile HEAD arasındaki commit sayısıdır
 * (bilinmiyorsa `null`: commit yeniden yazılmış ya da erişilemiyor).
 *
 * @param {{ record: ReturnType<typeof readSignoffRecord>, treeDigest: string, now: number, commitsSince: number | null }} input
 * @returns {{ state: 'none' | 'same' | 'changed', ageMs: number | null, commitsSince: number | null, message: string }}
 */
export function describeSignoff({ record, treeDigest, now, commitsSince }) {
  if (!record) {
    return {
      state: 'none',
      ageMs: null,
      commitsSince: null,
      message:
        'uyarı: bu makinede yeşil `signoff` kaydı yok; push kapısı `high` iki motorlu e2e içermez (`pnpm signoff`).',
    };
  }
  const ageMs = Math.max(0, now - Date.parse(record.passedAt));
  if (record.treeDigest === treeDigest) {
    return {
      state: 'same',
      ageMs,
      commitsSince,
      message: `son yeşil signoff ${humanAge(ageMs)}; ağaç bayt bayt aynı.`,
    };
  }
  const drift =
    commitsSince === null
      ? 'ağaç değişti (commit farkı bilinmiyor)'
      : commitsSince === 0
        ? 'ağaç değişti (commit aynı, çalışma ağacı farklı)'
        : `ağaç değişti (${commitsSince} commit sonrası)`;
  return {
    state: 'changed',
    ageMs,
    commitsSince,
    message: `uyarı: son yeşil signoff ${humanAge(ageMs)}; ${drift}; bu ağaç için e2e koşulmadı (\`pnpm signoff\`).`,
  };
}
