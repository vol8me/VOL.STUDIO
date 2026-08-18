import { describe, it, expect, vi } from 'vitest';
import type { Diagnostics } from '@volstudio/core';
import {
  reportSceneTelemetry,
  TELEMETRY_KEYS,
  type TelemetrySources,
} from '@/runtime/scene/sceneTelemetry';

const SOURCES: TelemetrySources = {
  score: 1200,
  kills: 42,
  elapsedMs: 95_400,
  bullets: 18,
  enemies: 7,
  particles: 250,
  gridCells: 33,
  wave: 12,
  waveRemainingMs: 4200,
  flux: 88,
  fluxPickups: 5,
  spark: 310,
  sparkLevel: 6,
  cards: 9,
  fireZones: 2,
};

function fakeDiagnostics(): { diagnostics: Diagnostics; counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const setCount = vi.fn((key: string, value: number) => {
    counts.set(key, value);
  });
  return { diagnostics: { setCount } as unknown as Diagnostics, counts };
}

describe('reportSceneTelemetry', () => {
  it("beklenen tüm sayaçları bildirir — eksik sayaç overlay'de boş görünür", () => {
    const { diagnostics, counts } = fakeDiagnostics();
    reportSceneTelemetry(diagnostics, SOURCES);
    expect([...counts.keys()].sort()).toEqual([...TELEMETRY_KEYS].sort());
  });

  it('ham değerleri olduğu gibi geçirir', () => {
    const { diagnostics, counts } = fakeDiagnostics();
    reportSceneTelemetry(diagnostics, SOURCES);
    expect(counts.get('score')).toBe(1200);
    expect(counts.get('enemies')).toBe(7);
    expect(counts.get('sparkLevel')).toBe(6);
  });

  it('süreleri saniyeye çevirir: geçen süre aşağı, kalan süre yukarı yuvarlanır', () => {
    // Kalan süre yukarı yuvarlanır ki sayaç 0'a düşmeden dalga bitmesin.
    const { diagnostics, counts } = fakeDiagnostics();
    reportSceneTelemetry(diagnostics, SOURCES);
    expect(counts.get('elapsedSeconds')).toBe(95);
    expect(counts.get('waveRemainingSeconds')).toBe(5);
  });

  it('sıfır değerler de bildirilir', () => {
    const { diagnostics, counts } = fakeDiagnostics();
    const zeroed = Object.fromEntries(
      Object.keys(SOURCES).map((k) => [k, 0]),
    ) as unknown as TelemetrySources;
    reportSceneTelemetry(diagnostics, zeroed);
    expect(counts.size).toBe(TELEMETRY_KEYS.length);
    expect(counts.get('score')).toBe(0);
  });
});
