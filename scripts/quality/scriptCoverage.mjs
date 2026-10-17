import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { loadQualityConfig } from './config.mjs';
import { workingTreeFiles } from './gitFiles.mjs';

/**
 * Kapı kodunun (`scripts/**`) kendi kapsamı (F11.6).
 *
 * Kapılar paketlerin kapsamını ölçer ama kendilerini ölçmezdi: bir bekçide ölü dal ya da hiç
 * yüklenmeyen bir CLI görünmezdi. `contract` aşamasının `node --test` koşusu Node'un yerleşik
 * kapsamıyla koşar ve LCOV yazar; bu modül onu `quality.json` → `scriptCoverage` ile karşılaştırır.
 *
 * Node yalnız YÜKLENEN dosyayı raporlar; hiç yüklenmeyen betik tabloda görünmez. Bu yüzden izlenen
 * her betik LCOV'la karşılaştırılır: kaydı olmayan dosya `acknowledged` içinde gerekçesiyle
 * (hangi kapı ya da komut çalıştırır) yazılı olmak zorundadır.
 */

/** Node'un LCOV çıktısını yazdığı yer (`node_modules` altı: repoya girmez). */
export function scriptCoverageFile(root) {
  return join(root, 'node_modules', '.cache', 'vol-quality', 'scripts-coverage', 'lcov.info');
}

/**
 * @param {string} text LCOV içeriği
 * @param {string} root dosya yollarını kökten göreli yapmak için
 * @returns {Map<string, { lines: { found: number, hit: number }, branches: { found: number, hit: number }, functions: { found: number, hit: number } }>}
 */
export function parseLcov(text, root) {
  const records = new Map();
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      const file = relative(root, resolve(root, line.slice(3)))
        .split(sep)
        .join('/');
      current = {
        lines: { found: 0, hit: 0 },
        branches: { found: 0, hit: 0 },
        functions: { found: 0, hit: 0 },
      };
      records.set(file, current);
    } else if (current && line === 'end_of_record') {
      current = null;
    } else if (current) {
      const [key, value] = [
        line.slice(0, line.indexOf(':')),
        Number(line.slice(line.indexOf(':') + 1)),
      ];
      if (!Number.isFinite(value)) continue;
      if (key === 'LF') current.lines.found = value;
      else if (key === 'LH') current.lines.hit = value;
      else if (key === 'BRF') current.branches.found = value;
      else if (key === 'BRH') current.branches.hit = value;
      else if (key === 'FNF') current.functions.found = value;
      else if (key === 'FNH') current.functions.hit = value;
    }
  }
  return records;
}

const percent = (part) => (part.found === 0 ? 100 : (part.hit / part.found) * 100);

/** Kapsanan ve test/yardımcı olmayan betikler: LCOV'daki ve izlenen listedeki ortak kural. */
export function isGateScript(file) {
  return (
    /^scripts\/.+\.mjs$/.test(file) && !/(^|\/)tests\//.test(file) && !file.endsWith('.test.mjs')
  );
}

/**
 * @param {{ records: ReturnType<typeof parseLcov>, tracked: string[], config: object }} input
 *   `config` = `quality.json` → `scriptCoverage`
 * @returns {{ problems: string[], totals: { lines: number, branches: number, functions: number } }}
 */
export function evaluateScriptCoverage({ records, tracked, config }) {
  const problems = [];
  const acknowledged = config.acknowledged ?? {};
  const scripts = tracked.filter(isGateScript);
  const measured = [...records.keys()].filter(isGateScript);

  const sum = {
    lines: { found: 0, hit: 0 },
    branches: { found: 0, hit: 0 },
    functions: { found: 0, hit: 0 },
  };
  for (const file of measured) {
    const record = records.get(file);
    if (!record) continue;
    for (const key of Object.keys(sum)) {
      sum[key].found += record[key].found;
      sum[key].hit += record[key].hit;
    }
  }
  const totals = {
    lines: percent(sum.lines),
    branches: percent(sum.branches),
    functions: percent(sum.functions),
  };
  for (const key of ['lines', 'branches', 'functions']) {
    if (typeof config[key] === 'number' && totals[key] < config[key]) {
      problems.push(
        `scripts kapsamı ${key} %${totals[key].toFixed(2)}, eşik %${config[key]}. ` +
          'Bekçiye sınama ekle; eşiği düşürmek ratchetExceptions gerekçesi ister.',
      );
    }
  }

  for (const file of scripts) {
    if (!records.has(file) && !(file in acknowledged)) {
      problems.push(
        `${file}: hiçbir sınamada yüklenmiyor, kapsamı ölçülmüyor. Sınayın ya da quality.json → ` +
          'scriptCoverage.acknowledged içine hangi kapı/komut çalıştırdığını yazın.',
      );
    }
  }

  const minLines = config.minLines ?? 50;
  const floorPct = config.floorPct ?? 50;
  for (const file of measured) {
    const lines = records.get(file)?.lines;
    if (!lines) continue;
    if (lines.found >= minLines && percent(lines) < floorPct && !(file in acknowledged)) {
      problems.push(
        `${file}: ${lines.found} satırın %${percent(lines).toFixed(1)}'i kapsanıyor (taban %${floorPct}). ` +
          'Sınayın ya da gerekçesiyle scriptCoverage.acknowledged içine yazın.',
      );
    }
  }

  for (const [file, reason] of Object.entries(acknowledged)) {
    if (typeof reason !== 'string' || !reason.trim()) {
      problems.push(`scriptCoverage.acknowledged["${file}"]: gerekçe boş olamaz.`);
    }
    if (!tracked.includes(file)) {
      problems.push(`scriptCoverage.acknowledged["${file}"]: dosya yok; bayat kayıt, silin.`);
      continue;
    }
    const record = records.get(file);
    if (record && percent(record.lines) >= floorPct) {
      problems.push(
        `scriptCoverage.acknowledged["${file}"]: dosya artık %${percent(record.lines).toFixed(1)} kapsanıyor; ` +
          'bayat muafiyet, kaydı silin.',
      );
    }
  }

  return { problems, totals };
}

/**
 * `contract` node-test koşusundan sonra çağrılır.
 * @returns {string[]} sorunlar; LCOV yoksa tek sorun (kapsam koşusu çıktı üretmedi)
 */
export function checkScriptCoverage(root) {
  const config = loadQualityConfig(join(root, 'quality.json')).scriptCoverage;
  if (!config) return [];
  let text;
  try {
    text = readFileSync(scriptCoverageFile(root), 'utf8');
  } catch {
    return [
      'scripts kapsamı: LCOV çıktısı yok (node --test kapsam koşusu dosya üretmedi); eşik sınanamadı.',
    ];
  }
  const records = parseLcov(text, root);
  const tracked = workingTreeFiles(root, ['scripts/*.mjs']);
  return evaluateScriptCoverage({ records, tracked, config }).problems;
}
