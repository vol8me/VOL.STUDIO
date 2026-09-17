import { describe, expect, it } from 'vitest';
import { cameraScales, entryCameraScale, zoomForScale } from '@/config/cameraScales';
import { substrateConfig } from '@/config/substrate';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createHabitatDomain, type HabitatSDF } from '@/runtime/sim/WorldDomain';
import { resolveEntryCamera } from '@/runtime/render/EntryCameraResolver';

/*
 * D2: açılış ölçeği ve odağı. Ölçekler kernel menzili cinsinden tanımlıdır;
 * odak SAF ve DETERMİNİSTİK bir fonksiyondan çıkar.
 */
const CUTOFF = substrateConfig.candidate.physics.cutoffUnits;
const OPTIONS = { cellUnits: CUTOFF, safeMarginUnits: substrateConfig.candidate.void.widthUnits };

function domain(): HabitatSDF {
  return createHabitatDomain(substrateConfig.world.boundsUnits, substrateConfig.habitat, 7);
}

function blob(particles: ParticleStore, x: number, y: number, count: number): void {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2;
    particles.activateSlot(x + Math.cos(angle) * 8, y + Math.sin(angle) * 8, 0, 0, 0);
  }
}

describe('D2 — kamera ölçekleri', () => {
  it('ölçekler kernel menzili cinsinden tanımlı ve sıralı', () => {
    expect(cameraScales.world.visibleWidthInCutoffs).toBeGreaterThan(
      cameraScales.ecosystem.visibleWidthInCutoffs,
    );
    expect(cameraScales.ecosystem.visibleWidthInCutoffs).toBeGreaterThan(
      cameraScales.organism.visibleWidthInCutoffs,
    );
    expect(cameraScales.organism.visibleWidthInCutoffs).toBeGreaterThan(
      cameraScales.micro.visibleWidthInCutoffs,
    );
  });

  it('açılış ölçeği ECOSYSTEM’dir', () => {
    expect(entryCameraScale).toBe('ecosystem');
  });

  it('zoom, görünür genişliğin menzil karşılığından çıkar', () => {
    const zoom = zoomForScale(cameraScales.ecosystem, 1200, CUTOFF);

    // Görünür dünya genişliği = 6 menzil; zoom = görüntü alanı / o genişlik.
    expect(zoom).toBeCloseTo(1200 / (6 * CUTOFF), 9);
    // Daha dar ölçek daha yüksek zoom verir.
    expect(zoomForScale(cameraScales.micro, 1200, CUTOFF)).toBeGreaterThan(zoom);
  });

  it('geçersiz görüntü alanı sessizce geçmez', () => {
    expect(() => zoomForScale(cameraScales.ecosystem, 0, CUTOFF)).toThrow(RangeError);
  });
});

describe('D2 — EntryCameraResolver', () => {
  /*
   * Habitat merkezi DÜNYA merkezi değildir: şekil gürültülüdür ve sınırlayıcı
   * kutusu kaymıştır (ölçüldü: 522,5 ≠ 512). Merkez habitatın kendi kutusundan
   * çıkar.
   */
  it('boş dünyada habitat merkezine düşer', () => {
    const habitat = domain();

    const target = resolveEntryCamera(new ParticleStore(8), habitat, OPTIONS);

    expect(target.sampleCount).toBe(0);
    expect(target.x).toBeCloseTo(habitat.bbox.x + habitat.bbox.width / 2, 6);
    expect(target.y).toBeCloseTo(habitat.bbox.y + habitat.bbox.height / 2, 6);
  });

  /* Basit ortalama iki kümenin ARASINI gösterirdi; odak yoğun kümede olmalı. */
  it('yoğun kümeyi seçer, iki kümenin ortasını değil', () => {
    const particles = new ParticleStore(64);
    blob(particles, 300, 300, 4);
    blob(particles, 700, 700, 20);

    const target = resolveEntryCamera(particles, domain(), OPTIONS);

    expect(target.sampleCount).toBe(20);
    expect(target.x).toBeGreaterThan(600);
    expect(target.y).toBeGreaterThan(600);
  });

  it('aynı girdi her zaman aynı odağı verir', () => {
    const particles = new ParticleStore(64);
    blob(particles, 400, 500, 12);

    const first = resolveEntryCamera(particles, domain(), OPTIONS);
    const second = resolveEntryCamera(particles, domain(), OPTIONS);

    expect(second).toEqual(first);
  });

  /* Eşitlikte sıra deterministik: önce küçük hücre y, sonra küçük hücre x. */
  it('eşit yoğunlukta deterministik sıra uygular', () => {
    const particles = new ParticleStore(64);
    blob(particles, 600, 300, 8);
    blob(particles, 300, 600, 8);

    const target = resolveEntryCamera(particles, domain(), OPTIONS);

    // Küçük hücre y kazanır: (600, 300) hücresi.
    expect(target.y).toBeLessThan(450);
    expect(target.x).toBeGreaterThan(450);
  });

  it('kıyıya yapışmış odak güvenli iç bölgeye çekilir', () => {
    const habitat = domain();
    const particles = new ParticleStore(64);
    // Kıyıya yakın bir nokta bulunur ve küme oraya konur.
    let edge = { x: 512, y: 512 };
    for (let radius = 0; radius < 512; radius += 1) {
      const point = { x: 512 + radius, y: 512 };
      if (habitat.sampleDistanceAndNormal(point.x, point.y).distance < 5) {
        edge = point;
        break;
      }
    }
    blob(particles, edge.x, edge.y, 10);

    const target = resolveEntryCamera(particles, habitat, OPTIONS);

    expect(habitat.sampleDistanceAndNormal(target.x, target.y).distance).toBeGreaterThanOrEqual(
      OPTIONS.safeMarginUnits - 1e-6,
    );
  });

  it('geçersiz hücre boyu reddedilir', () => {
    expect(() =>
      resolveEntryCamera(new ParticleStore(4), domain(), { ...OPTIONS, cellUnits: 0 }),
    ).toThrow(RangeError);
  });
});
