/**
 * `audio:job music …` — müzik üretiminin CLI kabuğu. İş mantığı
 * `src/music/` + `src/protocol/music.ts`tedir. Süreler yalnız bu çıktıda
 * kanıt olarak görünür.
 */
import {
  checkMusic,
  DEFAULT_MUSIC_ROOT,
  listMusic,
  loadMusicDocuments,
  musicStatus,
  previewMusic,
  publishMusic,
  verifyMusic,
  type MusicLocation,
} from '../../src/protocol/music';
import { EXPORT_ROOT, writeAuditionCopy } from '../../src/protocol/audition';
import { checkRepoRelative } from '../../src/protocol/fs';
import { runMusicSearchCommand } from './musicSearchCommands';
import { positional, print, text, type Parsed } from './args';

const ms = (started: number) => Number((performance.now() - started).toFixed(1));

/** Dinleme kopyaları kanonik dinleme yazıcısından, git'e girmeyen kökün altına. */
const AUDITION_DIR = `${EXPORT_ROOT}/music`;

export function runMusicCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(
    parsed,
    0,
    'bir alt komut (plan|check|analyze|render|publish|status|verify|list|search)',
  );
  const root = checkRepoRelative(text(parsed.flags, 'music') ?? DEFAULT_MUSIC_ROOT, '--music');
  const loc = (): MusicLocation => ({
    repoRoot,
    musicRoot: root,
    musicId: positional(parsed, 1, 'bir musicId'),
  });
  switch (sub) {
    case 'plan': {
      const started = performance.now();
      const preview = previewMusic(repoRoot, loadMusicDocuments(loc()));
      print({
        musicId: preview.program.musicId,
        programHash: preview.programHash,
        assets: preview.assets,
        estimate: preview.estimate,
        verdict: preview.report.verdict,
        evidence: { preflightMs: ms(started) },
      });
      return preview.report.verdict.pass ? 0 : 1;
    }
    case 'analyze': {
      const started = performance.now();
      const preview = previewMusic(repoRoot, loadMusicDocuments(loc()));
      print(parsed.flags.has('json') ? preview.report : summarize(preview.report));
      console.error(`sembolik analiz ${ms(started)} ms (render yok)`);
      return preview.report.verdict.pass ? 0 : 1;
    }
    case 'check': {
      const started = performance.now();
      const check = checkMusic(repoRoot, loadMusicDocuments(loc()));
      print({
        musicId: check.program.musicId,
        symbolic: check.report.verdict,
        mastering: check.mastering,
        qa: parsed.flags.has('json') ? check.qa : check.qa.verdict,
        spec: { frames: check.spec.frames, stems: check.spec.stems.map((s) => s.id) },
        evidence: { renderAndMeasureMs: ms(started) },
      });
      return check.report.verdict.pass && check.qa.verdict.pass ? 0 : 1;
    }
    case 'render': {
      const started = performance.now();
      const check = checkMusic(repoRoot, loadMusicDocuments(loc()));
      const written = check.rendered.map((asset) =>
        writeAuditionCopy(repoRoot, `${AUDITION_DIR}/${check.program.musicId}/${asset.stem}.wav`, {
          channels: asset.channels,
          sampleRate: check.spec.sampleRate,
          duration: asset.frames / check.spec.sampleRate,
          seed: check.program.seed,
          cost: { peakBytes: 0, workUnits: 0 },
        }),
      );
      print({ musicId: check.program.musicId, files: written, evidence: { wallMs: ms(started) } });
      return 0;
    }
    case 'publish': {
      const started = performance.now();
      const location = loc();
      const outcome = publishMusic(repoRoot, root, loadMusicDocuments(location));
      print({ ...outcome, evidence: { wallMs: ms(started) } });
      return 0;
    }
    case 'status': {
      const status = musicStatus(loc());
      print(status);
      return status.verification.complete ? 0 : 1;
    }
    case 'verify': {
      const report = verifyMusic(loc());
      print(report);
      return report.complete ? 0 : 1;
    }
    case 'list':
      print(listMusic(repoRoot, root));
      return 0;
    case 'search':
      return runMusicSearchCommand(parsed, repoRoot, root);
    default:
      console.log(
        'music alt komutları: plan | check | analyze | render | publish | status | verify | list | search',
      );
      return 1;
  }
}

function summarize(report: ReturnType<typeof previewMusic>['report']) {
  return {
    musicId: report.musicId,
    totals: report.totals,
    sections: report.sections.map((s) => ({
      id: s.id,
      role: s.role,
      target: s.targetEnergy,
      measured: s.measuredEnergy,
      notesPerBar: s.notesPerBar,
    })),
    failing: [
      ...report.brief.filter((c) => !c.ok).map((c) => `brief ${c.name}: ${c.detail}`),
      ...report.rules.filter((r) => !r.ok).map((r) => `kural ${r.ruleId}: ${r.detail}`),
    ],
    unchecked: report.unchecked,
    verdict: report.verdict,
  };
}
