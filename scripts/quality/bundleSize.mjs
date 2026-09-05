/**
 * Gönderilen bundle boyutu bekçisi.
 *
 * Bir oyunun açılış süresini belirleyen şey diskteki dist klasörünün toplamı
 * değil, tarayıcıya İNEN koddur. Ölçü bu yüzden gzip'lenmiş bayttır: sunucular
 * sıkıştırarak gönderir ve kullanıcının beklediği süre o boyutla orantılıdır.
 *
 * BÜTÇE İKİ KATEGORİYE AYRILIR ve bu ayrım bu bekçinin asıl fikridir. Bir
 * oyunun JS'inin ezici çoğunluğu Phaser'dır; tek bir toplam rakam, ekibin
 * gerçekten yazdığı kodu bağımlılığın gölgesinde saklar — uygulama kodu iki
 * katına çıksa bile toplam pek kıpırdamaz ve kapı hiçbir şey söylemez.
 * `vendor` bağımlılık yükseltmesinde değişir, `app` her gün değişir; ayrı
 * ölçülmezlerse ikincisi görünmez.
 *
 * Bütçeler `quality.json`da yaşar — kapı eşiklerinin tek kaynağı orasıdır.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/** Ham baytı değil, TELDEN GEÇEN baytı ölçer. */
function gzippedBytes(files) {
  if (files.length === 0) return 0;
  return gzipSync(Buffer.concat(files.map((file) => readFileSync(file))), { level: 9 }).length;
}

function collect(directory, found = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return found;
  }
  for (const entry of entries) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collect(path, found);
    else found.push(path);
  }
  return found;
}

/**
 * Bir dist klasörünü ölçer.
 *
 * `vendor`, Vite'ın `manualChunks` ile ayırdığı bağımlılık parçasıdır; dosya
 * adından tanınır çünkü ayrımın kaynağı zaten o kuraldır (bkz. oyunların
 * `vite.config.ts`i). Geri kalan JS `app`tır.
 */
export function measureBundle(distDir) {
  const files = collect(distDir);
  if (files.length === 0) return null;

  const js = files.filter((file) => file.endsWith('.js'));
  const vendor = js.filter((file) => /\/(?:phaser|vendor)-[^/]*\.js$/.test(file));
  const app = js.filter((file) => !vendor.includes(file));

  /*
   * Tam sayı KB'a yuvarlamak küçük bir parçayı 0 gösteriyordu ve "ölçülmedi"
   * ile "çok küçük" ayırt edilemez hâle geliyordu. Bir ondalık, raporu
   * okunur tutarken bu belirsizliği kaldırır.
   */
  const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

  return {
    appKb: kb(gzippedBytes(app)),
    vendorKb: kb(gzippedBytes(vendor)),
    cssKb: kb(gzippedBytes(files.filter((file) => file.endsWith('.css')))),
  };
}

/** Bütçeleri doğrular ve ihlalleri döner (fırlatmaz). */
export function validateBundleSizes(root, budgets) {
  const problems = [];

  for (const [packageDir, budget] of Object.entries(budgets)) {
    const distDir = join(root, packageDir, 'dist');
    const measured = measureBundle(distDir);

    if (measured === null) {
      /*
       * Ölçülemeyen bütçe GEÇERLİ SAYILMAZ. `dist` yoksa bekçi sessizce
       * yeşile dönerse, build'i unutulmuş bir kapı koşusu bütçeyi hiç
       * denetlemeden geçer — yani bekçi tam da en çok gerektiği anda kör olur.
       */
      problems.push(
        `${packageDir}: dist yok, bundle bütçesi ölçülemedi. ` +
          `Bu kapı build'den SONRA koşar; sırayı bozma.`,
      );
      continue;
    }

    for (const [key, limit] of Object.entries(budget)) {
      const actual = measured[`${key}Kb`];
      if (actual === undefined) continue;
      if (actual > limit) {
        problems.push(
          `${packageDir}: ${key} ${actual} KB (gzip), bütçe ${limit} KB. ` +
            `Büyüme kasıtlıysa quality.json'daki bütçeyi ölçülen değerle ` +
            `birlikte gerekçesini yazarak yükselt.`,
        );
      }
    }
  }

  return problems;
}
