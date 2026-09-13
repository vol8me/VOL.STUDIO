import { describe, expect, it } from 'vitest';
import { morphologySearchConfig } from '@/config/morphology';

describe('morfoloji arama yapılandırması', () => {
  it('sürüm, parçacık sayısı ve deterministik tohum korpusu taşır', () => {
    expect(morphologySearchConfig.version).toBe(2);
    expect(morphologySearchConfig.particleCount).toBeGreaterThan(0);
    expect(morphologySearchConfig.seedCorpus.length).toBeGreaterThan(0);
  });

  it('analiz ayarları ve çok bileşenli eşikler geçerli aralıktadır', () => {
    const { analysis, thresholds, broad, finalist } = morphologySearchConfig;
    expect(analysis.clusterRadiusUnits).toBeGreaterThan(0);
    expect(analysis.minimumClusterSize).toBeGreaterThan(1);
    expect(analysis.movingSpeedUnitsPerReferenceTick).toBeGreaterThan(0);
    expect(analysis.roleByType).toHaveLength(6);
    expect(analysis.wallSupportShare).toBeGreaterThan(0);

    expect(thresholds.structurePresence).toBeGreaterThan(0);
    expect(thresholds.meanLayering).toBeGreaterThan(0);
    expect(thresholds.recovery).toBeGreaterThan(0);
    expect(thresholds.meanCompactness).toBeGreaterThan(0);
    expect(thresholds.recoveryMembership).toBeGreaterThan(0);

    expect(broad.ticks).toBeGreaterThan(broad.warmupTicks);
    expect(finalist.ticks).toBeGreaterThan(finalist.perturbAtTick);
    expect(finalist.recoveryStartTick).toBeGreaterThan(finalist.perturbAtTick);
  });
});
