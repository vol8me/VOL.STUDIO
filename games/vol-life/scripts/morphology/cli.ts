#!/usr/bin/env tsx
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { substrateConfig } from '@/config/substrate';
import { defaultHarnessConfig, ResearchHarness } from './harness';
import {
  FUNNEL_COMMANDS,
  FunnelRefusal,
  assertRunnable,
  formatPreflight,
  planCommand,
  type Calibration,
  type FunnelCommand,
  type FunnelOptions,
  type FunnelStages,
} from './funnel';
import { measureCalibration } from './calibration';
import { buildFromRecords, formatShortlistReport, parseCandidateRecords } from './auditionCommand';
import { AUDITION_SEED_COUNT, serializeAuditionCatalog } from '@/config/auditionCatalog';
import { readSeedCorpus } from './seedCorpus';
import { createGitProvider, readSourceState } from './sourceState';
import { parseQualificationArtefact, serializeArtefact } from './qualification';

/*
 * Huni komutları (E13). Her komut YALNIZ kendi aşamasını koşar; `--stage all`
 * yoktur. Koşu başlamadan önce aday/seed/tick/worker ve kalibrasyondan
 * hesaplanmış tahmini süre yazılır.
 */
interface CliArgs extends FunnelOptions {
  readonly json: boolean;
  readonly artefactPath?: string;
  /** shortlist/audition girdisi: broad koşusunun aday kayıtları. */
  readonly fromPath: string;
  readonly corpusPath: string;
}

const DEFAULT_RECORDS = 'benchmarks/results/f3-candidates.jsonl';
const DEFAULT_CORPUS = 'benchmarks/fixtures/corpus-v1.json';

function parseArgs(argv: readonly string[]): CliArgs {
  const args = argv.slice(2);
  const command = args[0] as FunnelCommand | undefined;
  if (!command || !FUNNEL_COMMANDS.includes(command)) {
    printUsage();
    process.exit(command === undefined ? 0 : 2);
  }
  let candidateCount = 30;
  let workerCount = 1;
  let outputDir: string | undefined;
  let yes = false;
  let json = false;
  let decision: 'accepted' | 'rejected' | undefined;
  let artefactPath: string | undefined;
  let fromPath = DEFAULT_RECORDS;
  let corpusPath = DEFAULT_CORPUS;
  for (let index = 1; index < args.length; index++) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === '--candidates' && next) candidateCount = Number.parseInt(next, 10);
    else if (arg === '--workers' && next) workerCount = Number.parseInt(next, 10);
    else if (arg === '--out' && next) outputDir = next;
    else if (arg === '--artefact' && next) artefactPath = next;
    else if (arg === '--decision' && (next === 'accepted' || next === 'rejected')) decision = next;
    else if (arg === '--yes') yes = true;
    else if (arg === '--from' && next) fromPath = next;
    else if (arg === '--corpus' && next) corpusPath = next;
    else if (arg === '--json') json = true;
  }
  return {
    command,
    candidateCount,
    workerCount,
    outputDir,
    yes,
    json,
    decision,
    artefactPath,
    fromPath,
    corpusPath,
  };
}

function printUsage(): void {
  console.log(`
VOL.LIFE araştırma hunisi

Kullanım:
  tsx scripts/morphology/cli.ts <komut> --out <dizin> [seçenekler]

Komutlar:
  ${FUNNEL_COMMANDS.join(', ')}

Seçenekler:
  --out <dizin>        Çıktı ve checkpoint dizini (ZORUNLU)
  --candidates <n>     Aday sayısı (varsayılan 30)
  --workers <n>        Worker sayısı (varsayılan 1)
  --yes                Tahmini süresi 10 dakikayı aşan koşuyu onayla
  --artefact <yol>     accept/promote için artefakt dosyası
  --from <yol>         shortlist/audition için aday kayıtları (jsonl)
  --corpus <yol>       tohum korpusu (varsayılan corpus-v1)
  --decision <karar>   accept için: accepted | rejected
  --json               JSON çıktı

Hiçbir komut önceki aşamayı örtük olarak koşmaz.
`);
}

