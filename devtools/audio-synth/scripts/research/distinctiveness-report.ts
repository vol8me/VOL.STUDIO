/**
 * `distinctiveness-report` — 14 benchmark görevinin kriter kümelerinin
 * çapraz ayırt ediciliğini ölçer. Her görevin her parçası bir kez render
 * edilir (müzik parçaları `checkMusic` mix kanalı, akustik parçalar
 * `renderProgram`); sonra her (değerlendirici, aday) çiftinde adayın
 * bütün parça render'ları değerlendiricinin bütün parça kriterlerine
 * karşı sınanır.
 *
 * Kural: aday, değerlendiricinin herhangi bir parça kriter kümesini bir
 * parça render'ında bütünüyle karşılıyorsa "reddedilemez" sayılır — çift
 * adıyla raporlanır. Beklenti: her görev diğer 13 görevin en az 11'ini
 * reddeder. Çapraz sınama yalnız mekanik kriterleri (`CHECK_KINDS`)
 * kullanır; kodek ve müzik-özgü kriterler yabancı render'a uygulanmaz.
 */
import { CHECK_KINDS, evaluateChecks, type MechanicalCheckV1 } from '../../src/analysis/checks.js';
import { analyzeAudio } from '../../src/analysis/report.js';
import { materialize } from '../../src/program/dimensions.js';
import { renderProgram } from '../../src/program/render.js';
import { withRenderSession } from '../../src/kernel/session.js';
import { REFERENCE_MIX_ID } from '../../src/music/stem.js';
import type { BenchmarkTaskV1 } from '../../src/protocol/index.js';
import { loadBenchmarkTasks } from '../../src/protocol/benchmark.js';
import { checkMusic } from '../../src/protocol/music.js';
import { repoRenderCache } from '../../src/protocol/renderCacheStore.js';
import { repoSampleResolver } from '../../src/protocol/samples.js';
import { findRepoRoot } from '../lib/args.js';

const REPO = findRepoRoot(process.cwd());

export interface DistinctMatrix {
  readonly rows: readonly {
    readonly task: string;
    readonly rejected: readonly string[];
    readonly accepted: readonly string[];
  }[];
}

const mechanical = (part: BenchmarkTaskV1['parts'][number]): MechanicalCheckV1[] =>
  part.expectations.filter((e): e is MechanicalCheckV1 =>
    (CHECK_KINDS as readonly string[]).includes(e.kind),
  );

/** Görevin her parçasını bir kez render eder ve analiz raporunu önbelleğe alır. */
function renderTask(repoRoot: string, task: BenchmarkTaskV1) {
  return task.parts.map((part) => {
    if (part.source.kind === 'music') {
      const music = checkMusic(repoRoot, {
        brief: part.source.brief,
        program: part.source.program,
        themeBook: null,
      });
      const mix = music.rendered.find((r) => r.stem === REFERENCE_MIX_ID);
      if (!mix) throw new Error(`${task.id}/${part.id}: mix stem yok`);
      return {
        key: `${task.id}/${part.id}`,
        checks: mechanical(part),
        channels: mix.channels,
        sampleRate: part.source.program.sampleRate,
      };
    }
    const render = renderProgram(materialize(part.source, [], {}), {
      samples: repoSampleResolver(repoRoot),
    });
    return {
      key: `${task.id}/${part.id}`,
      checks: mechanical(part),
      channels: render.channels,
      sampleRate: render.sampleRate,
    };
  });
}

export function measureDistinctiveness(repoRoot: string): DistinctMatrix {
  const tasks = loadBenchmarkTasks(repoRoot);
  const rendered = new Map(
    tasks.map((t) => [
      t.id,
      renderTask(repoRoot, t).map((p) => ({
        ...p,
        report: analyzeAudio(p.channels, p.sampleRate, 'source-pcm'),
      })),
    ]),
  );
  const rows = tasks.map((evaluator) => {
    const rejected: string[] = [];
    const accepted: string[] = [];
    for (const candidate of tasks) {
      if (candidate.id === evaluator.id) continue;
      // Aday reddedilemez sayılır: en az bir (kriter, render) çifti tam geçer.
      const survives = (rendered.get(evaluator.id) ?? []).some((ep) =>
        (rendered.get(candidate.id) ?? []).some(
          (cp) =>
            ep.checks.length > 0 &&
            evaluateChecks(
              ep.checks,
              { channels: cp.channels, sampleRate: cp.sampleRate },
              cp.report,
            ).every((c) => c.pass),
        ),
      );
      (survives ? accepted : rejected).push(candidate.id);
    }
    return { task: evaluator.id, rejected, accepted };
  });
  return { rows };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const matrix = withRenderSession({ cache: repoRenderCache(REPO) }, () =>
    measureDistinctiveness(REPO),
  );
  for (const row of matrix.rows) {
    console.log(`${row.task.padEnd(20)} reddetti: ${row.rejected.length}/13`);
    if (row.accepted.length > 0) console.log(`    reddedilemeyen: ${row.accepted.join(', ')}`);
  }
  const weak = matrix.rows.filter((r) => r.rejected.length < 11);
  console.log(
    weak.length === 0
      ? 'Her görev ≥11 reddetme sağlıyor.'
      : `EŞİK ALTI: ${weak.map((w) => `${w.task}(${w.rejected.length})`).join(', ')}`,
  );
}
