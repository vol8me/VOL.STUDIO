/**
 * `audio:job canary …` — organik canary derleminin CLI kabuğu. İş mantığı
 * `src/protocol/canary.ts`dedir. `review` yalnız insan beyanı içindir:
 * `--by human` zorunludur; agent dinleme sonucu yazamaz.
 */
import {
  canaryReviews,
  loadCanaries,
  ProtocolError,
  recordCanaryReview,
  runCanaries,
  type CanaryReviewStatus,
} from '../../src/protocol';
import { positional, print, required, text, type Parsed } from './args';

export function runCanaryCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (list|run|review)');
  switch (sub) {
    case 'list':
      print(
        loadCanaries(repoRoot).map((c) => ({
          id: c.id,
          version: c.version,
          title: c.title,
          source: c.source.kind,
          expectations: c.expectations.map((e) => e.kind),
          review: canaryReviews(repoRoot).find((r) => r.id === c.id)?.status ?? 'pending-human',
        })),
      );
      return 0;
    case 'run': {
      const results = runCanaries(repoRoot, { audition: parsed.flags.has('audition') });
      const reviews = canaryReviews(repoRoot);
      if (parsed.flags.has('json')) print({ results, reviews });
      else {
        for (const r of results) {
          const review = reviews.find((x) => x.id === r.id)?.status ?? 'pending-human';
          console.log(
            `${r.pass ? '✓' : '✗'} ${r.id}@${r.version}  pcm ${r.pcmHash.slice(
              7,
              19,
            )}  dinleme: ${review}`,
          );
          for (const c of r.checks.filter((x) => !x.pass))
            console.log(`    ✗ ${c.kind}: ${c.reason}`);
        }
        console.log(
          `${results.filter((r) => r.pass).length}/${
            results.length
          } canary mekanik beklentiyi karşıladı (organiklik kanıtı değildir).`,
        );
      }
      return results.every((r) => r.pass) ? 0 : 1;
    }
    case 'review': {
      if (required(parsed.flags, 'by') !== 'human') {
        throw new ProtocolError(
          'invalid',
          'dinleme incelemesi yalnız insan beyanıdır (--by human)',
        );
      }
      const status = required(parsed.flags, 'status') as CanaryReviewStatus;
      print(
        recordCanaryReview(
          repoRoot,
          positional(parsed, 1, 'bir canary kimliği'),
          status,
          text(parsed.flags, 'note') ?? null,
        ),
      );
      return 0;
    }
    default:
      console.log('canary alt komutları: list | run | review (bkz. context --json)');
      return 1;
  }
}
