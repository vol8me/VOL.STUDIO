import type { WorldConfig } from '@/config/world';
import { particleConfig, type ParticleConfig } from '@/config/particles';
import { FieldSet, type FieldSnapshot } from '@/runtime/sim/FieldSet';
import {
  accumulateParticleForces,
  initializeParticles,
  integrateParticles,
} from '@/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { ParticleStore, type ParticleSnapshot } from '@/runtime/sim/ParticleStore';
import { createSimRandom } from '@/runtime/sim/rng';
import { SimulationTempo } from '@/runtime/sim/SimulationTempo';

interface LightSource {
  readonly originX: number;
  readonly originY: number;
  readonly phase: number;
  readonly angularSpeed: number;
  readonly strength: number;
}

export interface LifeWorldSnapshot {
  readonly tick: number;
  readonly rngState: number;
  readonly nextFieldBand: number;
  readonly nutrientDiffusionSource: Float32Array;
  readonly fields: FieldSnapshot;
  readonly particles: ParticleSnapshot;
}

export class LifeWorld {
  readonly fields: FieldSet;
  readonly particles: ParticleStore;
  private readonly random;
  private readonly tempo = new SimulationTempo(60);
  private readonly sources: LightSource[];
  private readonly nutrientDiffusionSource: Float32Array;
  private readonly particleGrid: ParticleSpatialHash;
  private readonly particlesConfig: ParticleConfig;
  private nextFieldBand = 0;
  private fieldUpdated = false;

  constructor(
    private readonly config: WorldConfig,
    particlesConfig: ParticleConfig = particleConfig,
  ) {
    if (
      !Number.isInteger(config.fieldUpdateBands) ||
      config.fieldUpdateBands < 1 ||
      config.fieldResolution % config.fieldUpdateBands !== 0
    ) {
      throw new RangeError(`Alan bant sayısı çözünürlüğü tam bölmeli: ${config.fieldUpdateBands}`);
    }
    this.fields = new FieldSet(config.fieldResolution);
    this.random = createSimRandom(config.seed);
    this.particlesConfig = particlesConfig;
    const { boundsUnits } = config;
    this.sources = Array.from({ length: config.lightSourceCount }, () => ({
      originX: boundsUnits.x + this.random.next() * boundsUnits.width,
      originY: boundsUnits.y + this.random.next() * boundsUnits.height,
      phase: this.random.next() * Math.PI * 2,
      angularSpeed: 0.00035 + this.random.next() * 0.00045,
      strength: 0.62 + this.random.next() * 0.38,
    }));
    this.fields.temperature.fill(0.5);
    this.renderLight(0);
    for (let i = 0; i < this.fields.length; i++) {
      this.fields.nutrient[i] = this.fields.light[i] * 0.58;
    }
    this.nutrientDiffusionSource = this.fields.nutrient.slice();
    this.particles = new ParticleStore(this.particlesConfig.count);
    initializeParticles(this.particles, this.random, this.particlesConfig, boundsUnits);
    this.particles.capturePrevious();
    this.particleGrid = new ParticleSpatialHash(
      boundsUnits,
      this.particlesConfig.cellSizeUnits,
      this.particles.count,
    );
    this.tempo.every(config.fieldHz, (tick) => {
      this.stepFields(tick);
      this.fieldUpdated = true;
    });
  }

  get tick(): number {
    return this.tempo.getTick();
  }

  step(): boolean {
    this.fieldUpdated = false;
    this.particles.capturePrevious();
    this.particleGrid.rebuild(this.particles);
    accumulateParticleForces(this.particles, this.particleGrid, this.particlesConfig);
    integrateParticles(
      this.particles,
      this.particlesConfig,
      this.config.boundsUnits,
      this.config.fixedStepMs,
    );
    this.tempo.advance();
    return this.fieldUpdated;
  }

  snapshot(): LifeWorldSnapshot {
    return {
      tick: this.tick,
      rngState: this.random.getState(),
      nextFieldBand: this.nextFieldBand,
      nutrientDiffusionSource: this.nutrientDiffusionSource.slice(),
      fields: this.fields.snapshot(),
      particles: this.particles.snapshot(),
    };
  }

  restore(snapshot: LifeWorldSnapshot): void {
    this.tempo.setTick(snapshot.tick);
    this.random.setState(snapshot.rngState);
    this.nextFieldBand = snapshot.nextFieldBand;
    if (snapshot.nutrientDiffusionSource.length !== this.fields.length) {
      throw new RangeError(`Difüzyon kaynak zamanı ${this.fields.length} değer taşımalı`);
    }
    this.nutrientDiffusionSource.set(snapshot.nutrientDiffusionSource);
    this.fields.restore(snapshot.fields);
    this.particles.restore(snapshot.particles);
  }

  private stepFields(tick: number): void {
    const rowCount = this.fields.resolution / this.config.fieldUpdateBands;
    const startRow = this.nextFieldBand * rowCount;
    if (this.nextFieldBand === 0) this.nutrientDiffusionSource.set(this.fields.nutrient);
    this.renderLightRows(tick, startRow, rowCount);
    this.fields.diffuseRows(
      'nutrient',
      this.config.nutrientDiffusion,
      startRow,
      rowCount,
      this.nutrientDiffusionSource,
    );
    const { nutrient, light } = this.fields;
    const start = startRow * this.fields.resolution;
    const end = start + rowCount * this.fields.resolution;
    for (let i = start; i < end; i++) {
      nutrient[i] += (light[i] - nutrient[i]) * this.config.nutrientRenewal;
    }
    this.nextFieldBand = (this.nextFieldBand + 1) % this.config.fieldUpdateBands;
  }

  private renderLight(tick: number): void {
    this.renderLightRows(tick, 0, this.fields.resolution);
  }

  private renderLightRows(tick: number, startRow: number, rowCount: number): void {
    const { light, resolution } = this.fields;
    const { boundsUnits } = this.config;
    const cellWidth = boundsUnits.width / resolution;
    const cellHeight = boundsUnits.height / resolution;
    const radiusSquared = this.config.lightSourceRadiusUnits ** 2;
    const endRow = startRow + rowCount;
    light.fill(0, startRow * resolution, endRow * resolution);
    for (const source of this.sources) {
      const angle = source.phase + tick * source.angularSpeed;
      const sourceX = clamp(
        source.originX + Math.cos(angle) * this.config.lightSourceDriftUnits,
        boundsUnits.x,
        boundsUnits.x + boundsUnits.width,
      );
      const sourceY = clamp(
        source.originY + Math.sin(angle * 0.83) * this.config.lightSourceDriftUnits,
        boundsUnits.y,
        boundsUnits.y + boundsUnits.height,
      );
      for (let y = startRow; y < endRow; y++) {
        const worldY = boundsUnits.y + (y + 0.5) * cellHeight;
        const dy = worldY - sourceY;
        for (let x = 0; x < resolution; x++) {
          const worldX = boundsUnits.x + (x + 0.5) * cellWidth;
          const dx = worldX - sourceX;
          const contribution =
            source.strength * Math.exp(-(dx * dx + dy * dy) / (2 * radiusSquared));
          const index = y * resolution + x;
          light[index] = Math.min(1, light[index] + contribution);
        }
      }
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
