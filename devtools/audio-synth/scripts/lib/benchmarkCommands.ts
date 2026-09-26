/**
 * `audio:job benchmark …` — sürümlü benchmark görev derleminin CLI kabuğu.
 * İş mantığı `src/protocol/benchmark.ts`dedir. `review` yalnız insan beyanı
 * içindir: `--by human` zorunludur; agent dinleme sonucu yazamaz.
 */
import {
  benchmarkReviews,
  BENCHMARK_REPORT_SCHEMA,
  loadBenchmarkTasks,
  ProtocolError,
  qualityMatrix,
  readJsonFile,
  recordBenchmarkReview,
  resolveInside,
  runBenchmarks,
  type BenchmarkReportV1,
  type BenchmarkReviewStatus,
} from '../../src/protocol';
import { positional, print, required, text, type Parsed } from './args';

export function runBenchmarkCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (list|run|review)');
  switch (sub) {
    case 'list':
      print(
        loadBenchmarkTasks(repoRoot).map((t) => ({
          id: t.id,
          version: t.version,
          category: t.category,
          title: t.title,
          parts: t.parts.map((p) => ({ id: p.id, source: p.source.kind })),
          review: benchmarkReviews(repoRoot).find((r) => r.id === t.id)?.status ?? 'pending-human',
        })),
      );
      return 0;
    case 'run': {
      const report = runBenchmarks(repoRoot, { audition: parsed.flags.has('audition') });
      if (parsed.flags.has('json')) print(report);
      else {
        for (const c of report.canaries) {
          console.log(
            `${c.pass ? '✓' : '✗'} canary ${c.id}@${c.version}  pcm ${c.pcmHash.slice(
              7,
              19,
            )}  dinleme: ${c.review}`,
          );
        }
        for (const t of report.tasks) {
          console.log(
            `${t.pass ? '✓' : '✗'} görev ${t.id}@${t.version} [${t.category}]  dinleme: ${
              t.review
            }`,
          );
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
    case 'review': {
      if (required(parsed.flags, 'by') !== 'human') {
        throw new ProtocolError(
          'invalid',
          'dinleme incelemesi yalnız insan beyanıdır (--by human)',
        );
      }
      const status = required(parsed.flags, 'status') as BenchmarkReviewStatus;
      print(
        recordBenchmarkReview(
          repoRoot,
          positional(parsed, 1, 'bir görev kimliği'),
          status,
          text(parsed.flags, 'note') ?? null,
        ),
      );
      return 0;
    }
    default:
      console.log('benchmark alt komutları: list | run | review (bkz. context --json)');
      return 1;
  }
}

/**
 * `audio:job capabilities` — kalite matrisi. Varsayılan olarak taze
 * `runBenchmarks` koşusu yapar; `--from-report <dosya>` kayıtlı bir
 * BenchmarkReportV1'i yeniden render etmeden okur. `regressed` satırı
 * varsa çıkış kodu 1'dir (kanıtlı mekanizma şu an düşüyor demektir).
 */
export function runCapabilitiesCommand(parsed: Parsed, repoRoot: string): number {
  const from = text(parsed.flags, 'from-report');
  let report: BenchmarkReportV1;
  if (from !== undefined) {
    const raw = readJsonFile(resolveInside(repoRoot, from, '--from-report'), '--from-report') as {
      schema?: unknown;
    };
    if (raw.schema !== BENCHMARK_REPORT_SCHEMA) {
      throw new ProtocolError('invalid', `--from-report ${BENCHMARK_REPORT_SCHEMA} bekler`, from);
    }
    report = raw as unknown as BenchmarkReportV1;
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
        console.log(
          `  ${r.mechanism.padEnd(18)} dinleme: ${r.listening.padEnd(16)} ${evidence}${pubs}`,
        );
      }
    }
    console.log(
      `"production-ready" = geçen görev + doğrulanmış yayın kanıtı + güncel sürümde insan ` +
        `heard-acceptable. "benchmarked" yalnız mekanik geçiştir; kabul ya da yayın eksiktir.`,
    );
  }
  return matrix.rows.some((r) => r.level === 'regressed') ? 1 : 0;
}
