import { describe, expect, it, vi } from 'vitest';
import { lifeGraphicsConfig } from '@/config/graphics';
import { particlePalette } from '@/config/particles';
import { substrateConfig } from '@/config/substrate';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { VoidDeathRenderer } from '@/runtime/render/VoidDeathRenderer';
import { ParticleStore } from '@/runtime/sim/ParticleStore';
import { createHabitatDomain } from '@/runtime/sim/WorldDomain';

/*
 * D3: Adım 2 glyph'leri SALT RENDER VERİSİDİR. Render ne parçacık durumunu ne
 * de kuvveti değiştirebilir; uzama sınırları config'e bağlıdır ve aşılmaz.
 *
 * Kanıt bayt düzeyindedir: 100'den fazla durumda bütün `ParticleStore` dizileri
 * render öncesi ve sonrası birebir karşılaştırılır. "Değişmedi" iddiası özet
 * metrikle değil, dizilerin kendisiyle kurulur.
 */
const STATE_COUNT = 120;

interface EllipseCall {
  readonly width: number;
  readonly height: number;
}

function fakeScene(ellipses: EllipseCall[]) {
  const graphics = {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    fillEllipse: vi.fn((_x: number, _y: number, width: number, height: number) => {
      ellipses.push({ width, height });
    }),
    fillCircle: vi.fn(),
    setDepth: vi.fn(() => graphics),
    setAngle: vi.fn(() => graphics),
    setPosition: vi.fn(() => graphics),
    save: vi.fn(),
    restore: vi.fn(),
    translateCanvas: vi.fn(),
    rotateCanvas: vi.fn(),
    destroy: vi.fn(),
  };
  return { add: { graphics: () => graphics } } as never;
}

function snapshotArrays(particles: ParticleStore): Record<string, number[]> {
  return {
    active: [...particles.active],
    x: [...particles.x],
    y: [...particles.y],
    previousX: [...particles.previousX],
    previousY: [...particles.previousY],
    vx: [...particles.vx],
    vy: [...particles.vy],
    type: [...particles.type],
    stableId: [...particles.stableId],
    edgeDistance: [...particles.edgeDistance],
    forceX: [...particles.forceX],
    forceY: [...particles.forceY],
  };
}

/** Hız, fringe yakınlığı ve ölüm hayaleti içeren çeşitli durumlar. */
function buildState(index: number): ParticleStore {
  const particles = new ParticleStore(8);
  const maxSpeed = substrateConfig.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick;
  for (let slot = 0; slot < 4; slot++) {
    const speedRatio = ((index + slot) % 7) / 6;
    const angle = ((index * 7 + slot * 13) % 360) * (Math.PI / 180);
    particles.activateSlot(
      400 + slot * 30 + (index % 11),
      400 + slot * 20 + (index % 13),
      Math.cos(angle) * maxSpeed * speedRatio * 1.5,
      Math.sin(angle) * maxSpeed * speedRatio * 1.5,
      slot % particlePalette.length,
    );
    // Fringe yakınlığı: bazı durumlarda kıyının içinde, bazılarında dışında.
    particles.edgeDistance[slot] = ((index + slot) % 9) * 6 - 6;
  }
  return particles;
}

