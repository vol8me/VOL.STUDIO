/**
 * ALGORİTMİK ölçekleme kapısı.
 *
 * Mutlak süre bir kapının koşulu OLAMAZ: sonuç geliştiricinin masasındaki
 * donanıma bağlıdır ve bir eşik, hızlı makinede hiçbir şey yakalamayıp yavaş
 * makinede sürekli yanlış alarm verir. Repo bu yüzden cihaz performansını
 * bilinçli olarak kapı dışında tutuyor.
 *
 * Ama iki ölçüm arasındaki ORAN makineden BAĞIMSIZDIR. Parça sayısı dört
 * katına çıktığında süre kaç katına çıkıyor? Doğrusal bir algoritmada ~4,
 * kareselde ~16. Bu oran, donanım ne olursa olsun aynı kalır — yakalanan şey
 * hız değil, KARMAŞIKLIKTIR.
 *
 * Ayırma (bayt/kare) neden kapı değil: ölçüldü, `--expose-gc` ile bile 146 ile
 * 408 bayt arasında salınıyor (2,8 kat). Benchmark'ın kendisi de o alanı
 * "gürültülü" diye etiketliyor. Kapılanamayacak bir sayıyı kapılamak, kapıya
 * olan güveni bitirir.
 */
import { execFileSync } from 'node:child_process';

/**
 * @param root Repo kökü.
 * @param budgets `quality.json` → `scaling` bölümü.
 * @param runner Ölçümü döndüren fonksiyon; testler kendi sahtesini verir.
 * @returns Sorun listesi; boşsa ölçekleme bütçe içindedir.
 */
export function validateScaling(root, budgets, runner = measureScaling) {
  const problems = [];

  for (const [packageDir, budget] of Object.entries(budgets ?? {})) {
    if (packageDir.startsWith('$')) continue;

    const keys = Object.keys(budget).filter((key) => !key.startsWith('$'));
    let measured;
    try {
      measured = runner(root, packageDir, budget.$measure, keys);
    } catch (error) {
      problems.push(
        `${packageDir}: ölçekleme ölçümü koşulamadı (${
          error instanceof Error ? error.message : String(error)
        }). ` + 'Ölçülemeyen bütçe geçerli SAYILMAZ.',
      );
      continue;
    }

    for (const [key, ceiling] of Object.entries(budget)) {
      if (key.startsWith('$')) continue;
      const actual = measured[key];
      if (typeof actual !== 'number' || !Number.isFinite(actual)) {
        problems.push(`${packageDir}: "${key}" ölçülemedi — bütçe doğrulanamaz.`);
        continue;
      }
      if (actual > ceiling) {
        problems.push(
          `${packageDir}: ${key} = ${actual.toFixed(3)}, tavan ${ceiling}. ` +
            'Süre değil KARMAŞIKLIK arttı: dört kat girdi dört kattan fazla iş yaptırıyor.',
        );
      }
    }
  }

  return problems;
}

/**
 * Bütçedeki ölçüm TARİFİNİ koşar ve oran anahtarlarını üretir.
 *
 * Tarif `quality.json` → `scaling.<paket>.$measure` içinde VERİ olarak durur;
 * bekçi hiçbir paketin betik adını ya da rapor alanını bilmez. Bir dönem bu
 * fonksiyon `vol-arachnid`in `locomotion-benchmark.ts`ini ve `fxScale` alanını
 * doğrudan çağırıyordu: başka bir pakete bütçe yazmak kapıyı "ölçülemedi" ile
 * düşürüyordu, yani kapı tek pakete kilitliydi.
 *
 * Oran anahtarı kendi girdilerini taşır: `fxParts72Over18` = 72 girdideki süre
 * bölü 18 girdideki süre.
 */
export function measureScaling(root, packageDir, measure, keys) {
  if (!measure || typeof measure.script !== 'string') {
    throw new Error(
      `"$measure" tarifi yok. Ölçüm komutu, seri ve alan adları ${packageDir} ` +
        'için `quality.json` → scaling içinde bildirilmelidir.',
    );
  }

  const raw = execFileSync('pnpm', ['exec', 'tsx', measure.script, ...(measure.args ?? [])], {
    cwd: `${root}/${packageDir}`,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const report = JSON.parse(raw.slice(raw.indexOf('{')));
  const series = report[measure.series];
  if (!Array.isArray(series)) {
    throw new Error(`raporda "${measure.series}" dizisi yok`);
  }

  const byInput = new Map(series.map((entry) => [entry[measure.input], entry[measure.value]]));
  const measured = {};
  for (const key of keys) {
    const match = /(\d+)Over(\d+)$/.exec(key);
    if (!match) continue;
    const high = byInput.get(Number(match[1]));
    const low = byInput.get(Number(match[2]));
    if (!(high > 0) || !(low > 0)) {
      throw new Error(
        `"${measure.series}" ölçümü ${match[2]} ve ${match[1]} girdilerini taşımıyor`,
      );
    }
    measured[key] = high / low;
  }
  return measured;
}
