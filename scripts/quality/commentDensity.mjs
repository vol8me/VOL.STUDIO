/**
 * Yorum yoğunluğu kapısı.
 *
 * Yorumlar tek tek masum, toplu hâlde yüktür: her biri okunacak, bakılacak ve
 * bayatlayacak. Varsayılan "yorum yok"tur; bu kapı o
 * varsayılanın ölçülebilir hâlidir.
 *
 * Eşik BÖLMEYİ değil GEREKÇEYİ dayatır: bazı dosyalar meşru biçimde yoğundur
 * (tip bildirimi alan başına tek satır açıklama taşır), bazıları ise anlatı
 * biriktirmiştir. İkisini ayırt eden tek şey, birinin yazılmış olmasıdır.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/** Ölçülen kaynak türleri: kod, betik, stil ve native. */
export const SOURCE_PATTERNS = ['*.ts', '*.mjs', '*.js', '*.rs', '*.css', '*.kt'];

/** Duraksama oranı: bunun üstünde dosya kodundan çok anlatı taşıyordur. */
export const DENSITY_THRESHOLD = 0.4;

/** Oranın anlamlı olduğu en küçük dosya; kısa dosyada tek blok oranı uçurur. */
export const MIN_LINES = 60;

/**
 * Tek bir yorum bloğunun duraksama uzunluğu.
 *
 * Oran tek başına yetmez: 800 satırlık bir dosya 60 satırlık bir mimari
 * anlatıyı oranı bozmadan taşıyabilir. Uzun blok ayrı bir kokudur — o
 * uzunluktaki bir metin bir belgedir, ve belgeler `docs/` ile `DESIGN.md`
 * dosyalarında yaşar; orada aranır, bağlanır ve tek yerde güncellenir.
 */
export const MAX_BLOCK_LINES = 24;

/** Eşiği bilinçli aşan dosyalar ve gerekçeleri. */
export const ACKNOWLEDGED = {
  'core/src/constants.ts': 'Sabit kataloğu: her sabit birimini ve sınırını tek satırda taşır.',
  'core/src/audio/music/types.ts': 'Tip bildirimi — alan başına tek satır sözleşme.',
  'core/src/rig/types.ts': 'Tip bildirimi; poz sinyallerinin anlamı alan başına yazılır.',
  'core/src/diagnostics/types.ts': 'Tip bildirimi — snapshot alanlarının anlamı.',
  'core/src/ui/cards/ShopPickerTypes.ts': 'Tip bildirimi — seçenek sözleşmesi.',
  'devtools/audio-synth/src/types.ts':
    'Sentez parametrelerinin tip bildirimi; her alan birimini ve varsayılanını taşır.',
};

/**
 * @param root Repo kökü.
 * @param acknowledged Gerekçe haritası; testler kendi haritasını verir.
 * @param threshold Yoğunluk eşiği (0-1).
 * @returns Sorun listesi; boşsa her aşım gerekçeli.
 */
export function validateCommentDensity(
  root,
  acknowledged = ACKNOWLEDGED,
  threshold = DENSITY_THRESHOLD,
  lifecycle = loadRepoLifecycle(root),
) {
  const files = excludingFrozenPaths(workingTreeFiles(root, SOURCE_PATTERNS), lifecycle)
    .filter((file) => !file.endsWith('.d.ts'))
    .filter((file) => !/\.test\.|\.spec\.|(^|\/)tests?\//.test(file));

  const problems = [];
  const dense = new Set();

  for (const file of files) {
    let lines;
    try {
      lines = readFileSync(join(root, file), 'utf8').split('\n');
    } catch {
      continue;
    }
    if (lines.length < MIN_LINES) continue;

    const flags = commentLines(lines, file.endsWith('.css'));
    const longest = longestCommentBlock(flags);
    if (longest.length > MAX_BLOCK_LINES) {
      problems.push(
        `${file}:${longest.start}: ${longest.length} satırlık tek yorum bloğu ` +
          `(eşik ${MAX_BLOCK_LINES}). Sözleşmeyi bırak, anlatıyı DESIGN.md'ye taşı.`,
      );
    }

    const comments = flags.filter(Boolean).length;
    const ratio = comments / lines.length;
    if (ratio <= threshold) continue;

    dense.add(file);
    if (!(file in acknowledged)) {
      problems.push(
        `${file}: yorum oranı %${Math.round(ratio * 100)} (${comments}/${
          lines.length
        }, eşik %${Math.round(threshold * 100)}) ` +
          've gerekçesi YOK. Sadeleştir, ya da neden yoğun kalması gerektiğini `ACKNOWLEDGED`e yaz.',
      );
    }
  }

  for (const file of Object.keys(acknowledged)) {
    if (!dense.has(file)) {
      problems.push(
        `${file}: eşiğin ALTINA indi ama gerekçesi duruyor — ölü muafiyet kaldırılmalı.`,
      );
    }
  }

  return problems;
}

/**
 * Satır başına "yalnız yorum" bayrağı. Blok yorumun içindeki ve `//` ile
 * başlayan satırlar yorumdur; CSS'te yalnız blok yorum vardır.
 */
export function commentLines(lines, blockOnly = false) {
  let inBlock = false;
  return lines.map((line) => {
    const text = line.trim();
    if (inBlock) {
      if (text.includes('*/')) inBlock = false;
      return true;
    }
    if (text.startsWith('/*')) {
      inBlock = !text.includes('*/', 2);
      return true;
    }
    return !blockOnly && text.startsWith('//');
  });
}

/**
 * @param flags Satır başına yorum bayrakları.
 * @returns En uzun kesintisiz yorum bloğunun uzunluğu ve 1-tabanlı başlangıcı.
 */
function longestCommentBlock(flags) {
  let best = { length: 0, start: 0 };
  let run = 0;
  let start = 0;
  for (let index = 0; index < flags.length; index++) {
    if (flags[index]) {
      if (run === 0) start = index + 1;
      run += 1;
      if (run > best.length) best = { length: run, start };
    } else {
      run = 0;
    }
  }
  return best;
}
