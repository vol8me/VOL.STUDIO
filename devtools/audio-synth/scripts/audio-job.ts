/**
 * `audio:job` — agent protokolünün CLI kabuğu. İş mantığı
 * `src/protocol/`dadır; bu dosya argüman okur, çağırır ve yazdırır.
 *
 * Kullanım: `audio:job <komut> …` — komut listesi ve sözdizimi
 * `audio:job context --json` çıktısındaki `protocol.commands` alanındadır
 * (bu yorum onu tekrar etmez).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AudioParamError, RenderBudgetError } from '../src/guard';
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
  surveyTargets,
  verifyManifest,
  type JobLocation,
} from '../src/protocol';

interface Parsed {
  readonly command: string;
  readonly positional: readonly string[];
  readonly flags: ReadonlyMap<string, string | true>;
}

const BOOLEAN_FLAGS = new Set(['json', 'loop', 'audition', 'all']);

function parse(argv: readonly string[]): Parsed {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
    } else {
      const value = rest[++i];
      if (value === undefined) throw new ProtocolError('invalid', `--${name} bir değer ister`);
      flags.set(name, value);
    }
  }
  return { command, positional, flags };
}

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (
      existsSync(join(dir, 'workspace-lifecycle.json')) &&
      existsSync(join(dir, 'pnpm-workspace.yaml'))
    )
      return dir;
    const parent = dirname(dir);
    if (parent === dir)
      throw new ProtocolError('not-found', 'repo kökü bulunamadı (workspace-lifecycle.json)');
    dir = parent;
  }
}

function text(flags: Parsed['flags'], name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function required(flags: Parsed['flags'], name: string): string {
  const value = text(flags, name);
  if (value === undefined) throw new ProtocolError('invalid', `--${name} zorunlu`);
  return value;
}

function readInput(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProtocolError('invalid', `girdi okunamadı: ${(error as Error).message}`, path);
  }
}

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

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
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
      const targets = parsed.flags.has('all')
        ? manifestsUnder(repoRoot)
        : [checkRepoRelative(parsed.positional[0], 'manifest')];
      const reports = targets.map((manifest) => verifyManifest(repoRoot, manifest));
      if (json) print(reports);
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
        console.log(`${reports.filter((r) => r.ok).length}/${reports.length} manifest doğrulandı.`);
      }
      return reports.every((r) => r.ok) ? 0 : 1;
    }
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
    error instanceof RenderBudgetError
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
