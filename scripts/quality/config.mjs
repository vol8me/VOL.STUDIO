/**
 * `quality.json`un TEK okuyucusu ve doğrulayıcısı.
 *
 * Dosyayı hem `scripts/workspace-contract.mjs` hem beş `vitest.config.ts`
 * tüketiyor. Doğrulama olmadan bir yazım hatası (`floor` → `flor`) bekçiyi
 * teşhis edilemez bir çökmeye sürüklüyordu:
 *
 *     TypeError: Cannot convert undefined or null to object
 *         at workspace-contract.mjs:106
 *
 * Kapı kırıldığı için SESSİZ bir geçiş yoktu — ama hatayı okuyan kişi
 * `quality.json`a bakması gerektiğini anlayamıyordu. `games/design`
 * metadata'sı için yazılan doğrulayıcıyla aynı gerekçe ve aynı desen:
 * sorunlar TOPLANIR, ilk hatada durulmaz, mesaj nereye bakılacağını söyler.
 *
 * Harici bir şema kütüphanesi (zod vb.) bilinçli olarak eklenmedi: bu dosya
 * build öncesi, bağımlılıksız Node ile de koşabilmelidir.
 */

import { readFileSync } from 'node:fs';

/** Her paketin taşımak zorunda olduğu kapsam metrikleri. */
export const COVERAGE_KEYS = ['lines', 'statements', 'branches', 'functions'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Kapsam metrik bloğunu doğrular; bulunan sorunları `problems`a ekler.
 * `where` mesajlarda görünen yol (ör. `packages["@volstudio/core"]`).
 */
function checkMetricBlock(block, where, problems) {
  if (!isPlainObject(block)) {
    problems.push(`${where}: nesne olmalı (gelen: ${block === undefined ? 'yok' : typeof block})`);
    return;
  }

  for (const key of COVERAGE_KEYS) {
    const value = block[key];
    if (value === undefined) {
      problems.push(`${where}.${key}: eksik`);
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push(`${where}.${key}: sayı olmalı (gelen: ${JSON.stringify(value)})`);
      continue;
    }
    if (value < 0 || value > 100) {
      problems.push(`${where}.${key}: yüzde olmalı, 0-100 aralığında (gelen: ${value})`);
    }
  }

  for (const key of Object.keys(block)) {
    if (!COVERAGE_KEYS.includes(key)) {
      problems.push(`${where}.${key}: tanınmayan metrik. Beklenen: ${COVERAGE_KEYS.join(', ')}`);
    }
  }
}

/**
 * Ayrıştırılmış `quality.json` içeriğini doğrular.
 * @returns Sorun listesi; boşsa yapı geçerlidir.
 */
export function validateQualityConfig(raw) {
  const problems = [];

  if (!isPlainObject(raw)) {
    return ['quality.json: kök bir JSON nesnesi olmalı'];
  }

  checkMetricBlock(raw.floor, 'floor', problems);

  if (!isPlainObject(raw.packages)) {
    problems.push('packages: nesne olmalı (paket adı → kapsam eşikleri)');
  } else {
    const names = Object.keys(raw.packages);
    if (names.length === 0) {
      problems.push('packages: boş. Eşiksiz paket kapsam gerilemesini yakalamaz.');
    }
    for (const name of names) {
      checkMetricBlock(raw.packages[name], `packages[${JSON.stringify(name)}]`, problems);
    }
  }

  if (raw.exempt !== undefined) {
    if (!isPlainObject(raw.exempt)) {
      problems.push('exempt: nesne olmalı (paket adı → gerekçe metni)');
    } else {
      for (const [name, reason] of Object.entries(raw.exempt)) {
        if (typeof reason !== 'string' || reason.trim() === '') {
          problems.push(`exempt[${JSON.stringify(name)}]: gerekçe boş olamaz. Sessiz muafiyet yok.`);
        }
      }
    }
  }

  // Muaf bir paket aynı anda eşik taşıyorsa hangisinin geçerli olduğu belirsiz.
  if (isPlainObject(raw.exempt) && isPlainObject(raw.packages)) {
    for (const name of Object.keys(raw.exempt)) {
      if (raw.packages[name]) {
        problems.push(
          `${name}: hem "exempt" hem "packages" içinde. Muafiyet mi eşik mi geçerli, belirsiz.`,
        );
      }
    }
  }

  return problems;
}

/**
 * `quality.json`u okur, doğrular ve döner. Geçersizse TÜM sorunları listeleyen
 * tek bir hata fırlatır.
 */
export function loadQualityConfig(path) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`quality.json okunamadı (${path}): ${error.message}`);
  }

  const problems = validateQualityConfig(raw);
  if (problems.length > 0) {
    throw new Error(
      `quality.json geçersiz (${problems.length} sorun):\n` +
        problems.map((p) => `  ✗ ${p}`).join('\n'),
    );
  }
  return raw;
}
