import type { ResearchStageConfig } from './harness';

/**
 * Araştırma hunisi (E13). Her aşama AYRI bir komuttur ve hiçbir komut önceki
 * aşamayı örtük olarak yeniden koşmaz; `--stage all` kaldırıldı çünkü tek
 * komutla saatlerce koşan bir zincir, hangi sonucun hangi girdiden çıktığını
 * takip edilemez hâle getiriyordu.
 */
export const FUNNEL_COMMANDS = [
  'calibrate',
  'seeding',
  'broad',
  'refine',
  'audition',
  'shortlist',
  'qualify',
  'accept',
  'promote',
  'canary',
] as const;

export type FunnelCommand = (typeof FUNNEL_COMMANDS)[number];

/** Simülasyon koşan komutlar; diğerleri seçim/karar adımlarıdır. */
const SIMULATING: readonly FunnelCommand[] = [
  'calibrate',
  'seeding',
  'broad',
  'refine',
  'qualify',
  'canary',
];

export interface Calibration {
  /** ÖLÇÜLMÜŞ tick maliyeti; tahmin buradan çıkar, sabitten değil. */
  readonly msPerTick: number;
  readonly particleCount: number;
  readonly measuredAtMs: number;
}

export interface FunnelStages {
  readonly seeding: ResearchStageConfig;
  readonly broad: ResearchStageConfig;
  readonly refinement: ResearchStageConfig;
  readonly qualification: ResearchStageConfig;
  readonly canary: ResearchStageConfig;
}

export interface FunnelOptions {
  readonly command: FunnelCommand;
  readonly candidateCount: number;
  readonly workerCount: number;
  readonly outputDir?: string;
  readonly yes: boolean;
  readonly calibration?: Calibration;
  /** `accept` komutu için açık karar; yokluğunda karar UYDURULMAZ. */
  readonly decision?: 'accepted' | 'rejected';
}

export interface FunnelPlan {
  readonly command: FunnelCommand;
  readonly candidateCount: number;
  readonly seedCount: number;
  readonly tickCount: number;
  readonly workerCount: number;
  readonly totalTicks: number;
  /** Kalibrasyon yoksa `undefined`; "0 dakika" yazmak yalan olurdu. */
  readonly estimatedMs?: number;
}

/** §E13: tahmini süresi bunu aşan koşu açık onay ister. */
export const CONFIRMATION_THRESHOLD_MS = 10 * 60 * 1000;

export function planCommand(options: FunnelOptions, stages: FunnelStages): FunnelPlan {
  const stage = stageFor(options.command, stages);
  const simulating = SIMULATING.includes(options.command);
  const candidateCount = simulating ? options.candidateCount : 0;
  const seedCount = stage?.seedCount ?? 0;
  const tickCount = stage?.tickCount ?? 0;
  const totalTicks = simulating ? Math.max(1, candidateCount) * seedCount * tickCount : 0;
  const workerCount = Math.max(1, options.workerCount);
  const estimatedMs = options.calibration
    ? (totalTicks * options.calibration.msPerTick) / workerCount
    : undefined;
  return {
    command: options.command,
    candidateCount,
    seedCount,
    tickCount,
    workerCount,
    totalTicks,
    estimatedMs,
  };
}

function stageFor(command: FunnelCommand, stages: FunnelStages): ResearchStageConfig | undefined {
  switch (command) {
    case 'seeding':
      return stages.seeding;
    case 'broad':
      return stages.broad;
    case 'refine':
      return stages.refinement;
    case 'qualify':
      return stages.qualification;
    case 'canary':
      return stages.canary;
    case 'calibrate':
      return { tickCount: 600, seedCount: 1, sampleInterval: 60 };
    default:
      return undefined;
  }
}

/** Koşu BAŞLAMADAN önce yazılır; kullanıcı neye girdiğini bilerek girer. */
export function formatPreflight(plan: FunnelPlan): string {
  const lines = [
    `komut: ${plan.command}`,
    `aday: ${plan.candidateCount}`,
    `seed: ${plan.seedCount}`,
    `tick: ${plan.tickCount}`,
    `worker: ${plan.workerCount}`,
    `toplam tick: ${plan.totalTicks}`,
  ];
  lines.push(
    plan.estimatedMs === undefined
      ? 'tahmini süre: KALİBRASYON YOK (önce `calibrate` koşun)'
      : `tahmini süre: ~${(plan.estimatedMs / 60000).toFixed(1)} dk`,
  );
  return lines.join('\n');
}

export class FunnelRefusal extends Error {}

/**
 * İki koruma: checkpoint'siz koşu reddedilir (yarıda kesilen iş çöpe gider) ve
 * uzun koşu açık onay ister.
 */
export function assertRunnable(plan: FunnelPlan, options: FunnelOptions): void {
  if (!options.outputDir || options.outputDir.trim().length === 0) {
    throw new FunnelRefusal('Çıktı dizini zorunlu: checkpoint olmadan koşu reddedilir (--out).');
  }
  if (options.command === 'accept' && options.decision === undefined) {
    throw new FunnelRefusal('`accept` açık karar ister (--decision accepted|rejected).');
  }
  if (plan.totalTicks > 0 && plan.estimatedMs === undefined && !options.yes) {
    throw new FunnelRefusal('Kalibrasyon yok: süre bilinmeden koşu için --yes gerekir.');
  }
  if (
    plan.estimatedMs !== undefined &&
    plan.estimatedMs > CONFIRMATION_THRESHOLD_MS &&
    !options.yes
  ) {
    throw new FunnelRefusal(
      `Tahmini süre ${(plan.estimatedMs / 60000).toFixed(1)} dk > 10 dk; --yes gerekir.`,
    );
  }
}

/** Bir komutun koşacağı aşamalar; hiçbiri öncekini İÇERMEZ (örtük koşu yok). */
export function stagesRunBy(command: FunnelCommand): readonly FunnelCommand[] {
  return [command];
}
