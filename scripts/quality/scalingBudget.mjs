/**
 * ALGORİTMİK ölçekleme kapısı.
 *
 * Mutlak süre bir kapının koşulu OLAMAZ: sonuç geliştiricinin masasındaki
 * donanıma bağlıdır ve bir eşik, hızlı makinede hiçbir şey yakalamayıp yavaş
 * makinede sürekli yanlış alarm verir. Repo bu yüzden cihaz performansını
 * bilinçli olarak kapı dışında tutuyor.
 *
 * Girdi boyları arasındaki oran mutlak süreden daha taşınabilirdir; ancak
 * JIT, zamanlayıcı ve önbellek gürültüsünden bağımsız değildir. Isınmış çoklu
 * örneğin medyanı kullanılır. Dört kat girdide doğrusal iş ~4, karesel iş ~16
 * bekletir; tek koşu asimptotik karmaşıklığın matematiksel kanıtı değildir.
 *
 * Ayırma (bayt/kare) neden kapı değil: `--expose-gc` ile bile koşudan koşuya
 * kat kat salınır; benchmark da o alanı "gürültülü" diye etiketler. Kapılanamayacak bir sayıyı kapılamak, kapıya
 * olan güveni bitirir.
 */
import { execFileSync } from './command.mjs';

/**
 * @param root Repo kökü.
 * @param budgets `quality.json` → `scaling` bölümü.
 * @param runner Ölçümü döndüren fonksiyon; testler kendi sahtesini verir.
 * @param log Ölçülen her oranı bildirir.
 * @returns Sorun listesi; boşsa ölçekleme bütçe içindedir.
 */
export function validateScaling(root, budgets, runner = measureScaling, log = (_line) => {}) {
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
      if (typeof actual !== 'number' || !Number.isFinite(actual) || actual <= 0) {
        problems.push(`${packageDir}: "${key}" ölçülemedi — bütçe doğrulanamaz.`);
        continue;
      }
      log(`${packageDir}: ${key} = ${actual.toFixed(3)} (tavan ${ceiling})`);
      if (actual > ceiling) {
        problems.push(
          `${packageDir}: ${key} = ${actual.toFixed(3)}, tavan ${ceiling}. ` +
            'Ölçülen süre oranı bütçeyi aştı; iş yükü ve ölçüm gürültüsü incelenmeli.',
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
 * bekçi hiçbir paketin betik adını ya da rapor alanını bilmez.
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
  const report = JSON.parse(raw.trim());
  return scalingRatios(report, measure.series, keys);
}

/** Her üretici aynı sürümlü ms/adım serisini verir; belirsiz tekrarlar kabul edilmez. */
export function scalingRatios(report, name, keys) {
  if (
    report?.schemaVersion !== 1 ||
    report.unit !== 'ms/step' ||
    !report.series ||
    typeof report.series !== 'object' ||
    Array.isArray(report.series) ||
    !Object.hasOwn(report.series, name) ||
    !Array.isArray(report.series[name]) ||
    report.series[name].length < 2
  )
    throw new Error(`ölçekleme raporu şeması geçersiz: ${name}`);
  const byInput = new Map();
  for (const entry of report.series[name]) {
    if (
      !Number.isSafeInteger(entry?.input) ||
      entry.input <= 0 ||
      !Number.isFinite(entry.value) ||
      entry.value <= 0 ||
      byInput.has(entry.input)
    )
      throw new Error(`ölçekleme örneği geçersiz veya tekrarlı: ${name}`);
    byInput.set(entry.input, entry.value);
  }
  const measured = {};
  for (const key of keys) {
    const match = /(\d+)Over(\d+)$/.exec(key);
    if (!match || Number(match[1]) <= Number(match[2]))
      throw new Error(`ölçekleme oran anahtarı geçersiz: ${key}`);
    const high = byInput.get(Number(match[1]));
    const low = byInput.get(Number(match[2]));
    if (!(high > 0) || !(low > 0)) {
      throw new Error(`"${name}" ölçümü ${match[2]} ve ${match[1]} girdilerini taşımıyor`);
    }
    const ratio = high / low;
    if (!Number.isFinite(ratio) || ratio <= 0)
      throw new Error(`ölçekleme oranı sonlu ve pozitif değil: ${key}`);
    measured[key] = ratio;
  }
  return measured;
}
