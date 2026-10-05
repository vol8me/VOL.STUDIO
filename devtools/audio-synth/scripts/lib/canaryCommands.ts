import { loadCanaries, runCanaries } from '../../src/protocol/canary';
import { positional, print, type Parsed } from './args';

export function runCanaryCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (list|run)');
  switch (sub) {
    case 'list':
      print(
        loadCanaries(repoRoot).map((c) => ({
          id: c.id,
          version: c.version,
          title: c.title,
          source: c.source.kind,
          expectations: c.expectations.map((e) => e.kind),
        })),
      );
      return 0;
    case 'run': {
      const results = runCanaries(repoRoot, { audition: parsed.flags.has('audition') });
      if (parsed.flags.has('json')) print({ results });
      else {
        for (const r of results) {
          console.log(`${r.pass ? '✓' : '✗'} ${r.id}@${r.version}  pcm ${r.pcmHash.slice(7, 19)}`);
          for (const c of r.checks.filter((x) => !x.pass))
            console.log(`    ✗ ${c.kind}: ${c.reason}`);
        }
        console.log(
          `${results.filter((r) => r.pass).length}/${
            results.length
          } canary mekanik beklentiyi karşıladı (organiklik kanıtı değildir).`,
        );
      }
      return results.every((r) => r.pass) ? 0 : 1;
    }
    default:
      console.log('canary alt komutları: list | run (bkz. context --json)');
      return 1;
  }
}
