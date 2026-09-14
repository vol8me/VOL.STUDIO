import { describe, expect, it } from 'vitest';
import {
  PhaseClassifier,
  defaultPhaseConfig,
  isStructured,
} from '@/../scripts/morphology/phaseClassifier';
import type { MorphologySample } from '@/../scripts/morphology/metrics';

function makeSample(partial: Partial<MorphologySample>): MorphologySample {
  return {
    tick: 0,
    activeCount: 512,
    voidLossCount: 0,
    meanSpeed: 0.5,
    stalledFraction: 0.1,
    meanNeighborCount: 5,
    meanLocalDensity: 0.001,
    clusterCompactness: 0.5,
    clusterAnisotropy: 0.3,
    typeComposition: [0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
    radialStructure: 2,
    trajectoryAutocorrelation: 0.3,
    voidDwellFraction: 0,
    fringeFraction: 0.05,
    ...partial,
  };
}

describe('PhaseClassifier', () => {
  it('az aktif parçacık dead sınıflar', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const series = [makeSample({ activeCount: 5, tick: 100 })];
    const result = classifier.classify(series, 512);
    expect(result.phase).toBe('dead');
  });

  it('çok düşük hız stasis sınıflar', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const series: MorphologySample[] = [];
    for (let i = 0; i < 70; i++) {
      series.push(makeSample({ tick: i, meanSpeed: 0.005 }));
    }
    const result = classifier.classify(series, 512);
    expect(result.phase).toBe('stasis');
  });

  it('yüksek kompaktlık ve düşük hız crystal sınıflar', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const series = [makeSample({ clusterCompactness: 0.9, meanSpeed: 0.005 })];
    const result = classifier.classify(series, 512);
    expect(result.phase).toBe('crystal');
  });

  it('çok yüksek kompaktlık ve yüksek aktif oran blob sınıflar', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const series = [makeSample({ clusterCompactness: 0.95, activeCount: 400 })];
    const result = classifier.classify(series, 512);
    expect(result.phase).toBe('single-blob');
  });

  it('dinamik-yapılı adayı tanır', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const series = [makeSample({ clusterCompactness: 0.5, meanSpeed: 0.5 })];
    const result = classifier.classify(series, 512);
    expect(result.phase).toBe('dynamic-structured');
  });

  it('isStructured sadece dynamic-structured için true döner', () => {
    expect(isStructured('dynamic-structured')).toBe(true);
    expect(isStructured('dead')).toBe(false);
    expect(isStructured('gas')).toBe(false);
    expect(isStructured('crystal')).toBe(false);
  });

  it('boş seri dead döner', () => {
    const classifier = new PhaseClassifier(defaultPhaseConfig);
    const result = classifier.classify([], 512);
    expect(result.phase).toBe('dead');
  });
});
