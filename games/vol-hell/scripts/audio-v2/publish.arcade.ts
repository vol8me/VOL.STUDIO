import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '@volstudio/audio-synth/protocol/job';
import { publishJob, verifyManifest } from '@volstudio/audio-synth/protocol/publish';
import {
  checkMusic,
  loadMusicDocuments,
  publishMusic,
  verifyMusic,
} from '@volstudio/audio-synth/protocol/music';
import { analyzeScore } from '@volstudio/audio-synth/music/analyze';
import { expandProgram } from '@volstudio/audio-synth/music/score';
import { buildArcadeSuite } from './definitions.arcade';

/**
 * Arcade setinin ÜRÜN yayını: SFX işleri kanonik job kapısından, müzik ve
 * ambiyans kanonik müzik kapısından geçer; asset'ler oyunun `public/`
 * ağacına, manifestler `audio-manifests/` altına yazılır.
 *
 * Kullanım:
 *   tsx scripts/audio-v2/publish.arcade.ts [--dry-run] [--kind sfx|music] [--only a,b]
 */

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const kindIndex = args.indexOf('--kind');
const kind = kindIndex < 0 ? undefined : args[kindIndex + 1];
const onlyIndex = args.indexOf('--only');
const only = onlyIndex < 0 ? undefined : new Set(args[onlyIndex + 1].split(','));
const jobsRoot = 'devtools/audio-synth/audio-jobs';
const musicRoot = 'devtools/audio-synth/audio-music';

const suite = buildArcadeSuite();
if (args.includes('--audit')) {
  for (const item of suite.music) {
    const report = analyzeScore({
      program: item.program,
      score: expandProgram(item.program),
      brief: item.brief,
    });
    console.log(
      JSON.stringify({
        id: item.program.musicId,
        pass: report.verdict.pass,
        failures: report.verdict.failures,
        checks: report.brief.filter((check) => !check.ok),
        sections: report.sections.map((section) => ({
          id: section.id,
          target: section.targetEnergy,
          measured: section.measuredEnergy,
          notes: section.events,
        })),
      }),
    );
  }
  process.exit(0);
}
if (args.includes('--qa')) {
  for (const item of suite.music) {
    if (only && !only.has(item.program.musicId) && !only.has(item.runtimeKey)) continue;
    const check = checkMusic(repo, {
      brief: item.brief,
      program: item.program,
      themeBook: null,
    });
    console.log(
      JSON.stringify({
        id: item.program.musicId,
        declared: item.program.mastering?.integratedLufs ?? null,
        gainDb: check.mastering.gainDb,
        verdict: check.qa.verdict,
        states: check.qa.states.map((state) => ({
          state: state.state,
          lufs: state.integratedLufs,
          peak: state.samplePeak,
          truePeak: state.truePeakDbtp,
        })),
      }),
    );
  }
  process.exit(0);
}
if (dryRun) {
  console.log(
    JSON.stringify({
      jobs: suite.jobs.length,
      music: suite.music.map((item) => item.program.musicId),
      coverage: suite.coverage.length,
      assetPaths: suite.jobs.map((job) => (job.target as { asset: string }).asset),
    }),
  );
  process.exit(0);
}

const reportPath = resolve(repo, '.claude/arcade-publish.json');
const outcomes: { id: string; kind: string; pass: boolean; result?: unknown; error?: string }[] =
  [];
let failed = 0;
function record(id: string, taskKind: string, run: () => unknown) {
  try {
    const result = run();
    outcomes.push({ id, kind: taskKind, pass: true, ...(result ? { result } : {}) });
    console.log(JSON.stringify(outcomes.at(-1)));
  } catch (error) {
    failed++;
    outcomes.push({ id, kind: taskKind, pass: false, error: (error as Error).message });
    console.error(JSON.stringify(outcomes.at(-1)));
  }
  writeFileSync(reportPath, `${JSON.stringify({ outcomes }, null, 2)}\n`);
}

for (const job of suite.jobs) {
  if (kind && kind !== 'sfx') continue;
  if (only && !only.has(job.id) && !only.has(job.event)) continue;
  record(job.id, 'job', () => {
    const loc = { repoRoot: repo, jobsRoot, jobId: job.id };
    if (!existsSync(join(repo, jobsRoot, job.id, 'job.json')))
      initJob(loc, { target: job.target as never });
    registerBrief(loc, job.brief);
    registerProgram(loc, job.program);
    const render = renderCandidate(loc, { audition: true });
    analyzeCandidate(loc, render.record.renderId);
    selectCandidate(
      loc,
      render.record.renderId,
      'Arcade paleti; kullanıcı 2026-09-28 tarihinde oyun ses setini onayladı.',
    );
    const published = publishJob(loc);
    const verification = verifyManifest(repo, published.manifestPath);
    if (!verification.ok) throw new Error('Manifest doğrulaması düştü.');
    return { asset: published.manifest.asset.path, manifest: published.manifestPath };
  });
}

for (const item of suite.music) {
  if (kind && kind !== 'music') continue;
  if (only && !only.has(item.program.musicId) && !only.has(item.runtimeKey)) continue;
  const loc = { repoRoot: repo, musicRoot, musicId: item.program.musicId };
  const dir = join(repo, musicRoot, item.program.musicId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'music.json'), `${JSON.stringify(item.program, null, 2)}\n`);
  writeFileSync(join(dir, 'brief.json'), `${JSON.stringify(item.brief, null, 2)}\n`);
  record(item.program.musicId, 'music', () => {
    const outcome = publishMusic(repo, musicRoot, loadMusicDocuments(loc));
    const verification = verifyMusic(loc);
    if (!verification.complete) throw new Error('Müzik doğrulaması düştü.');
    return { bundle: outcome.bundle, qa: outcome.qa.pass };
  });
}

console.log(
  JSON.stringify({
    total: outcomes.length,
    failed,
    report: reportPath,
  }),
);
if (failed) process.exitCode = 1;
