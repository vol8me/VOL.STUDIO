import { describe, expect, it } from 'vitest';
import { defaultSubstrateCandidate, type VoidProfile } from '@/config/candidate';
import { substrateConfig } from '@/config/substrate';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createHabitatDomain, type HabitatSDF } from '@/runtime/sim/WorldDomain';
import { ClusterTracker, defaultClusterConfig } from '@/../scripts/morphology/clusterTracker';
import {
  MorphologyMetrics,
  defaultMetricsConfig,
  type MorphologySample,
} from '@/../scripts/morphology/metrics';
import {
  defaultVoidStressConfig,
  measureVoidStress,
  resolveMorphologyScope,
  translateTowardShore,
} from '@/../scripts/morphology/scenario';

/*
 * E10: iki senaryo AYRIDIR. Intrinsic yalnız güvenli alandaki maddeyi ölçer,
 * void-stress kıyı etkileşimini ölçer. Bu testlerin sorusu tek: ikisi
 * birbirine karışıyor mu?
 *
 * Fixture konumları VARSAYILMAZ: habitat gürültülü bir şekil olduğu için
 * parçacık yerleştirildikten sonra gerçek kıyı mesafesi ÖLÇÜLÜR ve iddia ona
 * dayanır.
 */
const VOID: VoidProfile = defaultSubstrateCandidate.void;
const BOUNDS = substrateConfig.world.boundsUnits;
const CENTER = { x: BOUNDS.x + BOUNDS.width / 2, y: BOUNDS.y + BOUNDS.height / 2 };

function createDomain(): HabitatSDF {
  return createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7);
}

function edgeDistance(domain: HabitatSDF, x: number, y: number): number {
  return domain.sampleDistanceAndNormal(x, y).distance;
}

/** Merkezden dışa yürüyerek ölçülen mesafesi verilen banda düşen ilk noktayı bulur. */
function pointAtDistance(domain: HabitatSDF, min: number, max: number): { x: number; y: number } {
  for (let radius = 0; radius < BOUNDS.width / 2; radius += 0.5) {
    const point = { x: CENTER.x + radius, y: CENTER.y };
    const distance = edgeDistance(domain, point.x, point.y);
    if (distance >= min && distance < max) return point;
  }
  throw new Error(`${min}-${max} bandında nokta bulunamadı`);
}

function scopedMetrics(minEdgeDistanceUnits: number): MorphologyMetrics {
  return new MorphologyMetrics({
    ...defaultMetricsConfig,
    minEdgeDistanceUnits,
    fringeWidthUnits: VOID.widthUnits,
  });
}

/** Merkez çevresinde sıkı blob; tracker'ın yoğunluk şartını geçer. */
function blob(particles: ParticleStore, centerX: number, centerY: number, count: number): void {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    const radius = 6 + (index % 3) * 2;
    particles.activateSlot(
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
      0,
      0,
      0,
    );
  }
}

