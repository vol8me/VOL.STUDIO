import { describe, expect, it } from 'vitest';
import { substrateConfig } from '@/config/substrate';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';
import {
  MorphologyMetrics,
  defaultMetricsConfig,
  type MorphologySample,
} from '@/../scripts/morphology/metrics';
import {
  buildCollapseReport,
  defaultCollapseConfig,
  detectSeedCollapse,
} from '@/../scripts/morphology/collapseDetector';

/*
 * F8: geç çöküş FINAL SNAPSHOT'TA görünmez. 12. dakikada ölen dünya ile 28.
 * dakikada ölen dünya aynı son kareyi verebilir; ayrımı zaman serisi yapar.
 *
 * Kural §8.4'ten birebir: 10-20 dk medyanından > %50 düşüş, ≥ 3 dk sürerse
 * çöküş; 25. dakikadan sonra başlayan çöküş seed'lerin ≥ %10'unda ise canary.
 */
const HZ = 60;
const SAMPLE_TICKS = defaultCollapseConfig.sampleIntervalTicks;

function baseSample(): MorphologySample {
  return new MorphologyMetrics(defaultMetricsConfig).sample(
    new ParticleStore(4),
    createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7),
    0,
    0,
  );
}

/** Dakika → kümeli madde payı eğrisinden seri kurar. */
function seriesFrom(curve: (minutes: number) => number, minutes = 30): MorphologySample[] {
  const base = baseSample();
  const samples: MorphologySample[] = [];
  for (let tick = 0; tick <= minutes * 60 * HZ; tick += SAMPLE_TICKS) {
    const minute = tick / (60 * HZ);
    samples.push({ ...base, tick, activeCount: 512, clusteredFraction: curve(minute) });
  }
  return samples;
}

describe('F8 — geç çöküş dedektörü', () => {
  it('kararlı seride çöküş bulmaz', () => {
    const result = detectSeedCollapse(
      1,
      seriesFrom(() => 0.8),
    );

    expect(result.collapsed).toBe(false);
    expect(result.collapseStartMinutes).toBeNull();
    expect(result.referenceMedian).toBeCloseTo(0.8, 6);
  });

  it('referans medyanının yarısının altına SÜRDÜREREK inen seri çöküştür', () => {
    const result = detectSeedCollapse(
      1,
      seriesFrom((minute) => (minute < 22 ? 0.8 : 0.2)),
    );

    expect(result.collapsed).toBe(true);
    expect(result.collapseStartMinutes).toBeCloseTo(22, 0);
  });

  /* Anlık çukur çöküş DEĞİLDİR: kural ≥ 3 dakika süre ister. */
  it('kısa süreli düşüş çöküş sayılmaz', () => {
    const result = detectSeedCollapse(
      1,
      seriesFrom((minute) => (minute >= 22 && minute < 23.5 ? 0.2 : 0.8)),
    );

    expect(result.collapsed).toBe(false);
  });

  it('referans penceresi boşsa sessizce geçmez', () => {
    expect(() =>
      detectSeedCollapse(
        1,
        seriesFrom(() => 0.8, 5),
      ),
    ).toThrow(RangeError);
  });

  it('düşen kuyruk eğimi negatif ölçülür', () => {
    const result = detectSeedCollapse(
      1,
      seriesFrom((minute) => Math.max(0.1, 0.8 - Math.max(0, minute - 25) * 0.1)),
    );

    expect(result.tailSlopePerMinute).toBeLessThan(0);
  });
});

describe('F8 — canary kuralı', () => {
  it('geç çöküş seed’lerin onda birini aşarsa canary ister', () => {
    const seeds = Array.from({ length: 10 }, (_, index) =>
      detectSeedCollapse(
        index,
        seriesFrom((minute) => (index < 2 && minute >= 26 ? 0.2 : 0.8)),
      ),
    );

    const report = buildCollapseReport(seeds);

    expect(report.lateCollapseSeedFraction).toBeCloseTo(0.2, 6);
    expect(report.canaryRequired).toBe(true);
    expect(report.canaryReasons.join(' ')).toContain('geç çöküş');
  });

  /*
   * Çöküş REFERANS PENCERESİNDEN SONRA aranır: 12. dakikada başlayan bir düşüş
   * 10-20 dk medyanının kendisini aşağı çeker ve kural tanım gereği onu
   * göremez (ölçüldü: medyan 0,2'ye iniyor, eşik 0,1'e düşüyor). Bu yüzden
   * "erken" örnek 21. dakikada başlar: çöküş sayılır ama geç değildir.
   */
  it('25. dakikadan önce başlayan çöküş tek başına canary tetiklemez', () => {
    const seeds = Array.from({ length: 10 }, (_, index) =>
      detectSeedCollapse(
        index,
        seriesFrom((minute) => (index < 3 && minute >= 21 ? 0.2 : 0.8)),
      ),
    );

    const report = buildCollapseReport(seeds);

    expect(report.collapsedSeedFraction).toBeCloseTo(0.3, 6);
    expect(report.lateCollapseSeedFraction).toBe(0);
    expect(report.canaryRequired).toBe(false);
  });

  it('son pencerede anlamlı düşüş canary tetikler', () => {
    const seeds = [
      detectSeedCollapse(
        1,
        seriesFrom((minute) => Math.max(0.05, 0.8 - Math.max(0, minute - 25) * 0.15)),
      ),
    ];

    const report = buildCollapseReport(seeds);

    expect(report.canaryRequired).toBe(true);
    expect(report.canaryReasons.join(' ')).toContain('eğim');
  });

  it('seedsiz rapor reddedilir', () => {
    expect(() => buildCollapseReport([])).toThrow(RangeError);
  });
});
