import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/**
 * KAPSAMIN ŞEKLİ — ortalamanın gizlediği şey.
 *
 * Paket kapsamı tek bir yüzde olarak raporlanır ve o yüzde yüksekse iş bitmiş
 * görünür. Ama ortalama, yükü nereye koyduğunu söylemez: izole matematik
 * (`lerp`, `clamp`, `Vector2`) %100 test edilirken oyunun kalbi hiç
 * koşulmayabilir. Ölçüldü — `vol-hell` %84,27 raporlarken `GameScene.ts` 503
 * ifadeyle %0'daydı ve kapsanmayan 1779 ifadenin %62'si altı dosyada
 * toplanmıştı.
 *
 * Bu bekçi kapsamı YÜKSELTMEZ; şekli GÖRÜNÜR kılar. Büyük ve düşük kapsamlı bir
 * dosya ya test alır ya da gerekçesini yazar. İkisi de meşrudur; kaydedilmemiş
 * olması meşru değildir.
 *
 * Ölçü `coverage/lcov.info`dan okunur — her paketin zaten ürettiği dosya.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'target', 'gen']);

function packageDirs(root) {
  const dirs = ['core', 'tauri-v2'];
  for (const group of ['games', 'devtools']) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) dirs.push(`${group}/${entry.name}`);
    }
  }
  return dirs.filter((dir) => existsSync(join(root, dir, 'package.json')));
}

/**
 * lcov'dan dosya başına (satır sayısı, kapsanan) çıkarır.
 *
 * `SF:` kaydı dosyayı açar, `DA:<satır>,<vurulma>` her çalıştırılabilir satırı
 * bildirir, `end_of_record` kaydı kapatır. Özet `LF`/`LH` alanları da vardır
 * ama her üretici onları yazmaz; `DA` sayımı her zaman doğrudur.
 */
function parseLcov(text) {
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3), total: 0, covered: 0 };
    } else if (line.startsWith('DA:') && current) {
      const hits = Number(line.slice(3).split(',')[1] ?? '0');
      current.total += 1;
      if (hits > 0) current.covered += 1;
    } else if (line === 'end_of_record' && current) {
      files.push(current);
      current = null;
    }
  }
  return files;
}

/**
 * @param root Repo kökü.
 * @param config `quality.json` → `coverageShape`.
 * @returns Sorun listesi; boşsa her büyük-düşük dosya gerekçeli.
 */
export function validateCoverageShape(root, config) {
  const minLines = config?.minLines ?? 100;
  const floorPct = config?.floorPct ?? 50;
  const acknowledged = config?.acknowledged ?? {};
  const problems = [];
  const flagged = new Set();
  let measuredAny = false;

  for (const dir of packageDirs(root)) {
    const lcov = join(root, dir, 'coverage', 'lcov.info');
    if (!existsSync(lcov)) continue;
    measuredAny = true;

    for (const entry of parseLcov(readFileSync(lcov, 'utf8'))) {
      if (entry.total < minLines) continue;
      const pct = (entry.covered / entry.total) * 100;
      if (pct >= floorPct) continue;

      /*
       * Anahtar HER ZAMAN repo köküne göredir. lcov üreticisi yolu mutlak da
       * yazabilir pakete göreli de; iki biçim karışırsa aynı dosya için iki
       * ayrı gerekçe anahtarı doğar ve ölü muafiyet kontrolü yanlış öter.
       */
      const normalized = isAbsolute(entry.file)
        ? relative(root, entry.file).split(sep).join('/')
        : `${dir}/${entry.file.split(sep).join('/')}`;
      flagged.add(normalized);
      if (!(normalized in acknowledged)) {
        problems.push(
          `${normalized}: ${entry.total} satırın %${pct.toFixed(1)}'i kapsanıyor ` +
            `(taban %${floorPct}). Test yaz, ya da neden kapsanmadığını ` +
            '`coverageShape.acknowledged` altına gerekçesiyle yaz.',
        );
      }
    }
  }

  if (!measuredAny) {
    return ['Hiçbir pakette `coverage/lcov.info` yok — şekil ölçülemedi. Kapı `coverage`den SONRA koşar.'];
  }

  for (const file of Object.keys(acknowledged)) {
    if (!flagged.has(file)) {
      problems.push(
        `${file}: artık tabanın üstünde ya da ölçümde yok — ölü gerekçe kaldırılmalı.`,
      );
    }
  }

  return problems;
}
