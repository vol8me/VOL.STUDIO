/**
 * `audio:job fit …` — referans-uydurma (inverse synthesis) araştırma
 * kapısının CLI kabuğu. İş mantığı `src/search/fit.ts` +
 * `src/protocol/fit.ts`dedir. Fit çıktısı production kaydı DEĞİLDİR;
 * publish'a tek giriş yolu kanonik iş akışıdır.
 */
import { statSync } from 'node:fs';
import {
  checkRepoRelative,
  DEFAULT_FITS_ROOT,
  listFits,
  readFitReport,
  runFit,
} from '../../src/protocol';
import { positional, print, readInput, required, text, type Parsed } from './args';

function fitsRoot(parsed: Parsed): string {
  return checkRepoRelative(text(parsed.flags, 'fits') ?? DEFAULT_FITS_ROOT, '--fits');
}

export function runFitCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (run|show|list)');
  const root = fitsRoot(parsed);
  switch (sub) {
    case 'run': {
      const document = readInput(required(parsed.flags, 'file'));
      const started = performance.now();
      const outcome = runFit(repoRoot, root, document);
      const elapsed = performance.now() - started;
      print({
        fit: outcome.location,
        reportHash: outcome.reportHash,
        verdict: outcome.report.verdict,
        best: outcome.report.best,
        rounds: outcome.report.rounds,
        evaluated: outcome.report.evaluated,
        evidence: {
          wallMs: Number(elapsed.toFixed(1)),
          reportBytes: statSync(`${repoRoot}/${outcome.location}/report.json`).size,
        },
      });
      return outcome.report.verdict === 'converged' ? 0 : 1;
    }
    case 'show': {
      const report = readFitReport(repoRoot, root, positional(parsed, 1, 'bir fitId'));
      print(report);
      return 0;
    }
    case 'list':
      print(listFits(repoRoot, root));
      return 0;
    default:
      console.log('fit alt komutları: run | show | list (bkz. context --json → search.fit)');
      return 1;
  }
}
