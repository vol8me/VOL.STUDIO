import {
  validateBenchmarkReport,
  loadBenchmarkTasks,
  runBenchmarks,
  type BenchmarkReportV2,
} from '../../src/protocol/benchmark';
import { qualityMatrix } from '../../src/protocol/capabilities';
import { readJsonFile, resolveInside } from '../../src/protocol/fs';
import { positional, print, text, type Parsed } from './args';

export function runBenchmarkCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (list|run)');
  switch (sub) {
    case 'list':
      print(
        loadBenchmarkTasks(repoRoot).map((t) => ({
          id: t.id,
          version: t.version,
          category: t.category,
          title: t.title,
          parts: t.parts.map((p) => ({ id: p.id, source: p.source.kind })),
        })),
      );
      return 0;
    case 'run': {
      const report = runBenchmarks(repoRoot, { audition: parsed.flags.has('audition') });
      if (parsed.flags.has('json')) print(report);
      else {
        for (const c of report.canaries) {
          console.log(
            `${c.pass ? '✓' : '✗'} canary ${c.id}@${c.version}  pcm ${c.pcmHash.slice(7, 19)}`,
          );
        }
        for (const t of report.tasks) {
          console.log(`${t.pass ? '✓' : '✗'} görev ${t.id}@${t.version} [${t.category}]`);
          for (const p of t.parts)
            for (const c of p.checks.filter((x) => !x.pass))
              console.log(`    ✗ ${p.id}:${c.kind}: ${c.reason}`);
        }
        const failing = [
          ...report.canaries.filter((c) => !c.pass).map((c) => `canary:${c.id}`),
          ...report.tasks.filter((t) => !t.pass).map((t) => `görev:${t.id}`),
        ];
        console.log(
          `${report.canaries.length} canary + ${report.tasks.length} görev; ` +
            (failing.length
              ? `düşenler: ${failing.join(', ')}`
              : 'hepsi mekanik kriterleri karşıladı') +
            ' (kalite kanıtı değildir).',
        );
      }
      return report.canaries.every((c) => c.pass) && report.tasks.every((t) => t.pass) ? 0 : 1;
    }
    default:
      console.log('benchmark alt komutları: list | run (bkz. context --json)');
      return 1;
  }
}

/**
 * `audio:job capabilities` — kalite matrisi. Varsayılan olarak taze
 * `runBenchmarks` koşusu yapar; `--from-report <dosya>` kayıtlı bir
 * BenchmarkReportV2'i yeniden render etmeden okur. `regressed` satırı
 * varsa çıkış kodu 1'dir (kanıtlı mekanizma şu an düşüyor demektir).
 */
export function runCapabilitiesCommand(parsed: Parsed, repoRoot: string): number {
  const from = text(parsed.flags, 'from-report');
  let report: BenchmarkReportV2;
  if (from !== undefined) {
    report = validateBenchmarkReport(
      readJsonFile(resolveInside(repoRoot, from, '--from-report'), '--from-report'),
    );
  } else {
    report = runBenchmarks(repoRoot, {});
  }
  const matrix = qualityMatrix(repoRoot, report);
  if (parsed.flags.has('json')) {
    print(matrix);
  } else {
    const order = [
      'production-ready',
      'benchmarked',
      'canary',
      'regressed',
      'research',
      'pipeline',
      'unsupported',
    ] as const;
    for (const level of order) {
      const rows = matrix.rows.filter((r) => r.level === level);
      if (rows.length === 0) continue;
      console.log(`${level} (${rows.length})`);
      for (const r of rows) {
        const evidence = r.evidence
          .map(
            (e) => `${e.pass ? '✓' : '✗'} ${e.kind === 'benchmark' ? 'görev' : 'canary'}:${e.id}`,
          )
          .join('  ');
        const pubs = r.published.length > 0 ? `  yayın: ${r.published.length}` : '';
        console.log(`  ${r.mechanism.padEnd(18)} ${evidence}${pubs}`);
      }
    }
    console.log(
      `"production-ready" = güncel görev başarısı + bağımsız verify ile doğrulanmış yayın. "benchmarked" mekanik görev bilgisidir.`,
    );
  }
  return matrix.rows.some((r) => r.level === 'regressed') ? 1 : 0;
}
