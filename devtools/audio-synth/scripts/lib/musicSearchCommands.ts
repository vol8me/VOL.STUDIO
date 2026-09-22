/**
 * `audio:job music search …` — hiyerarşik müzik aramasının CLI kabuğu.
 * İş mantığı `src/music/search.ts` + `src/protocol/musicSearch.ts`tedir.
 */
import {
  loadMusicSearchSpec,
  promoteMusicCandidate,
  runMusicSearch,
  type MusicLocation,
} from '../../src/protocol';
import { positional, print, required, type Parsed } from './args';

const ms = (started: number) => Number((performance.now() - started).toFixed(1));

export function runMusicSearchCommand(parsed: Parsed, repoRoot: string, musicRoot: string): number {
  const action = positional(parsed, 1, 'bir eylem (plan|run|promote)');
  const loc = (): MusicLocation => ({
    repoRoot,
    musicRoot,
    musicId: positional(parsed, 2, 'bir musicId'),
  });
  switch (action) {
    case 'plan': {
      const spec = loadMusicSearchSpec(loc());
      print({
        searchId: spec.searchId,
        candidates: spec.candidates,
        finalists: spec.finalists,
        dimensions: spec.dimensions.map(
          (d) => `${d.name}: ${d.target.kind} ∈ [${d.range.join(', ')}]`,
        ),
        objectives: spec.objectives,
      });
      return 0;
    }
    case 'run': {
      const started = performance.now();
      const report = runMusicSearch(loc());
      print({
        searchId: report.searchId,
        evidence: { ...report.evidence, wallMs: ms(started) },
        ranked: report.ranked.slice(0, 5),
        finalists: report.finalists.map((f) => ({
          candidateId: f.candidateId,
          distance: f.distance,
          policy: f.policy.verdict,
          lufs: f.audio.integratedLufs,
        })),
      });
      return report.finalists.some((f) => f.policy.verdict === 'pass') ? 0 : 1;
    }
    case 'promote': {
      const promotion = promoteMusicCandidate(loc(), required(parsed.flags, 'candidate'));
      print(promotion);
      return 0;
    }
    default:
      console.log('music search eylemleri: plan | run | promote --candidate <id>');
      return 1;
  }
}
