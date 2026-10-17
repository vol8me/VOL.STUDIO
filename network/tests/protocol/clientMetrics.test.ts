import { expect, it } from 'vitest';
import { isReconciliationSample } from '../../src/protocol/clientMetrics';

const sample = {
  sequence: 1,
  liveSteps: 2,
  replaySteps: 3,
  reconciliations: 2,
  corrections: 1,
  snaps: 0,
  correctionLast: 0,
  correctionMax: 4,
};

it('tel sınırında bozuk, taşan ve kendiyle çelişen sayaçları reddeder', () => {
  expect(isReconciliationSample(sample)).toBe(true);
  for (const patch of [
    { sequence: 0 },
    { liveSteps: -1 },
    { replaySteps: 1.5 },
    { reconciliations: Infinity },
    { sequence: Number.MAX_SAFE_INTEGER + 1 },
    { snaps: 2 },
    { corrections: 3 },
    { correctionLast: 5 },
    { correctionMax: NaN },
    { correctionMax: 0 },
    { correctionLast: null, correctionMax: null },
    { correctionLast: '0' },
  ])
    expect(isReconciliationSample({ ...sample, ...patch })).toBe(false);
  for (const invalid of [null, [], 'bad', {}]) expect(isReconciliationSample(invalid)).toBe(false);
});
