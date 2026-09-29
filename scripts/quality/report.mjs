#!/usr/bin/env node
/**
 * Birleşik kapıyı aşama aşama `just <aşama>` ile koşar ve sonucu
 * makine-okunur raporlar: düşen aşama, paket ve sebep. Aşamalar `justfile`dan
 * türer; çıkış kodu kapınınkiyle aynıdır.
 *
 *   node scripts/quality/report.mjs quick|fast|high|signoff [--json]
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gateStages, parseJustRecipes } from './justfile.mjs';

/** Raporlanabilen birleşik kapılar; aşamaları `justfile`dan türer. */
export const COMPOSITE_GATES = ['quick', 'fast', 'high', 'signoff'];

/** Kapının tekil aşamaları, `justfile`ın kendisinden. */
export function stagesFor(root, gate) {
  return gateStages(parseJustRecipes(readFileSync(join(root, 'justfile'), 'utf8')), gate);
}

/**
 * Çıktının SON anlamlı satırları — sınıflandırma başarısız olduğunda raporun
 * yine de eyleme geçirilebilir bir şey taşıması için.
 *
 * Sınıflandırılamayan bir hatada `reason: 'sınıflandırılamayan hata'` demek,
 * okuyucuyu tamamen kör bırakırdı; araçlar biçim değiştirdiğinde olan tam
 * olarak budur.
 */
function tailLines(output, limit = 5) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-limit);
}

/**
 * Aşama çıktısından paket adını ve sebebi çıkarır.
 *
 * **Ayrıştırma sırası bilinçlidir:** önce KENDİ ürettiğimiz yapılandırılmış
 * işaretlere bakılır, sonra üçüncü parti araçların insan çıktısına. Kendi
 * betiklerimizin biçimini kontrol ediyoruz; onları serbest metinden okumak
 * gereksiz bir kırılganlık olurdu.
 *
 * Üçüncü parti kalıpları araç biçimine bağlıdır ve bir sürüm yükseltmesinde
 * eşleşmeyi bırakabilir. Bu KAPIYI bozmaz — geçer/kalır kararı çıkış
 * kodundan gelir, buradan değil; yalnızca teşhis `unknown`a düşer ve
 * `tail` alanı devreye girer. Kalıplar `scripts/quality/tests/report.test.mjs` içinde gerçek
 * çıktı örnekleriyle kilitlidir.
 */
export function classify(stage, output) {
  const packageMatch = output.match(/(@volstudio\/[\w-]+)/);
  const pkg = packageMatch ? packageMatch[1] : null;

  // Kendi betiklerimizin yapılandırılmış işareti — biçimi biz belirliyoruz.
  const marker = output.match(/##quality:(\{.*?\})/);
  if (marker) {
    try {
      const parsed = JSON.parse(marker[1]);
      return {
        package: pkg,
        reason: `${parsed.kind}: ${parsed.count} ihlal`,
        kind: parsed.kind,
      };
    } catch {
      // Bozuk işaret, sınıflandırmayı engellemez; aşağıdaki kalıplara düşer.
    }
  }

  const coverage = output.match(/Coverage for (\w+) \(([\d.]+)%\) does not meet.*?\(([\d.]+)%\)/);
  if (coverage) {
    return {
      package: pkg,
      reason: `coverage ${coverage[1]} ${coverage[2]}% < eşik ${coverage[3]}%`,
      kind: 'coverage-threshold',
    };
  }

  // stylelint: `✖ N problems` eslint'inkiyle aynı simgeyi kullandığı için
  // aşama adıyla ayrılır — aksi halde CSS hatası 'lint' diye raporlanırdı.
  if (stage === 'lint-css' && /✖|problems?/.test(output)) {
    const cssCount = output.match(/(\d+) problems?/);
    return {
      package: null,
      reason: cssCount ? `${cssCount[1]} CSS lint hatası` : 'CSS lint hatası',
      kind: 'lint-css',
    };
  }
  if (/error(\[E\d+\])?:/.test(output) && stage === 'rust') {
    const cargo = output.match(/^error(?:\[(E\d+)\])?: (.+)$/m);
    return {
      package: null,
      reason: cargo ? `cargo ${cargo[1] ?? ''} ${cargo[2]}`.trim() : 'cargo hatası',
      kind: 'rust',
    };
  }
  if (stage === 'security-js') {
    return { package: null, reason: 'pnpm audit advisory buldu', kind: 'security-js' };
  }
  if (stage === 'security-rust') {
    return { package: null, reason: 'cargo audit advisory buldu', kind: 'security-rust' };
  }
  if (/Code style issues found/.test(output)) {
    return { package: null, reason: 'biçim (prettier) uyumsuz', kind: 'format' };
  }
  const tsError = output.match(/^(.*\.tsx?)\((\d+),(\d+)\): error (TS\d+)/m);
  if (tsError) {
    return {
      package: pkg,
      reason: `${tsError[4]} — ${tsError[1]}:${tsError[2]}`,
      kind: 'typecheck',
    };
  }
  const testFail = output.match(/Tests\s+(\d+) failed/);
  if (testFail) {
    return { package: pkg, reason: `${testFail[1]} test düştü`, kind: 'test' };
  }
  const lintCount = output.match(/✖ (\d+) problems?/);
  if (lintCount) {
    return { package: null, reason: `${lintCount[1]} lint hatası`, kind: 'lint' };
  }

  return {
    package: pkg,
    reason: 'sınıflandırılamayan hata',
    kind: 'unknown',
    tail: tailLines(output),
  };
}

// Koruma olmadan testin import'u bütün kapıyı başlatırdı.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runCli();
}

