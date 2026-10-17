import { afterEach, expect, it, vi } from 'vitest';
import { PredictionStepper } from '@volstudio/network/client';
import { JsonlReport } from '@volstudio/network/drive';
import { serveOps, type OpsServer } from '@volstudio/network/server';
import { PlayerState } from '@/network/schema';
import {
  DRIVE_SCENARIOS,
  runScenario,
  scenarioCommand,
  ScenarioEvidence,
} from '../../scripts/driveScenarios';
import { worldMetrics } from '../../server/index';
import { startServer, type TestServer } from '../support/netHarness';

let server: TestServer | undefined;
let ops: OpsServer | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await ops?.close();
  await server?.stop();
  ops = undefined;
  server = undefined;
});

it('fazlar belirli, eksik veya etkisiz yetkili davranış hükmü kırmızı kalır', () => {
  expect(scenarioCommand('maneuver', 0.1)).toMatchObject({
    phase: 'forward',
    command: { moveY: 1 },
  });
  expect(scenarioCommand('maneuver', 0.5)).toMatchObject({
    phase: 'brake',
    command: { brake: true },
  });
  expect(scenarioCommand('maneuver', 0.8)).toMatchObject({ phase: 'turn', command: { moveX: 1 } });
  expect(scenarioCommand('fire', 1).command.fire).toBe(false);
  const evidence = new ScenarioEvidence();
  expect(evidence.checks('idle', 1).pass).toBe(false);
  evidence.steps = 10;
  evidence.observe(new PlayerState(), 'forward');
  evidence.observe(new PlayerState(), 'turn');
  expect(evidence.checks('idle', 10).pass).toBe(true);
  evidence.observe(Object.assign(new PlayerState(), { x: 5 }), 'idle');
  expect(evidence.checks('idle', 10).pass).toBe(false);
  expect(evidence.checks('maneuver', 10).pass).toBe(false);
  expect(evidence.checks('fire', 10).pass).toBe(false);
  evidence.fired = 1;
  expect(evidence.checks('fire', 10).pass).toBe(true);
  evidence.observe(Object.assign(new PlayerState(), { x: NaN }), 'fire');
  expect(evidence.checks('fire', 10).pass).toBe(false);
});

it.each(DRIVE_SCENARIOS)(
  '%s: gerçek SDK girdisi, yetkili sonuç ve sunucu telemetrisi aynı raporda',
  async (scenario) => {
    const advance = vi.spyOn(PredictionStepper.prototype, 'advance');
    const dispose = vi.spyOn(PredictionStepper.prototype, 'dispose');
    server = await startServer();
    ops = await serveOps({ port: 0, metrics: () => worldMetrics(server!.guard) });
    const report = JsonlReport.toMemory();
    const { summary, verdict } = await runScenario({
      scenario,
      endpoint: server.endpoint,
      clients: 2,
      durationMs: 2000,
      metricsUrl: `${ops.endpoint}/metrics`,
      report,
    });
    expect(summary.actErrors).toBe(0);
    expect(advance).toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(verdict, JSON.stringify(verdict)).toMatchObject({
      pass: true,
      complete: true,
      metricsErrors: 0,
    });
    expect(verdict.bots).toHaveLength(2);
    for (const bot of verdict.bots) {
      expect(bot.reconciliation.liveSteps).toBeGreaterThan(0);
      expect(bot.reconciliation.reconciliations).toBeGreaterThan(0);
    }
    expect(report.records.filter((record) => record.ev === 'scenario.verdict')).toHaveLength(1);
    const samples = report.records.filter((record) => record.ev === 'scenario.server');
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample).not.toHaveProperty('sessionId');
      expect(sample).not.toHaveProperty('roomId');
      expect(sample.traffic).toMatchObject({ measured: true });
    }
  },
  10000,
);

it('metrics yüzeyi verilmezse başarılı davranışı tam kabul saymaz', async () => {
  server = await startServer();
  const report = JsonlReport.toMemory();
  const { verdict } = await runScenario({
    scenario: 'idle',
    endpoint: server.endpoint,
    clients: 1,
    durationMs: 1000,
    report,
  });
  expect(verdict).toMatchObject({ pass: true, complete: false });
  expect(verdict.bots[0]).toMatchObject({ transportMeasured: false, serverReported: false });
}, 6000);
