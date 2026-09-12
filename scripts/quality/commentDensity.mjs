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
  'core/src/debug/types.ts': 'Tip bildirimi — snapshot alanlarının anlamı.',
  'core/src/ui/cards/ShopPickerTypes.ts': 'Tip bildirimi — seçenek sözleşmesi.',
  'games/vol-hell/src/config/enemies/types.ts': 'Tip bildirimi — arketip alanları.',
  'games/vol-hell/src/config/cards/types.ts': 'Tip bildirimi — kart alanları.',
  'games/vol-life/src/config/world.ts':
    'Yapılandırma bildirimi — alan başına tek satır sözleşme; adım tavanı ' +
    'blokları ölüm-sarmalı ve tekrar-kipi gerekçesini taşır.',
  'devtools/audio-synth/src/types.ts':
    'Sentez parametrelerinin tip bildirimi; her alan birimini ve varsayılanını taşır.',
  'devtools/visual-synth/src/field/domain.ts':
    'Alan-uzayı işlemleri: her biri TERS eşlemedir ve tersinin ne olduğu ' +
    'imzadan çıkarılamaz — koddan okunamayan matematik burada yazılır.',
  'devtools/vol-ui/playwright.config.ts':
    'Görsel kapının KENDİ sözleşmesi: sıfır toleransın neden ölçüme dayandığı ' +
    've temellerin neden makine ailesine bağlı olduğu yazılı olmazsa ilk ' +
    'kırılmada tolerans açılır ve kapı ölür.',
  'games/vol-arachnid/src/config/gait.ts':
    'Yürüyüş ayarı: her alan bir duruş sözleşmesi taşır (neden uzuv başına, ' +
    'hangi sınır neyi engelliyor) ve sayıdan çıkarılamaz.',
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
) {
  const files = workingTreeFiles(root, ['*.ts', '*.mjs'])
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

    const longest = longestCommentBlock(lines);
    if (longest.length > MAX_BLOCK_LINES) {
      problems.push(
        `${file}:${longest.start}: ${longest.length} satırlık tek yorum bloğu ` +
          `(eşik ${MAX_BLOCK_LINES}). Sözleşmeyi bırak, anlatıyı DESIGN.md'ye taşı.`,
      );
    }

    const comments = lines.filter((line) => /^\s*(\/\/|\*|\/\*)/.test(line)).length;
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
 * @param lines Dosya satırları.
 * @returns En uzun kesintisiz yorum bloğunun uzunluğu ve 1-tabanlı başlangıcı.
 */
function longestCommentBlock(lines) {
  let best = { length: 0, start: 0 };
  let run = 0;
  let start = 0;
  for (let index = 0; index < lines.length; index++) {
    if (/^\s*(\/\/|\*|\/\*)/.test(lines[index])) {
      if (run === 0) start = index + 1;
      run += 1;
      if (run > best.length) best = { length: run, start };
    } else {
      run = 0;
    }
  }
  return best;
}