describe('Senaryo kapsamı (E10)', () => {
  it('intrinsic kapsamı güvenli alanın sınırıdır, void-stress daraltmaz', () => {
    expect(resolveMorphologyScope({ kind: 'intrinsic' }, VOID).minEdgeDistanceUnits).toBe(
      VOID.widthUnits,
    );
    expect(
      resolveMorphologyScope({ kind: 'void-stress', tidalControl: false }, VOID)
        .minEdgeDistanceUnits,
    ).toBe(Number.NEGATIVE_INFINITY);
    expect(
      resolveMorphologyScope({ kind: 'void-stress', tidalControl: true }, VOID)
        .minEdgeDistanceUnits,
    ).toBe(Number.NEGATIVE_INFINITY);
  });

  it('intrinsic fringe maddesini dışlar ve ayrı sayar; void-stress saymaya devam eder', () => {
    const domain = createDomain();
    const fringePoint = pointAtDistance(domain, 1, VOID.widthUnits);
    // Fixture kendini doğrular: nokta gerçekten fringe bandında mı?
    expect(edgeDistance(domain, fringePoint.x, fringePoint.y)).toBeLessThan(VOID.widthUnits);

    const particles = new ParticleStore(32);
    blob(particles, CENTER.x, CENTER.y, 8);
    particles.activateSlot(fringePoint.x, fringePoint.y, 0, 0, 0);

    const intrinsic = scopedMetrics(VOID.widthUnits).sample(particles, domain, 0, 0);
    const voidStress = scopedMetrics(Number.NEGATIVE_INFINITY).sample(particles, domain, 0, 0);

    expect(intrinsic.activeCount).toBe(8);
    expect(intrinsic.scopedOutCount).toBe(1);
    expect(voidStress.activeCount).toBe(9);
    expect(voidStress.scopedOutCount).toBe(0);
  });

  /*
   * KARIŞMAMA KANITI: intrinsic ölçüm, fringe maddesi HİÇ YOKMUŞ gibi olmalı.
   * Sayıların "yakın" olması yetmez; birebir aynı olmalı.
   */
  it('intrinsic ölçüm, fringe maddesi hiç yokmuş gibi sonuç verir', () => {
    const domain = createDomain();
    const fringePoint = pointAtDistance(domain, 1, VOID.widthUnits);

    const withFringe = new ParticleStore(32);
    blob(withFringe, CENTER.x, CENTER.y, 8);
    withFringe.activateSlot(fringePoint.x, fringePoint.y, 3, 4, 0);

    const interiorOnly = new ParticleStore(32);
    blob(interiorOnly, CENTER.x, CENTER.y, 8);

    const a = scopedMetrics(VOID.widthUnits).sample(withFringe, domain, 0, 0);
    const b = scopedMetrics(VOID.widthUnits).sample(interiorOnly, domain, 0, 0);

    expect(a.activeCount).toBe(b.activeCount);
    expect(a.meanSpeed).toBeCloseTo(b.meanSpeed, 12);
    expect(a.clusterCompactness).toBeCloseTo(b.clusterCompactness, 12);
    expect(a.meanNeighborCount).toBeCloseTo(b.meanNeighborCount, 12);
    expect(a.radialStructure).toBeCloseTo(b.radialStructure, 12);
    // Dışlanan madde görünmez olmaz: ayrı sayılır.
    expect(a.scopedOutCount).toBe(1);
    expect(b.scopedOutCount).toBe(0);
  });

  /*
   * Fark ancak kapsamda KÜMELENMEMİŞ madde varken görünür: `clusteredFraction`
   * hem payı hem paydası kapsamlı olduğu için, kapsamdaki herkes küme üyesiyse
   * oran iki senaryoda da 1 çıkar. Bu yüzden küme fringe'e, dağınık madde iç
   * bölgeye konur.
   */
  it('fringe’deki küme intrinsic’te yapı sayılmaz, void-stress’te sayılır', () => {
    const domain = createDomain();
    const fringeCenter = pointAtDistance(domain, 8, 12);
    const particles = new ParticleStore(64);
    blob(particles, fringeCenter.x, fringeCenter.y, 8);
    for (const offset of [0, 150, -150, 300])
      particles.activateSlot(CENTER.x + offset, CENTER.y, 0, 0, 0);

    // Fixture kendini doğrular: küme üyelerinin hepsi gerçekten fringe bandında mı?
    let blobInFringe = 0;
    for (let slot = 0; slot < 8; slot++) {
      if (edgeDistance(domain, particles.x[slot], particles.y[slot]) < VOID.widthUnits) {
        blobInFringe++;
      }
    }
    expect(blobInFringe).toBe(8);

    const tracker = new ClusterTracker({
      ...defaultClusterConfig,
      epsUnits: 24,
      minPts: 3,
      minClusterSize: 4,
      minContinuityTicks: 0,
      sampleIntervalTicks: 1,
    });
    tracker.update(particles, 0);

    const voidStress = scopedMetrics(Number.NEGATIVE_INFINITY).sample(
      particles,
      domain,
      0,
      0,
      tracker.activeClusters,
    );
    const intrinsic = scopedMetrics(VOID.widthUnits).sample(
      particles,
      domain,
      0,
      0,
      tracker.activeClusters,
    );

    expect(voidStress.clusteredFraction).toBeCloseTo(8 / 12, 6);
    expect(intrinsic.clusteredFraction).toBe(0);
    expect(intrinsic.activeCount).toBe(4);
    expect(intrinsic.scopedOutCount).toBe(8);
    // Yapılı maddenin tamamı fringe'de; void-stress ölçümü bunu GÖRÜR.
    expect(voidStress.fringeStructuredFraction).toBe(1);
  });
});

describe('Yapıyı kıyıya taşıma (E10)', () => {
  it('taşıma KATIDIR: kıyı mesafesi azalır, yapı deforme olmaz', () => {
    const domain = createDomain();
    const particles = new ParticleStore(32);
    blob(particles, CENTER.x, CENTER.y, 8);
    const slots = [0, 1, 2, 3, 4, 5, 6, 7];
    const before = slots.map((slot) => edgeDistance(domain, particles.x[slot], particles.y[slot]));
    const spanBefore = Math.hypot(particles.x[0] - particles.x[4], particles.y[0] - particles.y[4]);

    translateTowardShore(particles, slots, domain, 120);

    const after = slots.map((slot) => edgeDistance(domain, particles.x[slot], particles.y[slot]));
    const spanAfter = Math.hypot(particles.x[0] - particles.x[4], particles.y[0] - particles.y[4]);

    for (let index = 0; index < slots.length; index++) {
      expect(after[index]).toBeLessThan(before[index]);
    }
    // Üyeler arası mesafe DEĞİŞMEZ; deformasyonu biz üretmiyoruz.
    expect(spanAfter).toBeCloseTo(spanBefore, 9);
  });

  it('boş üye listesi hiçbir şeyi bozmaz', () => {
    const particles = new ParticleStore(4);
    particles.activateSlot(CENTER.x, CENTER.y, 0, 0, 0);

    translateTowardShore(particles, [], createDomain(), 50);

    expect(particles.x[0]).toBe(CENTER.x);
  });
});

