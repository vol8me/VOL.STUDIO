import { resolve } from 'node:path';
import type { InputHandle } from '@volstudio/network/client';
import {
  JsonlReport,
  judgeFleet,
  MetricsPoller,
  runFleet,
  type BotHandle,
  type FleetBudget,
} from '@volstudio/network/drive';
import { loadQualityConfig } from '../../../scripts/quality/config.mjs';
import { NETWORK } from '../src/config/network';
import { ROOM } from '../src/network/rooms';
import { WORLD_SCHEMA, type TankInputData, type WorldSnapshot } from '../src/network/schema';
import { GAME } from '../src/config/game';
import { VEHICLE_IDS } from '../src/config/vehicles';
import { runScenario } from './driveScenarios';
import type { DriveOptions } from './driveOptions';

/** CLI'nin kaynak ömrü: metrik istekleri sonlanmadan dosya kapanmaz. */
export async function runDrive(options: DriveOptions, signal?: AbortSignal): Promise<boolean> {
  let budget: FleetBudget | undefined;
  if (options.profile !== undefined) {
    const config = loadQualityConfig(resolve(import.meta.dirname, '../../../quality.json')) as {
      fleetBudget?: Record<string, Record<string, FleetBudget>>;
    };
    budget = config.fleetBudget?.['games/vol-test']?.[options.profile];
    if (!budget)
      throw new RangeError(`--profile ${options.profile}: quality.json fleetBudget'ta yok`);
  }
  if (signal?.aborted) return false;
  const report = JsonlReport.toFile(options.out);
  let passed = true;
  try {
    if (options.scenarios.length > 0) {
      for (const scenario of options.scenarios) {
        if (signal?.aborted) break;
        const result = await runScenario({ ...options, scenario, report, budget, signal });
        console.log(JSON.stringify({ scenario, verdict: result.verdict }, null, 2));
        passed &&= result.verdict.pass && result.verdict.complete;
      }
    } else {
      const inputs = new WeakMap<object, InputHandle<TankInputData>>();
      const clock = new Map<number, number>();
      const drive = ({ index, room }: BotHandle<WorldSnapshot>): void => {
        let handle = inputs.get(room);
        if (!handle) {
          handle = room.input<TankInputData>();
          inputs.set(room, handle);
        }
        const step = (clock.get(index) ?? 0) + 1;
        clock.set(index, step);
        const seconds = (step * GAME.simulationStepMs) / 1000;
        Object.assign(handle.data, {
          moveY: 1,
          moveX: Math.sin(seconds * 0.5 + index) * 0.8,
          aimX: Math.cos(seconds * 0.7 + index),
          aimY: Math.sin(seconds * 0.7 + index),
          fire: step % 90 < 20,
          boost: false,
          brake: false,
        });
        handle.send();
      };
      const poller = new MetricsPoller({
        url: options.metricsUrl,
        onSample: (metrics) => report.write('server', { metrics }),
        onError: () => report.write('serverError'),
      });
      try {
        const summary = await runFleet<WorldSnapshot>({
          endpoint: options.endpoint,
          roomName: ROOM.world,
          clients: options.clients,
          durationMs: options.durationMs,
          rampMs: options.rampMs,
          actMs: 17,
          schema: WORLD_SCHEMA,
          reconnect: options.reconnect,
          signal,
          joinOptions: (index) => ({
            name: `${NETWORK.fallbackName}-bot${index}`,
            model: index % VEHICLE_IDS.length,
          }),
          act: drive,
          report,
        });
        await poller.stop();
        const verdict = budget ? judgeFleet(summary, budget, poller.observation) : null;
        if (verdict) report.write('verdict', { profile: options.profile, ...verdict });
        console.log(JSON.stringify({ out: options.out, summary, verdict }, null, 2));
        passed =
          summary.joined === options.clients &&
          summary.dropped === 0 &&
          summary.errors === 0 &&
          summary.actErrors === 0 &&
          Object.values(summary.joinFailures).every((count) => count === 0) &&
          (verdict === null || (verdict.pass && verdict.complete));
      } finally {
        await poller.stop();
      }
    }
  } finally {
    if (signal?.aborted) report.write('aborted');
    await report.close();
  }
  return passed && !signal?.aborted && report.failed === 0;
}
