import { execFileSync } from 'node:child_process';
import { COVERAGE_KEYS } from './config.mjs';

/**
 * Kalite eşikleri için base-ref ratchet'i (F11.4, F10.3).
 *
 * `quality.json` "eşikler yalnız yükselir" der ama kapı yalnız mutlak tabanı (`floor`) sınar:
 * çekirdek satır eşiği 90'dan 60'a düşürülünce hiçbir kapı düşmezdi. Bu bekçi çalışma ağacındaki
 * eşikleri entegrasyon dalındaki (`dev`, yoksa `main`) kendi tabanıyla karşılaştırır ve her
 * gevşemeyi — eşik düşürme, paket eşiğini silme, yeni muafiyet, daha gevşek şekil sınırı —
 * yalnız `quality.json` → `ratchetExceptions` içinde gerekçesiyle kayıtlıysa kabul eder.
 *
 * Taban `HEAD` ile ref'in merge-base'idir: dal üzerindeki önceki commit'te yapılmış bir
 * düşürme de taban dala göre görünür kalır. İstisna, dal taban dala birleşince tabanla eşitlenir
 * ve etkisizleşir; o zaman kaldırılabilir.
 */

/** Sırayla denenir; ilk bulunan taban olur. */
export const RATCHET_BASE_REFS = ['origin/dev', 'dev', 'origin/main', 'main'];