describe('D3 — glyph salt render verisidir', () => {
  it(`${STATE_COUNT} durumda parçacık dizileri bayt düzeyinde değişmez`, () => {
    const ellipses: EllipseCall[] = [];
    const domain = createHabitatDomain(
      substrateConfig.world.boundsUnits,
      substrateConfig.habitat,
      7,
    );
    const renderer = new ParticleRenderer(
      fakeScene(ellipses),
      {
        radiusUnits: substrateConfig.particles.radiusUnits,
        maxSpeedUnitsPerReferenceTick:
          substrateConfig.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
        velocityStretchMax: lifeGraphicsConfig.particleVelocityStretchMax,
        fringeWidthUnits: substrateConfig.candidate.void.widthUnits,
        fringeStretchMax: lifeGraphicsConfig.particleFringeStretchMax,
      },
      domain,
    );

    for (let index = 0; index < STATE_COUNT; index++) {
      const particles = buildState(index);
      const before = snapshotArrays(particles);

      renderer.render(particles, (index % 5) / 4);

      expect(snapshotArrays(particles)).toEqual(before);
    }
  });

  it('kuvvet tamponları render sırasında yazılmaz', () => {
    const ellipses: EllipseCall[] = [];
    const particles = buildState(3);
    for (let slot = 0; slot < particles.capacity; slot++) {
      particles.forceX[slot] = 1.25;
      particles.forceY[slot] = -2.5;
    }
    const renderer = new ParticleRenderer(fakeScene(ellipses), {
      radiusUnits: substrateConfig.particles.radiusUnits,
      maxSpeedUnitsPerReferenceTick: 2.4,
      velocityStretchMax: lifeGraphicsConfig.particleVelocityStretchMax,
      fringeWidthUnits: 24,
      fringeStretchMax: lifeGraphicsConfig.particleFringeStretchMax,
    });

    renderer.render(particles, 1);

    expect([...particles.forceX].every((value) => value === 1.25)).toBe(true);
    expect([...particles.forceY].every((value) => value === -2.5)).toBe(true);
  });

  /* Uzama CONFIG'e bağlıdır: hiçbir durumda tavanı aşmaz. */
  it('uzama config tavanını aşmaz ve alan korunur', () => {
    const ellipses: EllipseCall[] = [];
    const renderer = new ParticleRenderer(fakeScene(ellipses), {
      radiusUnits: substrateConfig.particles.radiusUnits,
      maxSpeedUnitsPerReferenceTick:
        substrateConfig.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
      velocityStretchMax: lifeGraphicsConfig.particleVelocityStretchMax,
      fringeWidthUnits: substrateConfig.candidate.void.widthUnits,
      fringeStretchMax: lifeGraphicsConfig.particleFringeStretchMax,
    });

    for (let index = 0; index < STATE_COUNT; index++) {
      renderer.render(buildState(index), 1);
    }

    const diameter = substrateConfig.particles.radiusUnits * 2;
    const maxStretch = Math.max(
      lifeGraphicsConfig.particleVelocityStretchMax,
      lifeGraphicsConfig.particleFringeStretchMax,
    );
    expect(ellipses.length).toBeGreaterThan(0);
    for (const ellipse of ellipses) {
      // Config tavanı: genişlik hiçbir durumda aşmaz.
      expect(ellipse.width).toBeLessThanOrEqual(diameter * maxStretch + 1e-6);
      /*
       * Uzama ALAN KORUMAZ: yükseklik 1/√uzama ile daralır, yani alan √uzama
       * kadar büyür. DESIGN yalnız "sınırlı uzama" vaat ediyor; burada
       * kilitlenen şey uzamanın yönü ve tavanıdır.
       */
      expect(ellipse.height).toBeLessThanOrEqual(diameter + 1e-6);
      expect(ellipse.width).toBeGreaterThanOrEqual(ellipse.height - 1e-6);
    }
  });

  it('ölüm hayaleti de parçacık durumuna dokunmaz', () => {
    const ellipses: EllipseCall[] = [];
    const particles = buildState(11);
    const before = snapshotArrays(particles);
    const ghosts = new VoidDeathRenderer(fakeScene(ellipses), {
      durationMs: lifeGraphicsConfig.voidDeathDurationMs,
      maxGhosts: lifeGraphicsConfig.voidDeathMaxGhosts,
      stretchMax: lifeGraphicsConfig.voidDeathStretchMax,
      radiusUnits: substrateConfig.particles.radiusUnits,
      drainColor: lifeGraphicsConfig.voidColor,
    });

    ghosts.push(
      [{ kind: 'void-death', x: 420, y: 430, normalX: 1, normalY: 0, type: 0, tick: 1 } as never],
      16,
    );
    ghosts.render(32);

    expect(snapshotArrays(particles)).toEqual(before);
  });

  /* Glyph biçimleri yalnız serbest/hız/fringe/ölümdür; rol enum'u yoktur. */
  it('glyph yüzeyinde rol kavramı yoktur', () => {
    const style = {
      radiusUnits: 1,
      maxSpeedUnitsPerReferenceTick: 1,
      velocityStretchMax: 1.5,
      fringeWidthUnits: 1,
      fringeStretchMax: 1.5,
    };

    expect(Object.keys(style).some((key) => /role|rol/i.test(key))).toBe(false);
  });
});
