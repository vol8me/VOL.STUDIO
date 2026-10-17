import { expect, it } from 'vitest';
import { ClientMetricsRegistry } from '../../src/server/clientMetrics';

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

it('yalnız açılmış istemciyi tutar; hız, tekrar, gerileme ve bellek sahipliğini korur', () => {
  const registry = new ClientMetricsRegistry();
  expect(registry.accept('missing', sample, 0)).toBe(false);
  registry.open('a');
  expect(registry.read('a', 0)).toBeNull();
  const incoming = { ...sample, privateData: 'must-not-survive' };
  expect(registry.accept('a', incoming, 0)).toBe(true);
  incoming.liveSteps = 999;
  registry.open('a');
  expect(registry.accept('a', { ...sample, sequence: 2 }, 249)).toBe(false);
  expect(registry.accept('a', sample, 250)).toBe(false);
  expect(registry.accept('a', { ...sample, sequence: 2, replaySteps: 0 }, 250)).toBe(false);
  expect(registry.accept('a', { ...sample, sequence: 2, correctionMax: 2 }, 250)).toBe(false);
  expect(registry.accept('a', { ...sample, sequence: 2 }, NaN)).toBe(false);
  expect(registry.accept('a', { ...sample, sequence: 2 }, 250)).toBe(true);
  expect(registry.read('a', 300)).toEqual({
    ...sample,
    sequence: 2,
    source: 'client-reported',
    ageMs: 50,
  });
  registry.forget('a');
  expect(registry.read('a', 301)).toBeNull();
  registry.open('a');
  expect(registry.accept('a', sample, 400)).toBe(true);
  registry.clear();
  expect(registry.read('a', 401)).toBeNull();
  expect(() => new ClientMetricsRegistry(-1)).toThrow(RangeError);
});
