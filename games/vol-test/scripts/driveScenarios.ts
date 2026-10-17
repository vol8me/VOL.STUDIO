import { Predict, PredictionStepper, type Room } from '@volstudio/network/client';
import {
  type JsonlReport,
  judgeFleet,
  MetricsPoller,
  runFleet,
  type FleetBudget,
} from '@volstudio/network/drive';
import { isReconciliationSample } from '@volstudio/network/protocol';
import { GAME } from '../src/config/game';
import { NETWORK } from '../src/config/network';
import { VEHICLE_IDS } from '../src/config/vehicles';
import { EVENT_MESSAGE, isEventBatch } from '../src/network/events';
import { PredictedPilot } from '../src/network/PredictedPilot';
import { ROOM } from '../src/network/rooms';
import { WORLD_SCHEMA, type PlayerSnapshot, type WorldSnapshot } from '../src/network/schema';
import { idleCommand, type TankCommand } from '../src/sim/command';
import { createBattleWorld } from '../src/sim/world/battleWorld';

export const DRIVE_SCENARIOS = ['idle', 'maneuver', 'fire'] as const;
export type DriveScenario = (typeof DRIVE_SCENARIOS)[number];

/** Fazlar simülasyon adımından türer; zamanlayıcının kaç defa çağrıldığına bağlı değildir. */
export function scenarioCommand(
  scenario: DriveScenario,
  progress: number,
  heading = Math.PI / 2,
): { phase: string; command: TankCommand } {
  const command = idleCommand();
  if (scenario === 'idle' || progress >= 1) return { phase: 'idle', command };
  if (scenario === 'fire') {
    command.aimX = Math.cos(progress * Math.PI);
    command.aimY = Math.sin(progress * Math.PI);
    command.fire = true;
    return { phase: 'fire', command };
  }
  if (progress < 0.5) {
    command.moveX = Math.cos(heading);
    command.moveY = Math.sin(heading);
    return { phase: 'forward', command };
  }
  if (progress < 0.75) {
    command.brake = true;
    return { phase: 'brake', command };
  }
  command.moveX = Math.cos(heading - Math.PI / 2);
  command.moveY = Math.sin(heading - Math.PI / 2);
  return { phase: 'turn', command };
}

export class ScenarioEvidence {
  readonly phases = new Set<string>();
  steps = 0;
  observations = 0;
  distance = 0;
  turn = 0;
  fired = 0;
  finite = true;
  brakeStartSpeed: number | null = null;
  brakeEndSpeed: number | null = null;
  private origin: { x: number; y: number; hull: number } | null = null;

  observe(self: PlayerSnapshot, phase: string): void {
    this.observations++;
    this.finite &&= [self.x, self.y, self.hull, self.vx, self.vy].every(Number.isFinite);
    this.origin ??= { x: self.x, y: self.y, hull: self.hull };
    this.distance = Math.max(
      this.distance,
      Math.hypot(self.x - this.origin.x, self.y - this.origin.y),
    );
    this.turn = Math.max(
      this.turn,
      Math.abs(
        Math.atan2(Math.sin(self.hull - this.origin.hull), Math.cos(self.hull - this.origin.hull)),
      ),
    );
    if (phase === 'brake') {
      const speed = Math.hypot(self.vx, self.vy);
      this.brakeStartSpeed ??= speed;
      this.brakeEndSpeed = speed;
    }
  }

  checks(scenario: DriveScenario, expectedSteps: number) {
    const checks = {
      completed: this.steps >= expectedSteps,
      authoritativeState: this.observations > 1 && this.finite,
      behavior:
        scenario === 'fire'
          ? this.fired > 0
          : scenario === 'idle'
            ? this.fired === 0 && this.distance <= 1 && this.turn <= 0.01
            : this.distance > 1 &&
              this.turn > 0.01 &&
              this.phases.has('turn') &&
              this.brakeStartSpeed !== null &&
              this.brakeEndSpeed !== null &&
              this.brakeEndSpeed < this.brakeStartSpeed,
    };
    return { pass: Object.values(checks).every(Boolean), checks };
  }
}

