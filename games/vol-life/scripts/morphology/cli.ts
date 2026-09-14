#!/usr/bin/env tsx
import { defaultPhysicsGenome, type PhysicsGenome } from '@/config/genome';
import { substrateConfig } from '@/config/substrate';
import { ResearchHarness, type ResearchHarnessConfig } from './harness';
import { isQualified } from './qualification';
import { PromotionFlow } from './promotion';

interface CliArgs {
  readonly stage: 'broad' | 'refinement' | 'qualification' | 'all';
  readonly candidateCount: number;
  readonly json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let stage: CliArgs['stage'] = 'all';
  let candidateCount = 30;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--stage' && args[i + 1]) {
      stage = args[i + 1] as CliArgs['stage'];
      i++;
    } else if (arg === '--candidates' && args[i + 1]) {
      candidateCount = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return { stage, candidateCount, json };
}

function printUsage(): void {
  console.log(`
VOL.LIFE Morphology Discovery Harness

Kullanım:
  tsx scripts/morphology/cli.ts [seçenekler]

Seçenekler:
  --stage <broad|refinement|qualification|all>  Araştırma aşaması (varsayılan: all)
  --candidates <sayı>                          Aday sayısı (varsayılan: 30)
  --json                                       JSON çıktı
  --help                                       Bu yardım
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const config: Partial<ResearchHarnessConfig> = {
    candidateCount: args.candidateCount,
  };
  const harness = new ResearchHarness(config);
  const promotion = new PromotionFlow();
  const results: Record<string, unknown> = {};
  if (args.stage === 'broad' || args.stage === 'all') {
    console.error('Broad aşaması koşuluyor...');
    const broad = harness.runBroad();
    results.broad = broad.map((c) => ({
      genomeDigest: c.genomeDigest,
      phase: c.phase.phase,
      structured: c.structured,
      seedPhases: c.seedResults.map((s) => s.phase.phase),
    }));
    console.error(
      `Broad tamam: ${broad.length} aday, ${broad.filter((c) => c.structured).length} yapısal`,
    );
  }
  if (args.stage === 'refinement' || args.stage === 'all') {
    console.error('Refinement aşaması koşuluyor...');
    const broad = harness.runBroad();
    const refinement = harness.runRefinement(broad);
    results.refinement = refinement.map((c) => ({
      genomeDigest: c.genomeDigest,
      phase: c.phase.phase,
      structured: c.structured,
    }));
    console.error(
      `Refinement tamam: ${refinement.length} aday, ${
        refinement.filter((c) => c.structured).length
      } yapısal`,
    );
  }
  if (args.stage === 'qualification' || args.stage === 'all') {
    console.error('Qualification aşaması koşuluyor...');
    const broad = harness.runBroad();
    const refinement = harness.runRefinement(broad);
    const artefacts = harness.runQualification(refinement);
    results.qualification = artefacts.map((a) => ({
      genomeDigest: a.genomeDigest,
      phase: a.phase.phase,
      qualified: isQualified(a),
      rejectionCount: a.rejectionReasons.length,
      humanAcceptance: a.humanAcceptance,
    }));
    for (const artefact of artefacts) {
      const decision = promotion.evaluate(artefact);
      if (decision.promoted) {
        console.error(`Promoted: ${decision.genomeDigest}`);
      }
    }
    const promotedDigests = promotion.promotedGenomes.map((r) => r.genomeDigest);
    results.promoted = promotedDigests;
    console.error(
      `Qualification tamam: ${artefacts.length} artefakt, ${promotedDigests.length} promoted`,
    );
  }
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log('\nÖzet:');
    for (const [stage, data] of Object.entries(results)) {
      if (Array.isArray(data)) {
        console.log(`  ${stage}: ${data.length} sonuç`);
      } else {
        console.log(`  ${stage}: ${JSON.stringify(data)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