function stagesOf(): FunnelStages {
  return {
    seeding: defaultHarnessConfig.seeding,
    broad: defaultHarnessConfig.broad,
    refinement: defaultHarnessConfig.refinement,
    qualification: defaultHarnessConfig.qualification,
    canary: defaultHarnessConfig.canary,
  };
}

function calibrationPath(outputDir: string): string {
  return join(outputDir, 'calibration.json');
}

function loadCalibration(outputDir?: string): Calibration | undefined {
  if (!outputDir) return undefined;
  const path = calibrationPath(outputDir);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as Calibration;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const calibration = loadCalibration(args.outputDir);
  const plan = planCommand({ ...args, calibration }, stagesOf());
  console.error(formatPreflight(plan));
  try {
    assertRunnable(plan, { ...args, calibration });
  } catch (error) {
    if (error instanceof FunnelRefusal) {
      console.error(`REDDEDİLDİ: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }
  const outputDir = args.outputDir as string;
  mkdirSync(outputDir, { recursive: true });

  switch (args.command) {
    case 'calibrate': {
      const measured = measureCalibration(substrateConfig);
      writeFileSync(calibrationPath(outputDir), JSON.stringify(measured, null, 2), 'utf8');
      console.log(JSON.stringify(measured, null, 2));
      return;
    }
    case 'broad':
    case 'seeding':
    case 'refine': {
      const harness = new ResearchHarness({
        candidateCount: args.candidateCount,
        workerCount: args.workerCount,
        outputDir,
      });
      const results = harness.runBroad();
      console.log(
        JSON.stringify(
          results.map((result) => ({
            digest: result.candidateDigest,
            majority: result.aggregation.majorityReason,
            structured: result.structured,
          })),
          null,
          2,
        ),
      );
      return;
    }
    case 'qualify': {
      const harness = new ResearchHarness({
        candidateCount: args.candidateCount,
        workerCount: args.workerCount,
        outputDir,
      });
      const broad = harness.runBroad();
      const artefacts = await harness.runQualification(broad);
      for (const artefact of artefacts) {
        writeFileSync(
          join(outputDir, `artefact-${artefact.candidateDigest}.json`),
          serializeArtefact(artefact),
          'utf8',
        );
      }
      console.log(`${artefacts.length} artefakt yazıldı: ${outputDir}`);
      return;
    }
    case 'shortlist':
    case 'audition': {
      if (!existsSync(args.fromPath)) {
        console.error(`REDDEDİLDİ: aday kaydı yok: ${args.fromPath} (önce broad koşusu).`);
        process.exit(2);
      }
      const records = parseCandidateRecords(readFileSync(args.fromPath, 'utf8'));
      const corpus = readSeedCorpus(args.corpusPath);
      const source = readSourceState(createGitProvider(process.cwd()));
      const build = buildFromRecords(records, {
        corpusId: corpus.id,
        // Audition tohumları korpusun İLK üçüdür; adaya göre seçilmez.
        seeds: corpus.seeds.slice(0, AUDITION_SEED_COUNT),
        sourceRevision: source.revision,
        sourceDirty: source.dirty,
      });
      console.log(formatShortlistReport(build));
      if (args.command === 'shortlist') return;
      const catalogPath = join(outputDir, 'audition-catalog.json');
      writeFileSync(catalogPath, serializeAuditionCatalog(build.catalog), 'utf8');
      console.log(`katalog yazıldı: ${catalogPath}`);
      return;
    }
    case 'accept': {
      if (!args.artefactPath) {
        console.error('REDDEDİLDİ: --artefact gerekli.');
        process.exit(2);
      }
      const artefact = parseQualificationArtefact(readFileSync(args.artefactPath, 'utf8'));
      // Karar YALNIZ açık komuttan yazılır; uydurulmaz.
      const updated = { ...artefact, humanAcceptance: args.decision as 'accepted' | 'rejected' };
      writeFileSync(args.artefactPath, serializeArtefact(updated), 'utf8');
      console.log(`karar yazıldı: ${args.decision}`);
      return;
    }
    default:
      console.error(
        `${args.command}: bu koşuda otomatik adım yok; çıktı dizinindeki artefaktlarla ilerleyin.`,
      );
      return;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
