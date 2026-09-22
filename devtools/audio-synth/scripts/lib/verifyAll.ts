/**
 * `audio:job verify` — yayımlanmış her şeyi YALNIZ kendi kayıtlarından
 * doğrular: manifest'ler (yeniden render + yeniden kodlama), kayıtlı aramalar
 * (spec'ten yeniden üretim) ve aile bank'ları (bağlar + yeniden genişletme).
 * JSON çıktısı her öğenin kendi `schema` alanını taşıyan tek bir dizidir.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkRepoRelative,
  DEFAULT_FAMILIES_ROOT,
  DEFAULT_SEARCHES_ROOT,
  listFamilies,
  listSearches,
  surveyTargets,
  verifyFamily,
  verifyManifest,
  verifySearch,
} from '../../src/protocol';
import { print, type Parsed } from './args';

function manifestsUnder(repoRoot: string): string[] {
  const out: string[] = [];
  for (const target of surveyTargets(repoRoot).publishable) {
    const walk = (rel: string) => {
      const abs = join(repoRoot, rel);
      if (!existsSync(abs)) return;
      for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const child = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(child);
        else if (entry.name.endsWith('.json') && !entry.name.startsWith('.')) out.push(child);
      }
    };
    walk(`${target.packagePath}/${target.manifestRoot}`);
  }
  return out.sort();
}

export function runVerifyCommand(parsed: Parsed, repoRoot: string): number {
  const all = parsed.flags.has('all');
  const manifests = (
    all ? manifestsUnder(repoRoot) : [checkRepoRelative(parsed.positional[0], 'manifest')]
  ).map((manifest) => verifyManifest(repoRoot, manifest));
  const searches = all
    ? listSearches(repoRoot, DEFAULT_SEARCHES_ROOT).map((searchId) =>
        verifySearch({ repoRoot, searchesRoot: DEFAULT_SEARCHES_ROOT, searchId }),
      )
    : [];
  const families = all
    ? listFamilies(repoRoot, DEFAULT_FAMILIES_ROOT).map((familyId) =>
        verifyFamily({ repoRoot, familiesRoot: DEFAULT_FAMILIES_ROOT, familyId }),
      )
    : [];
  if (parsed.flags.has('json')) print([...manifests, ...searches, ...families]);
  else {
    for (const r of manifests) {
      console.log(
        `${r.ok ? '✓' : '✗'} ${r.manifest}  değişim: ${r.change}  pcm ${r.current.pcmHash.slice(
          7,
          19,
        )}`,
      );
      for (const check of r.checks.filter((c) => !c.ok))
        console.log(`    ✗ ${check.name}: ${check.detail}`);
    }
    for (const r of searches)
      console.log(`${r.ok ? '✓' : '✗'} ${r.search}  ${r.checks.map((c) => c.detail).join(' · ')}`);
    for (const r of families)
      console.log(
        `${r.complete ? '✓' : '✗'} ${r.bank}  ${r.checks.map((c) => c.detail).join(' · ')}`,
      );
    console.log(`${manifests.filter((r) => r.ok).length}/${manifests.length} manifest doğrulandı.`);
    if (all) {
      console.log(`${searches.filter((r) => r.ok).length}/${searches.length} arama doğrulandı.`);
      console.log(
        `${families.filter((r) => r.complete).length}/${families.length} aile bank'ı tamam.`,
      );
    }
  }
  return manifests.every((r) => r.ok) &&
    searches.every((r) => r.ok) &&
    families.every((r) => r.complete)
    ? 0
    : 1;
}
