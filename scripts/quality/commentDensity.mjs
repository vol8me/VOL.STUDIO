/**
 * Yorum yoğunluğu kapısı.
 *
 * Yorumlar tek tek masum, toplu hâlde yüktür: her biri okunacak, bakılacak ve
 * bayatlayacak. Doktrin (AGENTS.md) varsayılanı "yorum yok" yapar; bu kapı o
 * varsayılanın ölçülebilir hâlidir.
 *
 * Eşik BÖLMEYİ değil GEREKÇEYİ dayatır: bazı dosyalar meşru biçimde yoğundur
 * (tip bildirimi alan başına tek satır açıklama taşır), bazıları ise anlatı
 * biriktirmiştir. İkisini ayırt eden tek şey, birinin yazılmış olmasıdır.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/** Doktrinin duraksama oranı (AGENTS.md, Yorum Doktrini). */
export const DENSITY_THRESHOLD = 0.4;

/** Oranın anlamlı olduğu en küçük dosya; kısa dosyada tek blok oranı uçurur. */
export const MIN_LINES = 60;

/** Eşiği bilinçli aşan dosyalar ve gerekçeleri. */
export const ACKNOWLEDGED = {
  'core/src/constants.ts': 'Sabit kataloğu: her sabit birimini ve sınırını tek satırda taşır.',
  'core/src/audio/music/types.ts': 'Tip bildirimi — alan başına tek satır sözleşme.',
  'core/src/rig/types.ts': 'Tip bildirimi; poz sinyallerinin anlamı alan başına yazılır.',
  'core/src/debug/types.ts': 'Tip bildirimi — snapshot alanlarının anlamı.',
  'core/src/ui/cards/ShopPickerTypes.ts': 'Tip bildirimi — seçenek sözleşmesi.',
  'games/vol-hell/src/config/enemies/types.ts': 'Tip bildirimi — arketip alanları.',
  'games/vol-hell/src/config/cards/types.ts': 'Tip bildirimi — kart alanları.',
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
  const files = execFileSync('git', ['ls-files', '*.ts', '*.mjs'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !file.includes('node_modules') && !file.endsWith('.d.ts'))
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