describe('FRINGE_DEPENDENT (E10)', () => {
  /** Kayıt alanlarının tamamı gerekmez; ölçülen tek alan solidity'dir. */
  const FAKE_CLUSTER = {
    id: 1,
    size: 8,
    centroidX: 0,
    centroidY: 0,
    normalizedGyration: 1,
    holeRatio: 0,
    anisotropy: 1,
    radialProfile: 0,
    typeComposition: [1],
    churn: 0,
    ageTicks: 10,
  };

  function baseSample(): MorphologySample {
    return new MorphologyMetrics(defaultMetricsConfig).sample(
      new ParticleStore(4),
      createDomain(),
      0,
      0,
    );
  }

  function series(count: number, overrides: Partial<MorphologySample>): MorphologySample[] {
    const base = baseSample();
    return Array.from({ length: count }, (_, index) => ({ ...base, tick: index, ...overrides }));
  }

  it('yapılı maddenin çoğu zamanın çoğunda fringe’deyse bağımlı sayılır', () => {
    const report = measureVoidStress(
      series(10, { fringeStructuredFraction: 0.8, clusteredFraction: 0.6 }),
      series(10, { clusteredFraction: 0.6 }),
    );

    expect(report.fringeResidencyFraction).toBe(1);
    expect(report.fringeDependent).toBe(true);
    expect(report.reasons).toHaveLength(1);
  });

  it('tidal kontrolünde yapı kaybolursa bağımlı sayılır', () => {
    const report = measureVoidStress(
      series(10, { fringeStructuredFraction: 0.1, clusteredFraction: 0.7 }),
      series(10, { fringeStructuredFraction: 0.1, clusteredFraction: 0.05 }),
    );

    expect(report.structureLostInControl).toBe(true);
    expect(report.fringeDependent).toBe(true);
    expect(report.controlClusteredFraction).toBeLessThan(
      defaultVoidStressConfig.structurelessClusteredFraction,
    );
  });

  it('iç bölgede duran ve kontrolde de yaşayan yapı bağımlı sayılmaz', () => {
    const report = measureVoidStress(
      series(10, { fringeStructuredFraction: 0.1, clusteredFraction: 0.7 }),
      series(10, { fringeStructuredFraction: 0.1, clusteredFraction: 0.65 }),
    );

    expect(report.fringeDependent).toBe(false);
    expect(report.reasons).toEqual([]);
  });

  /* Maddenin istediği üç fark: deformasyon, crossing, süreklilik. */
  it('tidal ve kontrol koşusunun üç farkını ölçer', () => {
    const base = baseSample();
    const withSolidity = (solidity: number, clustered: number, loss: number): MorphologySample => ({
      ...base,
      clusteredFraction: clustered,
      voidLossCount: loss,
      clusters: [{ ...FAKE_CLUSTER, solidity }],
    });

    const report = measureVoidStress(
      [withSolidity(0.4, 0.5, 30), withSolidity(0.4, 0.5, 40)],
      [withSolidity(0.9, 0.8, 5), withSolidity(0.9, 0.8, 6)],
    );

    // Kontrol daha derli toplu: tidal deforme etmiş.
    expect(report.deformationDelta).toBeCloseTo(0.5, 6);
    // Tidal koşuda daha fazla madde kıyıyı geçmiş.
    expect(report.crossingDelta).toBe(34);
    // Yapı sürekliliği tidal koşuda daha düşük.
    expect(report.continuityDelta).toBeCloseTo(-0.3, 6);
  });

  it('fringe’de kalma azınlıkta kalırsa bağımlı sayılmaz', () => {
    const tidal = [
      ...series(4, { fringeStructuredFraction: 0.9, clusteredFraction: 0.6 }),
      ...series(6, { fringeStructuredFraction: 0.1, clusteredFraction: 0.6 }),
    ];

    const report = measureVoidStress(tidal, series(10, { clusteredFraction: 0.6 }));

    expect(report.fringeResidencyFraction).toBeCloseTo(0.4, 6);
    expect(report.fringeDependent).toBe(false);
  });

  it('eksik seri sessizce geçmez', () => {
    expect(() => measureVoidStress([], series(2, {}))).toThrow(RangeError);
    expect(() => measureVoidStress(series(2, {}), [])).toThrow(RangeError);
  });
});
