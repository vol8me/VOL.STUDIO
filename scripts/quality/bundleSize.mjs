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

/**
 * Ham baytı değil, TELDEN GEÇEN baytı ölçer. Sunucu her dosyayı AYRI sıkıştırır;
 * dosyaları birleştirip tek seferde sıkıştırmak parçalar arası tekrarı da
 * sıkıştırır ve gönderileni olduğundan küçük gösterir.
 */
function gzippedBytes(files) {
  return files.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).length, 0);
}

/**
 * `vendor`, Vite'ın `manualChunks` ile ayırdığı bağımlılık parçasıdır; dosya
 * ADINDAN tanınır çünkü ayrımın kaynağı zaten o kuraldır (bkz. oyunların
 * `vite.config.ts`i). Yol ayırıcısı platforma göre değişir: Windows'ta `join`
 * ters eğik çizgi üretir ve ayırıcıya bağlı bir desen Phaser'ı `app`e sayar.
 */
export function classifyBundleFiles(files) {
  const isVendor = (file) =>
    /(?:^|\/)(?:phaser|vendor)-[^/]*\.js$/.test(file.replaceAll('\\', '/'));
  const js = files.filter((file) => file.endsWith('.js'));
  return {
    app: js.filter((file) => !isVendor(file)),
    vendor: js.filter(isVendor),
    css: files.filter((file) => file.endsWith('.css')),
  };
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

/** Bir dist klasörünü ölçer; `vendor` dışındaki JS `app`tır. */
export function measureBundle(distDir) {
  const files = collect(distDir);
  if (files.length === 0) return null;

  const { app, vendor, css } = classifyBundleFiles(files);

  /*
   * Tam sayı KB'a yuvarlamak küçük bir parçayı 0 gösteriyordu ve "ölçülmedi"
   * ile "çok küçük" ayırt edilemez hâle geliyordu. Bir ondalık, raporu
   * okunur tutarken bu belirsizliği kaldırır.
   */
  const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

  return {
    appKb: kb(gzippedBytes(app)),
    vendorKb: kb(gzippedBytes(vendor)),
    cssKb: kb(gzippedBytes(css)),
  };
}

/** Bütçeleri doğrular ve ihlalleri döner (fırlatmaz). */
export function validateBundleSizes(root, budgets) {
  const problems = [];

  for (const [packageDir, budget] of Object.entries(budgets)) {
    // `$` önekli anahtarlar AÇIKLAMADIR, paket değil (`scalingBudget.mjs` ile
    // aynı sözleşme). Atlanmazsa bir gerekçe satırı kapıyı "dist yok" ile düşürür.
    if (packageDir.startsWith('$')) continue;
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
      if (key.startsWith('$')) continue;
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
