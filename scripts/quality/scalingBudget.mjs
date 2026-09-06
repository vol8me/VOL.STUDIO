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
export function validateScaling(root, budgets, runner = measureArachnidScaling) {
  const problems = [];

  for (const [packageDir, budget] of Object.entries(budgets ?? {})) {
    if (packageDir.startsWith('$')) continue;

    let measured;
    try {
      measured = runner(root, packageDir);
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

/** vol-arachnid locomotion benchmark'ını koşar ve ölçekleme oranlarını çıkarır. */
function measureArachnidScaling(root, packageDir) {
  const raw = execFileSync(
    'pnpm',
    [
      'exec',
      'tsx',
      'scripts/benchmark/locomotion-benchmark.ts',
      '--iterations',
      '400',
      '--samples',
      '3',
      '--json',
    ],
    { cwd: `${root}/${packageDir}`, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const report = JSON.parse(raw.slice(raw.indexOf('{')));
  const byParts = new Map(report.fxScale.map((entry) => [entry.parts, entry.msPerFrame]));
  const base = byParts.get(18);
  const top = byParts.get(72);
  if (!(base > 0) || !(top > 0)) {
    throw new Error('fxScale ölçümü 18 ve 72 parça değerlerini taşımıyor');
  }
  return { fxParts72Over18: top / base };
}
