import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Kabul edilmiş bağımlılık riskleri (`securityPolicy.json`) ve doğrulayıcısı.
 * `jsAudit.mjs` ve `rustAudit.mjs` advisory'leri bu kayıtlarla eşler; kayıtsız
 * her advisory kapıyı düşürür. Kayıt eklemek gerekçe, sahip ve kaldırma koşulu
 * yazmadan mümkün değildir.
 */

/** Rust'ta istisna alabilen advisory türleri; zafiyet ve yanked hiçbir zaman alamaz. */
export const RUST_EXCEPTION_KINDS = ['unmaintained', 'unsound'];

const COMMON_FIELDS = [
  'advisory',
  'version',
  'reason',
  'exposure',
  'owner',
  'removeWhen',
  'reviewed',
];

const isText = (value) => typeof value === 'string' && value.trim().length > 0;

function checkEntries(entries, where, identity, extra, problems) {
  if (!Array.isArray(entries)) {
    problems.push(`${where}: dizi olmalı`);
    return;
  }
  const seen = new Set();
  entries.forEach((entry, index) => {
    const label = `${where}[${index}]${isText(entry?.advisory) ? ` (${entry.advisory})` : ''}`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      problems.push(`${label}: nesne olmalı`);
      return;
    }
    for (const field of [...COMMON_FIELDS, identity, ...extra.text]) {
      if (!isText(entry[field])) problems.push(`${label}.${field}: boş olmayan metin olmalı`);
    }
    if (isText(entry.advisory) && !extra.advisory.test(entry.advisory)) {
      problems.push(`${label}.advisory: ${extra.advisoryHint} biçiminde olmalı`);
    }
    for (const field of extra.list ?? []) {
      if (
        !Array.isArray(entry[field]) ||
        entry[field].length === 0 ||
        !entry[field].every(isText)
      ) {
        problems.push(`${label}.${field}: boş olmayan metin dizisi olmalı`);
      }
    }
    const key = `${entry.advisory}|${entry[identity]}|${entry.version}`;
    if (seen.has(key)) problems.push(`${label}: aynı advisory/paket/sürüm iki kez yazılmış`);
    seen.add(key);
  });
}

/** Politika yapısını doğrular; boş liste geçerli politikadır. */
export function validateSecurityPolicy(policy) {
  const problems = [];
  if (typeof policy !== 'object' || policy === null || Array.isArray(policy)) {
    return ['securityPolicy.json: kök bir JSON nesnesi olmalı'];
  }
  checkEntries(
    policy.js,
    'js',
    'package',
    {
      text: ['patch'],
      advisory: /^GHSA(-[2-9cfghjmpqrvwx]{4}){3}$/,
      advisoryHint: 'GHSA-xxxx-xxxx-xxxx',
    },
    problems,
  );
  checkEntries(
    policy.rust,
    'rust',
    'crate',
    {
      text: ['kind', 'via'],
      list: ['platforms'],
      advisory: /^RUSTSEC-\d{4}-\d{4}$/,
      advisoryHint: 'RUSTSEC-YYYY-NNNN',
    },
    problems,
  );
  for (const [index, entry] of (Array.isArray(policy.rust) ? policy.rust : []).entries()) {
    if (isText(entry?.kind) && !RUST_EXCEPTION_KINDS.includes(entry.kind)) {
      problems.push(
        `rust[${index}].kind: "${entry.kind}" istisna alamaz. İzinli: ${RUST_EXCEPTION_KINDS.join(', ')}`,
      );
    }
  }
  return problems;
}

export function loadSecurityPolicy(root) {
  const policy = JSON.parse(
    readFileSync(join(root, 'scripts/quality/securityPolicy.json'), 'utf8'),
  );
  const problems = validateSecurityPolicy(policy);
  if (problems.length > 0) {
    throw new Error(`securityPolicy.json geçersiz:\n  ${problems.join('\n  ')}`);
  }
  return policy;
}

/** Düşen güvenlik aşamasının yapılandırılmış işareti; `classify` (report.mjs) okur. */
export function failureMarker(kind, count) {
  return `##quality:${JSON.stringify({ kind, count })}`;
}
