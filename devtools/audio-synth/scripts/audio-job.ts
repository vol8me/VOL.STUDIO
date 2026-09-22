/**
 * `audio:job` — agent protokolünün CLI kabuğu. İş mantığı
 * `src/protocol/`dadır; bu dosya argüman okur, çağırır ve yazdırır.
 *
 * Kullanım: `audio:job <komut> …` — komut listesi ve sözdizimi
 * `audio:job context --json` çıktısındaki `protocol.commands` alanındadır
 * (bu yorum onu tekrar etmez).
 */
import { AudioParamError, BatchBudgetError, RenderBudgetError } from '../src/guard';
import {
  analyzeCandidate,
  buildContext,
  checkRepoRelative,
  DEFAULT_JOBS_ROOT,
  initJob,
  jobStatus,
  listJobs,
  ProtocolError,
  publishJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
  type JobLocation,
} from '../src/protocol';
import { findRepoRoot, parse, print, readInput, required, text, type Parsed } from './lib/args';
import { runCanaryCommand } from './lib/canaryCommands';
import { runFamilyCommand } from './lib/familyCommands';
import { runMusicCommand } from './lib/musicCommands';
import { runPromoteCommand, runSearchCommand } from './lib/searchCommands';
import { runVerifyCommand } from './lib/verifyAll';

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
  line('origin', a.origin);
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
    case 'verify':
      return runVerifyCommand(parsed, repoRoot);
    case 'search':
      return runSearchCommand(parsed, repoRoot);
    case 'promote':
      return runPromoteCommand(parsed, loc(), repoRoot);
    case 'canary':
      return runCanaryCommand(parsed, repoRoot);
    case 'family':
      return runFamilyCommand(parsed, repoRoot);
    case 'music':
      return runMusicCommand(parsed, repoRoot);
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
