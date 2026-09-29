/**
 * `audio:job regression …` — estetik regresyon hafızasının CLI kabuğu.
 * Korpus = production manifest'lerinin tamamı; `run` her girdiyi güncel
 * motorla yeniden render edip PCM kimliği ve betimleyici farkını raporlar.
 * `decide` yalnız insan beyanıdır (`--by human` zorunlu): karar tam o PCM
 * kimliğine bağlanır, başka hash üretilirse bayatlar.
 */
import { ProtocolError } from '../../src/protocol/errors';
import {
  decideRegression,
  regressionCorpus,
  regressionDecisions,
  runRegression,
  type RegressionDecisionStatus,
} from '../../src/protocol/regression';
import { positional, positiveCount, print, required, text, type Parsed } from './args';

export function runRegressionCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (corpus|run|decide)');
  switch (sub) {
    case 'corpus':
      print(
        regressionCorpus(repoRoot).map((e) => ({
          id: e.id,
          assetClass: e.assetClass,
          kind: e.kind,
          manifest: e.manifest,
        })),
      );
      return 0;
    case 'run': {
      const ids = text(parsed.flags, 'ids');
      const report = runRegression(repoRoot, {
        workers: parsed.flags.has('workers') ? positiveCount(parsed, 'workers') : undefined,
        ...(ids ? { ids: ids.split(',') } : {}),
      });
      if (parsed.flags.has('json')) print(report);
      else {
        for (const row of report.rows) {
          console.log(
            `${row.status === 'unchanged' ? '✓' : '•'} ${row.id} [${row.assetClass}] ${
              row.status
            }` + (row.deltas.length ? ` (${row.deltas.length} betimleyici farkı)` : ''),
          );
          for (const d of row.deltas.slice(0, 6)) {
            console.log(
              `    ${d.key}: ${d.baseline === null ? '—' : d.baseline.toFixed(4)} → ${
                d.current === null ? '—' : d.current.toFixed(4)
              }`,
            );
          }
          if (row.deltas.length > 6) console.log(`    … +${row.deltas.length - 6} fark`);
        }
        console.log(
          `${report.rows.length} manifest: ${Object.entries(report.counts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k}=${n}`)
            .join(', ')} — hash değişimi tek başına gerileme sayılmaz.`,
        );
      }
      return report.counts['rejected-regression'] > 0 ? 1 : 0;
    }
    case 'decide': {
      if (required(parsed.flags, 'by') !== 'human') {
        throw new ProtocolError('invalid', 'regresyon kararı yalnız insan beyanıdır (--by human)');
      }
      const status = required(parsed.flags, 'status') as RegressionDecisionStatus;
      const pcm = required(parsed.flags, 'pcm');
      print(
        decideRegression(
          repoRoot,
          positional(parsed, 1, 'bir manifest kimliği'),
          status,
          pcm as `sha256:${string}`,
          required(parsed.flags, 'note'),
        ),
      );
      return 0;
    }
    case 'decisions':
      print(regressionDecisions(repoRoot));
      return 0;
    default:
      console.log('regression alt komutları: corpus | run | decide | decisions');
      return 1;
  }
}