function runCli() {
  const [, , gateArg = 'high', ...flags] = process.argv;
  const asJson = flags.includes('--json');
  const root = process.cwd();

  if (!COMPOSITE_GATES.includes(gateArg)) {
    console.error(`Bilinmeyen kapı: ${gateArg}. Seçenekler: ${COMPOSITE_GATES.join(', ')}`);
    process.exit(2);
  }

  const stages = stagesFor(root, gateArg);
  const started = Date.now();
  const results = [];
  let failure = null;

  for (const stage of stages) {
    const stageStart = Date.now();
    const run = spawnSync('pnpm', ['exec', 'just', stage], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const durationMs = Date.now() - stageStart;

    if (run.status === 0) {
      results.push({ stage, status: 'passed', durationMs });
      continue;
    }

    // Kapı zinciri ilk düşen aşamada durur — sonraki aşamaları koşmak, zaten
    // bilinen bir hatanın üstüne dakikalar eklemekten başka bir şey yapmaz.
    failure = { stage, durationMs, exitCode: run.status ?? 1, ...classify(stage, output), output };
    results.push({ stage, status: 'failed', durationMs });
    break;
  }

  const report = {
    gate: gateArg,
    status: failure ? 'failed' : 'passed',
    durationMs: Date.now() - started,
    stages: results,
    ...(failure && {
      failure: {
        stage: failure.stage,
        kind: failure.kind,
        package: failure.package,
        reason: failure.reason,
        exitCode: failure.exitCode,
        ...(failure.tail && { tail: failure.tail }),
      },
    }),
  };

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`[quality-report] ${report.gate}: ${report.status} (${report.durationMs} ms)`);
    for (const stage of report.stages) {
      console.log(
        `  ${stage.status === 'passed' ? '✓' : '✗'} ${stage.stage} (${stage.durationMs} ms)`,
      );
    }
    if (failure) {
      console.log(`\n  aşama : ${failure.stage}`);
      console.log(`  tür   : ${failure.kind}`);
      console.log(`  paket : ${failure.package ?? '-'}`);
      console.log(`  sebep : ${failure.reason}`);
      if (failure.tail) {
        // Sınıflandırma tutmadı; en azından son satırlar görünsün.
        for (const line of failure.tail) console.log(`  son   : ${line}`);
      }
      console.log('');
      // Ham çıktı bastırılmaz: rapor bir ÖZETtir, teşhisin yerine geçmez.
      console.log(failure.output);
    }
  }

  process.exit(failure ? failure.exitCode : 0);
}
