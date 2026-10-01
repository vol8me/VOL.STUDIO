export const SCENARIOS = {
  empty: { count: 0 },
  slalom: { count: 8 },
  targets: { count: 5 },
  sandbox: { count: 12 },
  multitank: { count: 6 },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

export const SCENARIO = {
  defaultSeed: 731,
  maxSeed: 0xffffffff,
  slalom: { start: 180, step: 95, width: 125, jitter: 12 },
  targets: { distance: 390, spacing: 120 },
  dynamic: { radius: 310, jitter: 110, turnRate: 0.45, fireCycleMs: 1950, fireWindowMs: 30 },
  neighborCell: 300,
  aimRadius: 620,
} as const;

export function isScenario(value: unknown): value is ScenarioId {
  return typeof value === 'string' && Object.hasOwn(SCENARIOS, value);
}

export function validSeed(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= SCENARIO.maxSeed
  );
}
