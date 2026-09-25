/**
 * `audio:job benchmark …` — sürümlü benchmark görev derleminin CLI kabuğu.
 * İş mantığı `src/protocol/benchmark.ts`dedir. `review` yalnız insan beyanı
 * içindir: `--by human` zorunludur; agent dinleme sonucu yazamaz.
 */
import {
  benchmarkReviews,
  loadBenchmarkTasks,
  ProtocolError,
  recordBenchmarkReview,
  runBenchmarks,
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
