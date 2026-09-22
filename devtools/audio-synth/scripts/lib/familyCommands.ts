/**
 * `audio:job family …` — ses ailesi üretiminin CLI kabuğu. İş mantığı
 * `src/family/` + `src/protocol/family.ts`dedir. Süreler yalnız bu çıktıda
 * kanıt olarak görünür.
 */
import { statSync } from 'node:fs';
import {
  checkFamily,
  checkRepoRelative,
  DEFAULT_FAMILIES_ROOT,
  familyStatus,
  listFamilies,
  previewFamily,
  publishFamily,
  readJsonFile,
  resolveInside,
  verifyFamily,
  type FamilyLocation,
} from '../../src/protocol';
import { positional, print, readInput, required, text, type Parsed } from './args';

const ms = (started: number) => Number((performance.now() - started).toFixed(1));

export function runFamilyCommand(parsed: Parsed, repoRoot: string): number {
  const sub = positional(parsed, 0, 'bir alt komut (plan|check|publish|status|verify|list)');
  const root = checkRepoRelative(
    text(parsed.flags, 'families') ?? DEFAULT_FAMILIES_ROOT,
    '--families',
  );
  const loc = (): FamilyLocation => ({
    repoRoot,
    familiesRoot: root,
    familyId: positional(parsed, 1, 'bir familyId'),
  });
  const document = (): unknown => {
    const file = text(parsed.flags, 'file');
    if (file !== undefined) return readInput(file);
    const stored = `${root}/${positional(parsed, 1, 'bir familyId ya da --file')}/family.json`;
    return readJsonFile(resolveInside(repoRoot, stored, 'family'), stored);
  };
  switch (sub) {
    case 'plan': {
      const started = performance.now();
      const p = previewFamily(repoRoot, readInput(required(parsed.flags, 'file')));
      print({
        familyId: p.family.familyId,
        familyHash: p.familyHash,
        estimate: p.estimate,
        variants: p.variants.map((v) => ({
          key: v.key,
          variantId: v.variantId,
          roles: v.roles,
          values: v.values,
          programHash: v.programHash,
        })),
        evidence: { preflightMs: ms(started) },
      });
      return 0;
    }
    case 'check': {
      const started = performance.now();
      const c = checkFamily(repoRoot, readInput(required(parsed.flags, 'file')));
      print({
        familyId: c.family.familyId,
        quality: parsed.flags.has('json') ? c.quality : c.quality.verdict,
        members: c.members.map((m) => ({ key: m.key, pcmHash: m.pcmHash })),
        evidence: { renderAndAnalysisMs: ms(started), estimate: c.estimate },
      });
      return c.quality.verdict.pass ? 0 : 1;
    }
    case 'publish': {
      const started = performance.now();
      const outcome = publishFamily(repoRoot, root, document());
      print({
        ...outcome,
        evidence: { wallMs: ms(started), bankBytes: statSync(`${repoRoot}/${outcome.bank}`).size },
      });
      return 0;
    }
    case 'status': {
      const status = familyStatus(loc());
      print(status);
      return status.verification.complete ? 0 : 1;
    }
    case 'verify': {
      const report = verifyFamily(loc());
      print(report);
      return report.complete ? 0 : 1;
    }
    case 'list':
      print(listFamilies(repoRoot, root));
      return 0;
    default:
      console.log(
        'family alt komutları: plan | check | publish | status | verify | list (bkz. context --json)',
      );
      return 1;
  }
}
