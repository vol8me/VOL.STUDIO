import { regressionCorpus, runRegression } from '../../src/protocol/regression';
import { positional, positiveCount, print, text, type Parsed } from './args';

export function runRegressionCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (corpus|run)');
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
      return 0;
    }
    default:
      console.log('regression alt komutları: corpus | run');
      return 1;
  }
}
