import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';

/**
 * KAPSAMIN ŞEKLİ — ortalamanın gizlediği şey.
 *
 * Paket kapsamı tek bir yüzde olarak raporlanır ve o yüzde yüksekse iş bitmiş
 * görünür. Ortalama yükü nereye koyduğunu söylemez: ölçüldü, `vol-hell` %84
 * raporlarken `GameScene.ts` 503 satırla %0'daydı.
 *
 * Büyük ve düşük kapsamlı dosya ya test alır ya da gerekçe VE KANIT yazar.
 * Kanıt, gerekçeyi sınayan test dosyasıdır; bekçi var olduğunu ve modülü
 * adıyla andığını doğrular. Bir dönem gerekçeler serbest metindi ve üçü koda
 * karşı yanlış çıktı ("e2e ile korunur" denen sahneyi e2e hiç açmıyordu).
 *
 * Değerlendirilen veri yalnız kaydı olan koşunun ölçtüğü paketlerin ve o
 * koşuda yazılmış lcov'lardır (bkz. `coverageRun.mjs`).
 */
const EVIDENCE_FILE = /\.(?:test|spec)\.[cm]?[jt]s$/;

/**
 * lcov'dan dosya başına (satır sayısı, kapsanan) çıkarır. `DA:<satır>,<vurulma>`
 * her çalıştırılabilir satırı bildirir; özet `LF`/`LH` alanlarını her üretici
 * yazmaz, `DA` sayımı her zaman doğrudur.
 */
function parseLcov(text) {
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('SF:')) {
      current = { file: line.slice(3), total: 0, covered: 0 };
    } else if (line.startsWith('DA:') && current) {
      current.total += 1;
      if (Number(line.slice(3).split(',')[1] ?? '0') > 0) current.covered += 1;
    } else if (line === 'end_of_record' && current) {
      files.push(current);
      current = null;
    }
  }
  return files;
}

/** Anahtar HER ZAMAN repo köküne göredir; lcov yolu mutlak da pakete göreli de yazabilir. */
function repoPath(root, dir, file) {
  return isAbsolute(file)
    ? relative(root, file).split(sep).join('/')
    : `${dir}/${file.split(sep).join('/')}`;
}

function checkEvidence(root, file, entry) {
  const symbol = basename(file, extname(file));
  const problems = [];
  for (const evidence of entry.evidence ?? []) {
    const path = join(root, evidence);
    if (!EVIDENCE_FILE.test(evidence) || !existsSync(path)) {
      problems.push(`${file}: kanıt "${evidence}" bir test dosyası değil ya da yok.`);
    } else if (!readFileSync(path, 'utf8').includes(symbol)) {
      problems.push(
        `${file}: kanıt "${evidence}" \`${symbol}\` adını hiç anmıyor — gerekçe koda dayanmıyor.`,
      );
    }
  }
  return problems;
}

/**
 * @param root Repo kökü.
 * @param config `quality.json` → `coverageShape`.
 * @param stamp Kapsam koşusunun kaydı (`readStamp`); yoksa `null`.
 * @param run Koşu adı — iletilerde görünür.
 * @returns Sorun listesi; boşsa şekil kabul edilebilir.
 */
export function validateCoverageShape(root, config, stamp, run = 'coverage') {
  if (!stamp) {
    return [`"${run}" kapsam koşusunun kaydı yok — kapı \`just ${run}\` koşusundan SONRA koşar.`];
  }
  if (!stamp.finishedAt) {
    return [`"${run}" kapsam koşusu tamamlanmamış — yarım koşunun lcov'u değerlendirilmez.`];
  }

  const minLines = config?.minLines ?? 100;
  const floorPct = config?.floorPct ?? 50;
  const acknowledged = config?.acknowledged ?? {};
  const problems = [];
  const flagged = new Set();

  for (const pkg of stamp.packages) {
    const lcov = join(root, pkg.dir, 'coverage', 'lcov.info');
    if (!existsSync(lcov)) {
      problems.push(`${pkg.name}: bu koşuda ölçüldü ama ${pkg.dir}/coverage/lcov.info yok.`);
      continue;
    }
    if (statSync(lcov).mtimeMs < stamp.startedAt) {
      problems.push(
        `${pkg.name}: ${pkg.dir}/coverage/lcov.info bu koşudan ESKİ — başka bir koşunun verisi değerlendirilmez.`,
      );
      continue;
    }
    for (const entry of parseLcov(readFileSync(lcov, 'utf8'))) {
      if (entry.total < minLines) continue;
      const pct = (entry.covered / entry.total) * 100;
      if (pct >= floorPct) continue;
      const file = repoPath(root, pkg.dir, entry.file);
      flagged.add(file);
      if (!(file in acknowledged)) {
        problems.push(
          `${file}: ${entry.total} satırın %${pct.toFixed(1)}'i kapsanıyor (taban %${floorPct}). ` +
            'Test yaz, ya da gerekçesini ve kanıtını `coverageShape.acknowledged` altına yaz.',
        );
      }
    }
  }

  const measured = stamp.packages.map((pkg) => `${pkg.dir}/`);
  for (const [file, entry] of Object.entries(acknowledged)) {
    if (!measured.some((prefix) => file.startsWith(prefix))) continue;
    if (!flagged.has(file)) {
      problems.push(`${file}: artık tabanın üstünde ya da ölçümde yok — ölü gerekçe kaldırılmalı.`);
      continue;
    }
    problems.push(...checkEvidence(root, file, entry));
  }

  return problems;
}
