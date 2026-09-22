/**
 * `audio:job` — agent protokolünün CLI kabuğu. İş mantığı
 * `src/protocol/`dadır; bu dosya argüman okur, çağırır ve yazdırır.
 *
 * Kullanım: `audio:job <komut> …` — komut listesi ve sözdizimi
 * `audio:job context --json` çıktısındaki `protocol.commands` alanındadır
 * (bu yorum onu tekrar etmez).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AudioParamError, BatchBudgetError, RenderBudgetError } from '../src/guard';
import {
  analyzeCandidate,
  buildContext,
  checkRepoRelative,
  DEFAULT_JOBS_ROOT,
  initJob,
  jobStatus,
  listJobs,
  listSearches,
  DEFAULT_SEARCHES_ROOT,
  verifySearch,
  ProtocolError,
  publishJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
  surveyTargets,
  verifyManifest,
  type JobLocation,
} from '../src/protocol';
import { findRepoRoot, parse, print, readInput, required, text, type Parsed } from './lib/args';
import { runCanaryCommand } from './lib/canaryCommands';
import { runPromoteCommand, runSearchCommand } from './lib/searchCommands';

function manifestsUnder(repoRoot: string): string[] {
  const out: string[] = [];
  for (const target of surveyTargets(repoRoot).publishable) {
    const root = `${target.packagePath}/${target.manifestRoot}`;
    const walk = (rel: string) => {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) return;
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) out.push(child);
      }
    };
    walk(root);
  }
  return out.sort();
}

function printStatusText(status: ReturnType<typeof jobStatus>): void {
  const a = status.artifacts;
  const line = (label: string, s: { state: string; reason: string | null }) =>
    console.log(`  ${label.padEnd(12)} ${s.state}${s.reason ? ` — ${s.reason}` : ''}`);
  console.log(
    `${status.job}  aşama: ${status.effectiveStage} (kayıtlı: ${status.recordedStage}, rev ${status.revision})`,
  );
  line('brief', a.brief);
  line('program', a.program);
  for (const r of a.renders) line(`render ${r.renderId}`, r);
  for (const x of a.analyses) line(`analiz ${x.renderId}`, x);
  line('selection', a.selection);
  line('publication', a.publication);
  for (const problem of status.problems) console.log(`  ! ${problem}`);
  console.log(`sonraki: ${status.next.action} — ${status.next.reason}`);
}

function run(parsed: Parsed): number {
  const repoRoot = findRepoRoot(process.cwd());
  const jobsRoot = checkRepoRelative(text(parsed.flags, 'jobs') ?? DEFAULT_JOBS_ROOT, '--jobs');
  const loc = (): JobLocation => {
    const jobId = parsed.positional[0];
    if (!jobId) throw new ProtocolError('invalid', `${parsed.command} bir jobId ister`);
    return { repoRoot, jobsRoot, jobId };
  };
  const json = parsed.flags.has('json');
  switch (parsed.command) {
    case 'context':
      print(buildContext(repoRoot));
      return 0;
    case 'list':
      print(listJobs(repoRoot, jobsRoot));
      return 0;
    case 'init':
      print(
        initJob(loc(), {
          target: {
            package: required(parsed.flags, 'package'),
            asset: required(parsed.flags, 'asset'),
            integration: {
              runtimeKey: text(parsed.flags, 'runtime-key') ?? null,
              loop: parsed.flags.has('loop'),
            },
          },
        }),
      );
      return 0;
    case 'status': {
      const status = jobStatus(loc());
      if (json) print(status);
      else printStatusText(status);
      return 0;
    }
    case 'brief':
      print({ brief: registerBrief(loc(), readInput(required(parsed.flags, 'file'))) });
      return 0;
    case 'program':
      print({ program: registerProgram(loc(), readInput(required(parsed.flags, 'file'))) });
      return 0;
    case 'render': {
      const seed = text(parsed.flags, 'seed');
      print(
        renderCandidate(loc(), {
          seed: seed === undefined ? undefined : Number(seed),
          audition: parsed.flags.has('audition'),
        }),
      );
      return 0;
    }
    case 'analyze':
      print(analyzeCandidate(loc(), text(parsed.flags, 'render')));
      return 0;
    case 'select':
      print(selectCandidate(loc(), text(parsed.flags, 'render'), required(parsed.flags, 'reason')));
      return 0;
    case 'publish': {
      const outcome = publishJob(loc());
      print({
        manifest: outcome.manifestPath,
        asset: outcome.manifest.asset,
        pcm: outcome.manifest.render.pcm.hash,
      });
      return 0;
    }
    case 'verify': {
      const all = parsed.flags.has('all');
      const targets = all
        ? manifestsUnder(repoRoot)
        : [checkRepoRelative(parsed.positional[0], 'manifest')];
      const reports = targets.map((manifest) => verifyManifest(repoRoot, manifest));
      const searches = all
        ? listSearches(repoRoot, DEFAULT_SEARCHES_ROOT).map((searchId) =>
            verifySearch({ repoRoot, searchesRoot: DEFAULT_SEARCHES_ROOT, searchId }),
          )
        : [];
      if (json) print([...reports, ...searches]);
      else {
        for (const r of reports) {
          console.log(
            `${r.ok ? '✓' : '✗'} ${r.manifest}  değişim: ${r.change}  pcm ${r.current.pcmHash.slice(
              7,
              19,
            )}`,
          );
          for (const check of r.checks.filter((c) => !c.ok))
            console.log(`    ✗ ${check.name}: ${check.detail}`);
        }
        for (const r of searches) {
          console.log(
            `${r.ok ? '✓' : '✗'} ${r.search}  ${r.checks.map((c) => c.detail).join(' · ')}`,
          );
        }
        console.log(`${reports.filter((r) => r.ok).length}/${reports.length} manifest doğrulandı.`);
        if (all)
          console.log(
            `${searches.filter((r) => r.ok).length}/${searches.length} arama doğrulandı.`,
          );
      }
      return reports.every((r) => r.ok) && searches.every((r) => r.ok) ? 0 : 1;
    }
    case 'search':
      return runSearchCommand(parsed, repoRoot);
    case 'promote':
      return runPromoteCommand(parsed, loc(), repoRoot);
    case 'canary':
      return runCanaryCommand(parsed, repoRoot);
    default:
      console.log('Komutlar ve sözdizimi: audio:job context --json → protocol.commands');
      return parsed.command === 'help' ? 0 : 1;
  }
}

try {
  process.exitCode = run(parse(process.argv.slice(2)));
} catch (error) {
  if (
    error instanceof ProtocolError ||
    error instanceof AudioParamError ||
    error instanceof RenderBudgetError ||
    error instanceof BatchBudgetError
  ) {
    const detail =
      error instanceof ProtocolError
        ? { code: error.code, path: error.path }
        : error instanceof AudioParamError
        ? { code: error.issue, path: error.path }
        : { code: error.resource, path: undefined };
    process.stderr.write(
      `${JSON.stringify({ error: { name: error.name, ...detail, message: error.message } })}\n`,
    );
    process.exitCode = 2;
  } else {
    throw error;
  }
}
