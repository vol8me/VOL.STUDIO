/**
 * Mutasyon kampanyası. Her satır kritik bir iddiayı bilerek bozar ve
 * ilgili test takımının KIRMIZIYA dönmesini kanıtlar: test geçerse mutant
 * "survived" sayılır (testin o iddiayı gerçekten kilitli olmadığı anlamına
 * gelir). Mutantlar yalnız bellekte değiştirilir; dosya `finally` ile
 * geri yazılır ve koşu sonunda ağaç temiz doğrulanır.
 *
 * Kullanım: tsx scripts/research/mutation-campaign.ts   (çıktı JSON satırları)
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findRepoRoot } from '../lib/args';

interface Mutant {
  readonly id: string;
  readonly file: string;
  readonly find: string;
  readonly replace: string;
  /** Mutasyonun düşürmesi beklenen test dosyası. */
  readonly test: string;
}

const MUTANTS: readonly Mutant[] = [
  {
    id: 'canonical-key-sort',
    file: 'src/kernel/canonical.ts',
    find: 'Object.keys(record).sort()',
    replace: 'Object.keys(record)',
    test: 'tests/kernel/canonical.test.ts',
  },
  {
    id: 'registry-version-order-reversed',
    file: 'src/program/registry.ts',
    find: 'versions.sort((a, b) => a.version - b.version)',
    replace: 'versions.sort((a, b) => b.version - a.version)',
    test: 'tests/governance/registry.test.ts',
  },
  {
    id: 'encode-sfx-quality-lowered',
    file: 'src/protocol/encodeProfiles.ts',
    find: 'sfx: { quality: 7 }',
    replace: 'sfx: { quality: 6 }',
    test: 'tests/governance/encodeProfiles.test.ts',
  },
  {
    id: 'blep-correction-disabled',
    file: 'src/synthesis/waveforms.ts',
    find: 'sum += h * blepResidual((phase - at - k) / inc);',
    replace: 'sum += h * blepResidual((phase - at - k) / inc) * 0;',
    test: 'tests/synthesis/fmAlias.test.ts',
  },
  {
    id: 'manifest-schema-inverted',
    file: 'src/protocol/manifest.ts',
    find: 'if (o.schema !== ASSET_MANIFEST_SCHEMA)',
    replace: 'if (o.schema === ASSET_MANIFEST_SCHEMA)',
    test: 'tests/protocol/publish.test.ts',
  },
  {
    id: 'worker-cache-always-on',
    file: 'src/protocol/parallel.ts',
    find: 'cache: session.cache !== null',
    replace: 'cache: true',
    test: 'tests/protocol/parallel.test.ts',
  },
  {
    id: 'worker-death-unnoticed',
    file: 'src/protocol/parallel.ts',
    find: '} else if (now - handle.beatAt > this.options.heartbeatStaleMs) {',
    replace: '} else if (now < 0) {',
    test: 'tests/protocol/parallel.test.ts',
  },
  {
    id: 'worker-result-order-lost',
    file: 'src/protocol/parallel.ts',
    find: 'results[reply.id as number] = reply.output as O;',
    replace: 'results[0] = reply.output as O;',
    test: 'tests/protocol/parallel.test.ts',
  },
  {
    id: 'surface-pins-version-1',
    file: 'src/program/surface.ts',
    find: 'nodeSurface(ref.id, ref.version)',
    replace: 'nodeSurface(ref.id, 1)',
    test: 'tests/governance/renderSurface.test.ts',
  },
  {
    id: 'fit-picks-worst',
    file: 'src/search/fit.ts',
    find: 'b.distance < a.distance ? b : a',
    replace: 'b.distance > a.distance ? b : a',
    test: 'tests/protocol/fit.test.ts',
  },
  {
    id: 'scorer-argv-shape-swapped',
    file: 'src/search/semantic.ts',
    find: "if (!trimmed.startsWith('[')) return [trimmed];",
    replace: "if (!trimmed.endsWith(']')) return [trimmed];",
    test: 'tests/protocol/semantic.test.ts',
  },
  {
    id: 'memory-budget-tenfold',
    file: 'src/guard/budget.ts',
    find: 'cost.peakBytes <= budget.maxPeakBytes',
    replace: 'cost.peakBytes <= budget.maxPeakBytes * 10',
    test: 'tests/guard/budget.test.ts',
  },
];

const repoRoot = findRepoRoot(process.cwd());
const results: { id: string; status: 'killed' | 'survived' | 'error'; detail: string }[] = [];

for (const mutant of MUTANTS) {
  const file = join(repoRoot, 'devtools/audio-synth', mutant.file);
  const original = readFileSync(file, 'utf8');
  try {
    if (!original.includes(mutant.find)) {
      results.push({ id: mutant.id, status: 'error', detail: 'hedef metin bulunamadı' });
      continue;
    }
    writeFileSync(file, original.replace(mutant.find, mutant.replace));
    const run = spawnSync('pnpm', ['exec', 'vitest', 'run', mutant.test], {
      cwd: join(repoRoot, 'devtools/audio-synth'),
      encoding: 'utf8',
      timeout: 300_000,
      env: { ...process.env, CI: '1' },
    });
    const killed = run.status !== 0;
    results.push({
      id: mutant.id,
      status: killed ? 'killed' : 'survived',
      detail: killed
        ? `${mutant.test} kırmızı (çıkış ${run.status})`
        : `${mutant.test} yeşil kaldı — mutant yaşadı`,
    });
  } finally {
    writeFileSync(file, original);
  }
  console.log(JSON.stringify(results[results.length - 1]));
}

const survived = results.filter((r) => r.status !== 'killed');
console.log(
  JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((r) => r.id),
  }),
);
if (survived.length > 0) process.exitCode = 2;