function git(root, args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * `quality.json` içeren ilk taban ref'in merge-base'i.
 * @returns {{ ref: string, commit: string, blob: string } | null}
 */
export function resolveRatchetBase(root, refs = RATCHET_BASE_REFS) {
  for (const ref of refs) {
    const commit = git(root, ['merge-base', 'HEAD', ref]);
    if (!commit) continue;
    const blob = git(root, ['rev-parse', `${commit}:quality.json`]);
    if (blob) return { ref, commit, blob };
  }
  return null;
}

/** Taban dosyanın içeriği; yoksa ya da okunamıyorsa `null`. */
function readBaseConfig(root, base) {
  const text = git(root, ['show', `${base.commit}:quality.json`]);
  if (text === null) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Konfigürasyonu karşılaştırılabilir kayıtlara düzleştirir.
 *
 * `higher`: değer düşerse gevşemedir. `lower`: değer artarsa gevşemedir. `ceiling`: `lower` gibidir
 * ama kayıt tabanda yoksa değeri 0 sayılır (bütçesiz anahtar atlama hakkı taşımaz). `present`: kayıt
 * silinirse, `absent`: kayıt eklenirse gevşemedir.
 *
 * @returns {Map<string, { kind: 'higher' | 'lower' | 'ceiling' | 'present' | 'absent', value: number | null }>}
 */
export function thresholdEntries(config) {
  const entries = new Map();
  const add = (key, kind, value = null) => entries.set(key, { kind, value });

  for (const metric of COVERAGE_KEYS) {
    if (isNumber(config?.floor?.[metric])) add(`floor.${metric}`, 'higher', config.floor[metric]);
  }
  for (const [name, block] of Object.entries(config?.packages ?? {})) {
    add(`packages[${JSON.stringify(name)}]`, 'present');
    for (const metric of COVERAGE_KEYS) {
      if (isNumber(block?.[metric])) {
        add(`packages[${JSON.stringify(name)}].${metric}`, 'higher', block[metric]);
      }
    }
  }
  for (const name of Object.keys(config?.exempt ?? {})) {
    add(`exempt[${JSON.stringify(name)}]`, 'absent');
  }
  for (const [stage, budget] of Object.entries(config?.skipBudget ?? {})) {
    for (const [key, value] of Object.entries(budget ?? {})) {
      if (isNumber(value))
        add(`skipBudget[${JSON.stringify(stage)}][${JSON.stringify(key)}]`, 'ceiling', value);
    }
  }
  const scripts = config?.scriptCoverage;
  for (const metric of ['lines', 'branches', 'functions', 'floorPct']) {
    if (isNumber(scripts?.[metric])) add(`scriptCoverage.${metric}`, 'higher', scripts[metric]);
  }
  if (isNumber(scripts?.minLines)) add('scriptCoverage.minLines', 'lower', scripts.minLines);
  for (const file of Object.keys(scripts?.acknowledged ?? {})) {
    add(`scriptCoverage.acknowledged[${JSON.stringify(file)}]`, 'absent');
  }
  const shape = config?.coverageShape;
  if (isNumber(shape?.minLines)) add('coverageShape.minLines', 'lower', shape.minLines);
  if (isNumber(shape?.floorPct)) add('coverageShape.floorPct', 'higher', shape.floorPct);
  return entries;
}

/**
 * Tabandan gevşeyen eşikleri bulur.
 *
 * @param {object} baseConfig
 * @param {object} headConfig
 * @param {{ label?: string }} [options] iletide görünen taban adı
 * @returns {string[]} sorun listesi
 */
export function compareThresholds(baseConfig, headConfig, options = {}) {
  const label = options.label ?? 'taban';
  const exceptions = Array.isArray(headConfig?.ratchetExceptions)
    ? headConfig.ratchetExceptions
    : [];
  const base = thresholdEntries(baseConfig);
  const head = thresholdEntries(headConfig);
  const problems = [];
  // Taban hiç atlama bütçesi taşımıyorsa ilk benimseme gevşeme değil, ölçümün kaydıdır.
  const baseHasBudget = baseConfig?.skipBudget !== undefined;

  const excused = (key, to) =>
    exceptions.some(
      (entry) =>
        entry?.key === key &&
        (entry.to ?? null) === to &&
        typeof entry.reason === 'string' &&
        entry.reason.trim() !== '',
    );
  const hint = (key, to) =>
    `Gevşetme bilinçliyse quality.json → ratchetExceptions içine ` +
    `{ "key": ${JSON.stringify(key)}, "to": ${JSON.stringify(to)}, "reason": "…" } yaz; ` +
    `yoksa eşiği geri yükselt.`;

  for (const [key, before] of base) {
    const after = head.get(key);
    if (before.kind === 'present') {
      if (!after && !excused(key, null)) {
        problems.push(
          `${key}: kapsam eşiği kaydı silindi (${label} taşıyordu); paket artık eşiksiz. ${hint(key, null)}`,
        );
      }
      continue;
    }
    if (before.kind === 'absent') continue;
    if (!after) continue; // üst paket kaydı silindiyse onun satırı bildirir
    const was = before.value;
    const now = after.value;
    if (was === null || now === null) continue; // sayısal türlerde değer her zaman vardır
    const loosened = before.kind === 'higher' ? now < was : now > was;
    if (loosened && !excused(key, now)) {
      problems.push(
        `${key}: ${was} → ${now} (${label}); eşik ${
          before.kind === 'higher' ? 'düşürüldü' : 'gevşetildi'
        }. ${hint(key, now)}`,
      );
    }
  }

  for (const [key, after] of head) {
    if (
      after.kind === 'ceiling' &&
      baseHasBudget &&
      !base.has(key) &&
      after.value !== null &&
      after.value > 0 &&
      !excused(key, after.value)
    ) {
      problems.push(
        `${key}: yeni atlama bütçesi ${after.value} (${label}te anahtar yoktu, 0 sayılır). ${hint(key, after.value)}`,
      );
    }
    // Bölüm tabanda hiç yoksa ilk benimseme gevşeme değil, mevcut durumun kaydıdır.
    const adopted = key.startsWith('scriptCoverage.') && baseConfig?.scriptCoverage === undefined;
    if (after.kind === 'absent' && !adopted && !base.has(key) && !excused(key, null)) {
      problems.push(`${key}: yeni muafiyet eklendi (${label}te yoktu). ${hint(key, null)}`);
    }
  }
  return problems;
}

/**
 * Çalışma ağacındaki eşikleri taban ref'le karşılaştırır.
 *
 * @param {string} root
 * @param {object} headConfig doğrulanmış `quality.json`
 * @param {{ refs?: string[] }} [options]
 * @returns {{ problems: string[], note: string | null, base: ReturnType<typeof resolveRatchetBase> }}
 *   `note` taban bulunamadığında doludur: ratchet koşmadı, "geçti" sayılmaz.
 */
export function validateThresholdRatchet(root, headConfig, options = {}) {
  const base = resolveRatchetBase(root, options.refs);
  const baseConfig = base ? readBaseConfig(root, base) : null;
  if (!base || !baseConfig) {
    return {
      problems: [],
      base: null,
      note:
        "eşik ratchet'i koşmadı (NOT-RUN): taban ref bulunamadı " +
        `(${(options.refs ?? RATCHET_BASE_REFS).join(', ')}).`,
    };
  }
  return {
    problems: compareThresholds(baseConfig, headConfig, {
      label: `${base.ref}@${base.commit.slice(0, 8)}`,
    }),
    base,
    note: null,
  };
}
