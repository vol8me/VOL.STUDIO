/**
 * `audio:job plan | graph | samples …` — ses tasarımı yüzeyinin CLI kabuğu.
 * İş mantığı `src/program/planner.ts`, `src/program/soundGraph.ts` ve
 * `src/protocol/samples.ts`dedir.
 */
import { writeFileSync } from 'node:fs';
import { planBrief } from '../../src/program/planner';
import { validateBrief } from '../../src/program/brief';
import { soundGraph, topologyOf } from '../../src/program/soundGraph';
import {
  hashCanonical,
  loadSampleLibrary,
  prettyCanonicalJson,
  ProtocolError,
  readJsonFile,
  sampleDeclOf,
  verifySampleLibrary,
  type JobLocation,
} from '../../src/protocol';
import { artifactFile } from '../../src/protocol/location';
import { positional, print, readInput, required, text, type Parsed } from './args';

export function runPlanCommand(parsed: Parsed, repoRoot: string, loc: () => JobLocation): number {
  const file = text(parsed.flags, 'brief');
  const brief = validateBrief(
    file ? readInput(file) : readJsonFile(artifactFile(loc(), 'brief.json'), 'brief.json'),
  );
  if (brief.kind !== 'acoustic') {
    throw new ProtocolError(
      'invalid',
      'plan akustik brief ister (müzik: music plan)',
      'brief.kind',
    );
  }
  const plan = planBrief(brief);
  const out = text(parsed.flags, 'skeleton');
  if (out) {
    if (!plan.skeleton)
      throw new ProtocolError('invalid', 'desteklenen mekanizma yok; iskelet üretilmedi');
    writeFileSync(out, prettyCanonicalJson(plan.skeleton));
  }
  print(plan);
  return 0;
}

export function runGraphCommand(parsed: Parsed): number {
  const graph = soundGraph(readInput(required(parsed.flags, 'file')));
  print({ graph, topologyHash: hashCanonical(topologyOf(graph)), graphHash: hashCanonical(graph) });
  return 0;
}

export function runSamplesCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (list|verify|decl)');
  switch (sub) {
    case 'list':
      print(
        [...loadSampleLibrary(repoRoot).values()].map((a) => ({
          id: a.id,
          title: a.title,
          origin: a.origin.kind,
          channels: a.channels,
          seconds: Number((a.frames / a.sampleRate).toFixed(3)),
          hash: a.hash,
        })),
      );
      return 0;
    case 'verify': {
      const results = verifySampleLibrary(repoRoot);
      print(results);
      return results.every((r) => r.ok) ? 0 : 1;
    }
    case 'decl': {
      const id = positional(parsed, 1, 'bir sample kimliği');
      const asset = loadSampleLibrary(repoRoot).get(id);
      if (!asset) throw new ProtocolError('not-found', `sample kütüphanede yok: ${id}`);
      print(sampleDeclOf(asset));
      return 0;
    }
    default:
      throw new ProtocolError('invalid', `bilinmeyen samples alt komutu: ${sub}`);
  }
}
