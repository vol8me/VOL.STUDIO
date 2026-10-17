#!/usr/bin/env node
/**
 * UI yüzey kaydı yardımcısı.
 *
 *   node scripts/quality/cli/ui-registry.mjs --check
 *   node scripts/quality/cli/ui-registry.mjs --suggest <ExportAdı>
 *   node scripts/quality/cli/ui-registry.mjs --states [UI-03 UI-04 ...]
 *
 * `--suggest` yeni bir export'u kaydederken bağlanabilecek gerçek doğrulama
 * taşıyan testleri (adı tanımlayıcı olarak kullanan ve `expect` çağıran blok) listeler.
 * `--states` tier-1 export'ların uygulanabilir durumlarından hangisinin teste bağlı, hangisinin
 * (kanıtsız değil, bağlanmamış olarak) açık olduğunu fazlara göre yazar; fazlar verilmezse UI-03/04/05/08.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STATE_FIXTURES_PATH } from '../uiEvidence.mjs';
import {
  REGISTRY_PATH,
  stateCoverage,
  suggestEvidence,
  uiSurface,
  volTestImports,
  validateRepoUiRegistry,
} from '../uiRegistry.mjs';

const root = process.cwd();
const [flag, ...rest] = process.argv.slice(2);
const name = rest[0];

/** UI-08.4: erken tier-1 kapsamın fazları. UI-13.1 tam kapanışta hepsini ister. */
const EARLY_PHASES = ['UI-03', 'UI-04', 'UI-05', 'UI-08'];

function printStates(phases) {
  const registry = JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), 'utf8'));
  const fixturePath = resolve(root, STATE_FIXTURES_PATH);
  const fixtures = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;
  const rows = stateCoverage(registry, { phases, tier: 1, fixtures });
  for (const phase of phases) {
    const inPhase = rows.filter((row) => row.phase === phase);
    const sum = (key) => inPhase.reduce((total, row) => total + row[key].length, 0);
    const applicable = inPhase.reduce((total, row) => total + row.applicable, 0);
    console.log(
      `${phase} (tier 1, ${inPhase.length} export): ${applicable} uygulanabilir durum — ` +
        `${sum('bound')} teste bağlı, ${sum('fixtured')} fixture ile sınanıyor, ` +
        `${sum('na')} gerekçeli N/A, ${sum('open')} açık`,
    );
    for (const row of inPhase.filter((r) => r.open.length > 0))
      console.log(`  ${row.export}: açık ${row.open.join(', ')}`);
  }
}

if (flag === '--summary') {
  const surface = uiSurface(root);
  const usage = volTestImports(root, new Set(surface.classes.map((entry) => entry.name)));
  const registry = JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), 'utf8'));
  const fixtures = JSON.parse(readFileSync(resolve(root, STATE_FIXTURES_PATH), 'utf8'));
  const rows = stateCoverage(registry, { tier: 1, fixtures });
  const sum = (key) => rows.reduce((total, row) => total + row[key].length, 0);
  console.log(
    JSON.stringify(
      {
        classes: surface.classes.length,
        helpers: surface.helpers.length,
        types: surface.types,
        directClasses: usage.used.size,
        tier1: { bound: sum('bound'), fixtured: sum('fixtured'), open: sum('open'), na: sum('na') },
      },
      null,
      2,
    ),
  );
} else if (flag === '--suggest' && name) {
  const found = suggestEvidence(root, name, 5);
  if (found.length === 0) {
    console.log(`${name}: doğrulama taşıyan test bulunamadı; registry'ye gap (sahip görevli) yaz.`);
    process.exit(1);
  }
  console.log(JSON.stringify(found, null, 2));
} else if (flag === '--states') {
  printStates(rest.length > 0 ? rest : EARLY_PHASES);
} else if (flag === '--check' || flag === undefined) {
  const problems = validateRepoUiRegistry(root);
  for (const problem of problems) console.error(problem);
  console.log(`[ui-registry] ${problems.length === 0 ? 'geçerli' : `${problems.length} ihlal`}`);
  process.exit(problems.length === 0 ? 0 : 1);
} else {
  console.error(
    'Kullanım: ui-registry.mjs --check | --summary | --suggest <ExportAdı> | --states [UI-NN ...]',
  );
  process.exit(2);
}
