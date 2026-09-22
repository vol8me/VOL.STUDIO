/**
 * `audio:job search …` ve `audio:job promote` — arama laboratuvarının CLI
 * kabuğu. İş mantığı `src/search/` + `src/protocol/search.ts`dedir. Süre
 * ölçümleri yalnız bu çıktıda görünür (performans kanıtı); kanonik rapora
 * girmez ve hiçbir kararı etkilemez.
 */
import { statSync } from 'node:fs';
import {
  checkRepoRelative,
  DEFAULT_SEARCHES_ROOT,
  exportAuditionPage,
  exportSearchAudition,
  listSearches,
  previewSearch,
  promoteCandidate,
  recordDecision,
  runSearch,
  searchStatus,
  startAuditionServer,
  type JobLocation,
  verifySearch,
  type SearchLocation,
} from '../../src/protocol';
import { validateDecision } from '../../src/search/selection';
import { positional, print, readInput, required, text, type Parsed } from './args';

function searchesRoot(parsed: Parsed): string {
  return checkRepoRelative(text(parsed.flags, 'searches') ?? DEFAULT_SEARCHES_ROOT, '--searches');
}

function planSummary(plan: ReturnType<typeof previewSearch>) {
  return {
    searchId: plan.spec.searchId,
    specHash: plan.specHash,
    baseHash: plan.baseHash,
    dimensions: plan.spec.dimensions.map((d) => d.name),
    candidates: plan.candidates.map((c) => ({
      ordinal: c.ordinal,
      candidateId: c.candidateId,
      values: c.values,
      programHash: c.programHash,
      invalid: c.invalid,
      cost: c.cost,
      risks: c.risks,
    })),
    estimate: plan.estimate,
    budget: plan.budget,
    verdict: plan.verdict,
  };
}

function printStatus(status: ReturnType<typeof searchStatus>): void {
  const s = status.summary;
  console.log(
    `${status.search}  geçti ${s.passed} · filtrelendi ${s.filtered} · geçersiz ${s.invalid} · hata ${s.error} · onaylı ${s.approved} · ret ${s.rejected}`,
  );
  console.log(
    `  seçim: ${status.selection.state}${
      status.selection.reason ? ` — ${status.selection.reason}` : ''
    }`,
  );
  for (const c of status.candidates) {
    const risk = c.risks.length ? ` risk:${c.risks.join(',')}` : '';
    console.log(
      `  #${String(c.ordinal).padStart(3)} ${c.candidateId ?? '—'.padEnd(18)} ${c.state.padEnd(
        8,
      )} ${(c.decision ?? '—').padEnd(8)}${risk}${c.reason ? ` — ${c.reason}` : ''}`,
    );
  }
  for (const problem of status.problems) console.log(`  ! ${problem}`);
}

export function runSearchCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (plan|run|status|list|verify|audition|decide)');
  const root = searchesRoot(parsed);
  const loc = (): SearchLocation => ({
    repoRoot,
    searchesRoot: root,
    searchId: positional(parsed, 1, 'bir searchId'),
  });
  switch (sub) {
    case 'plan': {
      const started = performance.now();
      const plan = previewSearch(readInput(required(parsed.flags, 'file')));
      print({
        ...planSummary(plan),
        timings: { preflightMs: Number((performance.now() - started).toFixed(1)) },
      });
      return plan.verdict.withinBudget ? 0 : 1;
    }
    case 'run': {
      const document = readInput(required(parsed.flags, 'file'));
      const started = performance.now();
      const outcome = runSearch(repoRoot, root, document, {
        audition: parsed.flags.has('audition'),
      });
      const elapsed = performance.now() - started;
      print({
        search: outcome.location,
        reportHash: outcome.reportHash,
        summary: outcome.report.summary,
        preflight: outcome.report.preflight,
        auditions: outcome.auditions,
        evidence: {
          wallMs: Number(elapsed.toFixed(1)),
          reportBytes: statSync(`${repoRoot}/${outcome.location}/report.json`).size,
        },
      });
      return 0;
    }
    case 'status': {
      const status = searchStatus(loc());
      if (parsed.flags.has('json')) print(status);
      else printStatus(status);
      return status.problems.length === 0 ? 0 : 1;
    }
    case 'list':
      print(listSearches(repoRoot, root));
      return 0;
    case 'verify': {
      const started = performance.now();
      const report = verifySearch(loc());
      print({ ...report, evidence: { wallMs: Number((performance.now() - started).toFixed(1)) } });
      return report.ok ? 0 : 1;
    }
    case 'audition': {
      const location = loc();
      const wavs = exportSearchAudition(location);
      const page = exportAuditionPage(location);
      print({ page, wavs: wavs.length });
      if (!parsed.flags.has('serve')) return 0;
      const port = Number(text(parsed.flags, 'port') ?? '0');
      void startAuditionServer(location, { port }).then((server) => {
        console.log(`dinleme sunucusu: ${server.url} (yalnız bu makine; Ctrl+C ile kapatın)`);
      });
      return 0;
    }
    case 'decide': {
      const labels = (text(parsed.flags, 'label') ?? '')
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean);
      const decision = validateDecision(
        {
          state: required(parsed.flags, 'state'),
          by: required(parsed.flags, 'by'),
          labels,
          note: text(parsed.flags, 'note') ?? null,
        },
        'decision',
      );
      print(recordDecision(loc(), required(parsed.flags, 'candidate'), decision));
      return 0;
    }
    default:
      console.log(
        'search alt komutları: plan | run | status | list | verify | audition | decide (bkz. context --json)',
      );
      return 1;
  }
}

export function runPromoteCommand(parsed: Parsed, job: JobLocation, repoRoot: string): number {
  const search: SearchLocation = {
    repoRoot,
    searchesRoot: searchesRoot(parsed),
    searchId: required(parsed.flags, 'search'),
  };
  print(promoteCandidate(job, search, required(parsed.flags, 'candidate')));
  return 0;
}