interface PilotRun {
  readonly heading: number;
  readonly room: Room<WorldSnapshot>;
  readonly pilot: PredictedPilot;
  readonly stepper: PredictionStepper;
  readonly evidence: ScenarioEvidence;
  readonly unsubscribe: () => void;
  phase: string;
  lastTick: number;
  measured: boolean;
  reported: boolean;
}

export interface ScenarioOptions {
  readonly scenario: DriveScenario;
  readonly endpoint: string;
  readonly clients: number;
  readonly durationMs: number;
  readonly rampMs?: number;
  readonly metricsUrl?: string;
  readonly report: JsonlReport;
  readonly budget?: FleetBudget;
  readonly reconnect?: boolean;
  readonly signal?: AbortSignal;
}

/** Gerçek SDK, oyunla aynı öngörü ve yetkili durum/olay gözlemi. Canvas veya tarayıcı taklit edilmez. */
export async function runScenario(options: ScenarioOptions) {
  if (!DRIVE_SCENARIOS.includes(options.scenario)) throw new RangeError('Senaryo tanınmıyor.');
  if (!Number.isFinite(options.durationMs) || options.durationMs < 1000)
    throw new RangeError('Senaryo süresi en az 1000 ms olmalı.');
  const rampMs = options.rampMs ?? options.clients * 50;
  const totalMs = options.durationMs + rampMs + NETWORK.metricsReportMs * 2;
  if (
    !Number.isSafeInteger(options.clients) ||
    options.clients < 1 ||
    !Number.isFinite(rampMs) ||
    rampMs < 0 ||
    totalMs > 2_147_483_647
  )
    throw new RangeError('İstemci sayısı ve rampa geçerli timer aralığında olmalı.');
  const { scenario, report } = options;
  const runs = new Map<number, PilotRun>();
  const space = createBattleWorld();
  const expectedSteps = Math.ceil(options.durationMs / GAME.simulationStepMs);
  const poller = new MetricsPoller({
    url: options.metricsUrl,
    intervalMs: 250,
    onError: () => report.write('scenario.metricsError', { scenario }),
    onSample: (value) => {
      const metrics = value as { rooms?: unknown[] };
      // İşletim yanıtından yalnız bu koşunun botları seçilir; oda/oturum kimlikleri kayda girmez.
      for (const value of metrics.rooms ?? []) {
        const room = value as {
          id?: string;
          clients?: Array<{
            client: number;
            vehicle: number;
            traffic?: { measured?: boolean; sentBytes?: number; receivedBytes?: number };
            reconciliation?: unknown;
          }>;
        };
        for (const [bot, run] of runs) {
          if (run.room.roomId !== room.id) continue;
          const peer = room.clients?.find((client) => client.vehicle === run.pilot.vehicle.id);
          if (!peer) continue;
          const traffic = peer.traffic;
          const reconciliation = peer.reconciliation;
          run.measured ||=
            traffic?.measured === true &&
            typeof traffic.sentBytes === 'number' &&
            traffic.sentBytes > 0 &&
            typeof traffic.receivedBytes === 'number' &&
            traffic.receivedBytes > 0;
          run.reported ||=
            isReconciliationSample(reconciliation) &&
            reconciliation.reconciliations > 0 &&
            reconciliation.liveSteps > 0;
          report.write('scenario.server', { scenario, bot, traffic, reconciliation });
        }
      }
    },
  });
  try {
    report.write('scenario.start', {
      scenario,
      clients: options.clients,
      durationMs: options.durationMs,
    });
    const summary = await runFleet<WorldSnapshot>({
      endpoint: options.endpoint,
      roomName: ROOM.world,
      schema: WORLD_SCHEMA,
      clients: options.clients,
      rampMs: options.rampMs,
      reconnect: options.reconnect,
      signal: options.signal,
      // Son fazın yetkili yaması ve sayaç bildirimi için bir rapor aralığı bırakılır.
      durationMs: totalMs,
      actMs: 8,
      report,
      joinOptions: (index) => ({
        name: `${NETWORK.fallbackName}-bot${index}`,
        model: index % VEHICLE_IDS.length,
      }),
      act: ({ index, room }) => {
        let run = runs.get(index);
        if (!run) {
          const self = room.state?.players.get(room.sessionId);
          if (!self) return;
          const predict = Predict.get(room);
          const pilot = new PredictedPilot({
            room,
            predict,
            self,
            space,
            divergenceTolerance: NETWORK.divergenceTolerance,
          });
          const evidence = new ScenarioEvidence();
          const unsubscribe = room.onMessage(EVENT_MESSAGE, (batch: unknown) => {
            if (!isEventBatch(batch)) return;
            evidence.fired += batch.events.filter(
              (event) => event.kind === 'fired' && event.source === self.vehicleId,
            ).length;
          });
          run = {
            room,
            pilot,
            stepper: new PredictionStepper(predict, {
              maxSliceMs: GAME.simulationStepMs * NETWORK.prediction.sliceSteps,
              maxSlices: NETWORK.prediction.maxSlices,
              maxSteps: NETWORK.inputBuffer,
            }),
            evidence,
            unsubscribe,
            heading: self.hull,
            phase: '',
            lastTick: -1,
            measured: false,
            reported: false,
          };
          runs.set(index, run);
        }
        const at = performance.now();
        run.stepper.advance(at, () => {
          const { command, phase } = scenarioCommand(
            scenario,
            run.evidence.steps / expectedSteps,
            run.heading,
          );
          if (phase !== run.phase)
            report.write('scenario.phase', {
              scenario,
              bot: index,
              phase,
              step: run.evidence.steps,
              command,
            });
          run.phase = phase;
          run.evidence.phases.add(phase);
          run.pilot.send(command);
          run.evidence.steps++;
        });
        const self = room.state.players.get(room.sessionId);
        if (self && room.state.tick !== run.lastTick) {
          run.lastTick = room.state.tick;
          run.evidence.observe(self, run.phase);
        }
        run.pilot.reportMetrics(at);
      },
    });
    await poller.stop();
    const bots = [...runs].map(([bot, run]) => ({
      bot,
      ...run.evidence.checks(scenario, expectedSteps),
      observed: {
        steps: run.evidence.steps,
        states: run.evidence.observations,
        distance: run.evidence.distance,
        turn: run.evidence.turn,
        fired: run.evidence.fired,
        brakeStartSpeed: run.evidence.brakeStartSpeed,
        brakeEndSpeed: run.evidence.brakeEndSpeed,
      },
      reconciliation: run.pilot.metricsSnapshot,
      transportMeasured: run.measured,
      serverReported: run.reported,
    }));
    const performanceVerdict = options.budget
      ? judgeFleet(summary, options.budget, poller.observation)
      : null;
    const complete =
      !options.signal?.aborted &&
      runs.size === options.clients &&
      bots.every((bot) => bot.transportMeasured && bot.serverReported) &&
      (performanceVerdict?.complete ?? true);
    const pass =
      !options.signal?.aborted &&
      bots.length === options.clients &&
      bots.every((bot) => bot.pass) &&
      summary.dropped === 0 &&
      summary.errors === 0 &&
      summary.actErrors === 0 &&
      Object.values(summary.joinFailures).every((count) => count === 0) &&
      (performanceVerdict?.pass ?? true);
    const verdict = {
      scenario,
      pass,
      complete,
      metricsErrors: poller.errors,
      bots,
      performance: performanceVerdict,
    };
    report.write('scenario.verdict', verdict);
    return { summary, verdict };
  } finally {
    await poller.stop();
    for (const run of runs.values()) {
      run.stepper.dispose();
      run.unsubscribe();
      run.pilot.dispose();
    }
  }
}
