import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DRIVE_SCENARIOS, type DriveScenario } from './driveScenarios';
import { NETWORK } from '../src/config/network';

export interface DriveOptions {
  readonly endpoint: string;
  readonly metricsUrl?: string;
  readonly clients: number;
  readonly durationMs: number;
  readonly rampMs?: number;
  readonly out: string;
  readonly reconnect: boolean;
  readonly profile?: string;
  readonly scenarios: readonly DriveScenario[];
}

/** Bütün süreler dosya, timer veya ağ açılmadan doğrulanır; Node taşan timer'ı 1 ms yapar. */
export function parseDriveOptions(args: string[]): DriveOptions {
  const { values } = parseArgs({
    args,
    options: {
      server: { type: 'string', default: 'http://127.0.0.1:2567' },
      ops: { type: 'string' },
      clients: { type: 'string', default: '8' },
      seconds: { type: 'string', default: '30' },
      ramp: { type: 'string' },
      out: { type: 'string', default: 'records/drive/last.jsonl' },
      reconnect: { type: 'boolean', default: false },
      profile: { type: 'string' },
      scenario: { type: 'string' },
    },
  });
  const clients = Number(values.clients);
  const durationMs = Number(values.seconds) * 1000;
  const rampMs = values.ramp === undefined ? undefined : Number(values.ramp);
  if (!Number.isSafeInteger(clients) || clients < 1)
    throw new RangeError('--clients pozitif tam sayı');
  const scenarios =
    values.scenario === 'all' ? DRIVE_SCENARIOS : values.scenario ? [values.scenario] : [];
  if (scenarios.some((id) => !DRIVE_SCENARIOS.includes(id as DriveScenario)))
    throw new RangeError(`--scenario: all, ${DRIVE_SCENARIOS.join(', ')}`);
  if (!Number.isFinite(durationMs) || durationMs < (scenarios.length ? 1000 : 1))
    throw new RangeError('--seconds geçerli pozitif ölçüm süresi olmalı');
  const ramp = rampMs ?? clients * 50;
  if (!Number.isFinite(ramp) || ramp < 0)
    throw new RangeError('--ramp sonlu ve negatif olmayan sayı');
  if (durationMs + ramp + NETWORK.metricsReportMs * 2 > 2_147_483_647)
    throw new RangeError('Koşu süresi timer sınırını aşıyor.');
  return {
    endpoint: values.server,
    metricsUrl: values.ops ? `${values.ops.replace(/\/$/, '')}/metrics` : undefined,
    clients,
    durationMs,
    rampMs,
    out: resolve(values.out),
    reconnect: values.reconnect,
    profile: values.profile,
    scenarios: scenarios as DriveScenario[],
  };
}
