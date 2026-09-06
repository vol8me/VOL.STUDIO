/**
 * Hiçbir yerden kullanılmayan i18n anahtarlarını bulur.
 *
 * Çeviri anahtarı sessizce ölür: kodu silen kişi `tr.json`/`en.json` girdisini
 * unutur, kimse fark etmez, dosya büyür. Ölü anahtarın bedeli yalnız satır
 * değildir — çevirmen onu çevirir, gözden geçiren onu okur.
 *
 * ZORLUK: anahtarların bir kısmı ÇALIŞMA ZAMANINDA kurulur
 * (`` t(`touch.dir_${direction}`) ``) ve statik aramayla BULUNAMAZ. Böyle bir
 * anahtarı "ölü" saymak, çalışan arayüzü bozacak bir silme önerir.
 *
 * Bu yüzden dinamik önekler BEYAN EDİLİR ve beyan doğrulanır: bildirilen
 * önek için kodda gerçekten bir template literal olmalıdır. Aksi halde liste
 * bir çöplüğe döner ve kapı hiçbir şey korumaz.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Çalışma zamanında kurulan anahtarlar — TAM liste, önek değil.
 *
 * Önek muafiyeti (`settings.` gibi) bütün namespace'i kapatır ve kapıyı
 * işlevsiz kılar: ölü bir `settings.foo` sızdığında kimse görmez. Muafiyet
 * anahtar anahtar verilir; `prefix` yalnız o anahtarı ÜRETEN template
 * literal'i doğrulamak için taşınır, kod silinirse muafiyet de düşer.
 */
export const DYNAMIC_KEYS = [
  { key: 'touch.dir_up', prefix: 'touch.dir_' },
  { key: 'touch.dir_down', prefix: 'touch.dir_' },
  { key: 'touch.dir_left', prefix: 'touch.dir_' },
  { key: 'touch.dir_right', prefix: 'touch.dir_' },
];

function gitFiles(root, pattern) {
  return execFileSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function flatten(value, path = []) {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? flatten(child, [...path, key])
      : [[...path, key].join('.')],
  );
}

/**
 * @param root Repo kökü.
 * @param dynamic Çalışma zamanında kurulan anahtarlar; testler kendi listesini verir.
 * @returns Sorun listesi; boşsa yüzey temizdir.
 */
export function validateI18nKeys(root, dynamic = DYNAMIC_KEYS) {
  const problems = [];

  const codeFiles = gitFiles(root, '*.ts').concat(gitFiles(root, '*.html'));
  const code = codeFiles
    .filter((file) => !file.includes('node_modules'))
    .map((file) => {
      try {
        return readFileSync(join(root, file), 'utf8');
      } catch {
        return '';
      }
    })
    .join('\n');

  // Beyan edilen her muafiyeti ÜRETEN kod gerçekten olmalı; ölü muafiyet birikmez.
  for (const prefix of [...new Set(dynamic.map((entry) => entry.prefix))]) {
    const built = new RegExp(`\`[^\`]*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\$\\{`);
    if (!built.test(code)) {
      problems.push(
        `i18n: "${prefix}" çalışma zamanında kuruluyor diye bildirilmiş ama onu ` +
          'kuran bir template literal yok — muafiyeti kaldır.',
      );
    }
  }

  for (const file of gitFiles(root, '*/i18n/tr.json')) {
    const keys = flatten(JSON.parse(readFileSync(join(root, file), 'utf8')));
    const dead = keys.filter((key) => {
      if (code.includes(key)) return false;
      const leaf = key.split('.').at(-1) ?? key;
      if (code.includes(`.${leaf}`) || code.includes(`'${leaf}'`) || code.includes(`"${leaf}"`)) {
        return false;
      }
      return !dynamic.some((entry) => entry.key === key);
    });
    if (dead.length > 0) {
      problems.push(
        `${file}: kodda hiç kullanılmayan anahtar (${dead.length}): ${dead.join(', ')}. ` +
          'Çalışma zamanında kuruluyorsa `DYNAMIC_KEYS`e ekle, değilse İKİ dilden de sil.',
      );
    }
  }

  return problems;
}
