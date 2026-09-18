import type { SubstrateCandidate } from '@/config/candidate';
import {
  cloneSubstrateConfig,
  substrateConfig,
  validateSubstrateConfig,
  type SubstrateConfig,
} from '@/config/substrate';
import { resolveSimulationHz } from '@/config/world';
import { FieldSet, type FieldSnapshot } from '@/runtime/sim/FieldSet';
import { pickType, seedInitialMatter } from '@/runtime/sim/InitialMatterSeeder';
import { LightSources } from '@/runtime/sim/LightSources';
import { validateLifeWorldSnapshot } from '@/runtime/sim/LifeWorldSnapshotValidation';
import { MatterReservoir, type MatterReservoirSnapshot } from '@/runtime/sim/MatterReservoir';
import { createMultiBandKernel, type PairForceKernel } from '@/runtime/sim/PairForceKernel';
import { accumulateParticleForces, integrateParticles } from '@/runtime/sim/ParticlePhysics';
import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import { NO_SLOT, ParticleStore, type ParticleSnapshot } from '@/runtime/sim/ParticleStore';
import { WorldRandomStreams } from '@/runtime/sim/RandomStreams';
import { SimulationTempo } from '@/runtime/sim/SimulationTempo';
import { VoidSink } from '@/runtime/sim/VoidSink';
import {
  noopWorldEventSink,
  type TransientPresentationEvent,
  type VoidDeathEvent,
  type WorldEventSink,
} from '@/runtime/sim/WorldEvents';
import { HabitatSDF, rasterizeHabitatMask, type WorldDomain } from '@/runtime/sim/WorldDomain';
import {
  createFreshWorldMetadata,
  type WorldMetadata,
  validateWorldMetadata,
} from '@/runtime/sim/WorldMetadata';

export interface LifeWorldSnapshot {
  readonly metadata: WorldMetadata;
  readonly tick: number;
  /** `RANDOM_STREAM_IDS` sırasında akış durumları; kurulumdan sonra ilerleyen akışlar burada sürer. */
  readonly randomStreamStates: Int32Array;
  readonly nextFieldBand: number;
  readonly habitatDigest: string;
  readonly nutrientDiffusionSource: Float32Array;
  readonly fields: FieldSnapshot;
  readonly particles: ParticleSnapshot;
  readonly reservoir: MatterReservoirSnapshot;
}

export interface LifeWorldOptions {
  /** Test/araştırma için kernel enjeksiyonu; üretim genomdan türetir. */
  readonly kernel?: PairForceKernel;
  /** Dünya tarihi kanalı; üretimde no-op, testte/araştırmada toplayıcı. */
  readonly worldEvents?: WorldEventSink;
}

export class LifeWorld {
  readonly metadata: WorldMetadata;
  readonly domain: WorldDomain;
  readonly fields: FieldSet;
  readonly particles: ParticleStore;
  readonly reservoir = new MatterReservoir();
  readonly candidate: SubstrateCandidate;
  private readonly config: SubstrateConfig;
  private readonly streams: WorldRandomStreams;
  private readonly tempo: SimulationTempo;
  private readonly light: LightSources;
  private readonly nutrientDiffusionSource: Float32Array;
  private readonly particleGrid: ParticleSpatialHash;
  private readonly kernel: PairForceKernel;
  private readonly sink: VoidSink;
  private readonly worldEvents: WorldEventSink;
  private readonly crossingScratch: VoidDeathEvent[] = [];
  private readonly scratchSample = { distance: 0, normalX: 1, normalY: 0 };
  private presentationEvents: TransientPresentationEvent[] = [];
  private nextFieldBand = 0;
  private fieldUpdated = false;
  private ventRemainingInBurst = 0;
  private ventCooldownRemaining = 0;
  private ventNextSpawnTick = 0;
  private ventOriginX = 0;
  private ventOriginY = 0;

  constructor(
    config: SubstrateConfig = substrateConfig,
    metadata: WorldMetadata = createFreshWorldMetadata(),
    options: LifeWorldOptions = {},
  ) {
    validateWorldMetadata(metadata);
    validateSubstrateConfig(config);
    this.config = cloneSubstrateConfig(config);
    this.candidate = this.config.candidate;
    this.metadata = { ...metadata };
    const { world, particles, habitat } = this.config;
    this.tempo = new SimulationTempo(resolveSimulationHz(world.fixedStepMs));
    this.streams = new WorldRandomStreams(this.metadata.seed);
    this.domain = new HabitatSDF(world.boundsUnits, habitat, this.streams.stream('habitat'));
    this.fields = new FieldSet(world.fieldResolution);
    this.fields.setMask(rasterizeHabitatMask(this.domain, world.fieldResolution));
    this.light = new LightSources(
      world.boundsUnits,
      {
        count: world.lightSourceCount,
        radiusUnits: world.lightSourceRadiusUnits,
        driftUnits: world.lightSourceDriftUnits,
      },
      this.streams.stream('fields'),
    );
    this.initializeFields();
    this.nutrientDiffusionSource = this.fields.nutrient.slice();
    this.particles = new ParticleStore(particles.capacity);
    seedInitialMatter(
      this.particles,
      this.streams.stream('matter-seeding'),
      this.domain,
      this.candidate.seeding,
    );
    this.particles.capturePrevious();
    this.particleGrid = new ParticleSpatialHash(
      world.boundsUnits,
      particles.cellSizeUnits,
      particles.capacity,
    );
    this.kernel = options.kernel ?? createMultiBandKernel(this.candidate.physics);
    this.sink = new VoidSink(this.domain, this.candidate.void);
    this.worldEvents = options.worldEvents ?? noopWorldEventSink;
    this.ventCooldownRemaining = Math.round(
      particles.reseedIntervalSeconds * particles.referenceHz,
    );
    this.tempo.every(world.fieldHz, (tick) => {
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
    accumulateParticleForces(
      this.particles,
      this.particleGrid,
      this.kernel,
      this.candidate.physics.dynamics.forceScale,
      this.config.particles.exclusionRadiusUnits,
      this.config.particles.exclusionStrength,
      this.config.particles.radiusUnits * 2,
      this.config.particles.contactStrength,
    );
    this.sink.applyFringeStress(this.particles);
    integrateParticles(
      this.particles,
      this.candidate.physics.dynamics,
      this.config.particles.referenceHz,
      this.config.world.fixedStepMs,
    );
    this.crossingScratch.length = 0;
    this.sink.collectCrossings(this.particles, this.reservoir, this.tick + 1, this.crossingScratch);
    for (const event of this.crossingScratch) {
      this.worldEvents.emit(event);
      this.presentationEvents.push(event);
    }
    this.updateEcologicalVent();
    this.tempo.advance();
    return this.fieldUpdated;
  }

  /**
   * Sunum kanalını boşaltır. Dünya kanalı BURADAN akmaz: olaylar zaten
   * `WorldEventSink`e yazıldı, bu çağrı onları tüketmez. Boşaltılmayan tampon
   * aktif slot başına en fazla bir ölüm taşır, çünkü Void ölümü geri dönüşsüzdür.
   */
  drainTransientPresentationEvents(): readonly TransientPresentationEvent[] {
    const delivered = this.presentationEvents;
    this.presentationEvents = [];
    return delivered;
  }

  snapshot(): LifeWorldSnapshot {
    return {
      metadata: { ...this.metadata },
      tick: this.tick,
      randomStreamStates: this.streams.snapshot(),
      nextFieldBand: this.nextFieldBand,
      habitatDigest: this.domain.digest,
      nutrientDiffusionSource: this.nutrientDiffusionSource.slice(),
      fields: this.fields.snapshot(),
      particles: this.particles.snapshot(),
      reservoir: this.reservoir.snapshot(),
    };
  }

  restore(snapshot: LifeWorldSnapshot): void {
    validateLifeWorldSnapshot(snapshot, this.config, this.domain);
    if (
      snapshot.metadata.id !== this.metadata.id ||
      snapshot.metadata.seed !== this.metadata.seed ||
      snapshot.metadata.createdAtMs !== this.metadata.createdAtMs
    ) {
      throw new RangeError('Snapshot başka bir dünya örneğine ait.');
    }
    this.tempo.setTick(snapshot.tick);
    this.streams.restore(snapshot.randomStreamStates);
    this.nextFieldBand = snapshot.nextFieldBand;
    this.nutrientDiffusionSource.set(snapshot.nutrientDiffusionSource);
    this.fields.restore(snapshot.fields);
    this.particles.restore(snapshot.particles);
    this.reservoir.restore(snapshot.reservoir);
    this.presentationEvents = [];
  }

  private initializeFields(): void {
    const mask = this.fields.mask;
    const { temperature, nutrient, light, length, resolution } = this.fields;
    for (let index = 0; index < length; index++) {
      temperature[index] = mask && mask[index] === 0 ? 0 : 0.5;
    }
    this.light.renderRows(light, resolution, mask, 0, 0, resolution);
    for (let index = 0; index < length; index++) nutrient[index] = light[index] * 0.58;
  }

  private stepFields(tick: number): void {
    const { world } = this.config;
    const rowCount = this.fields.resolution / world.fieldUpdateBands;
    const startRow = this.nextFieldBand * rowCount;
    if (this.nextFieldBand === 0) this.nutrientDiffusionSource.set(this.fields.nutrient);
    this.light.renderRows(
      this.fields.light,
      this.fields.resolution,
      this.fields.mask,
      tick,
      startRow,
      rowCount,
    );
    this.fields.diffuseRows(
      'nutrient',
      world.nutrientDiffusion,
      startRow,
      rowCount,
      this.nutrientDiffusionSource,
    );
    const { nutrient, light } = this.fields;
    const start = startRow * this.fields.resolution;
    const end = start + rowCount * this.fields.resolution;
    for (let index = start; index < end; index++) {
      nutrient[index] += (light[index] - nutrient[index]) * world.nutrientRenewal;
    }
    this.nextFieldBand = (this.nextFieldBand + 1) % world.fieldUpdateBands;
  }

  private updateEcologicalVent(): void {
    if (this.ventCooldownRemaining > 0) {
      this.ventCooldownRemaining--;
      return;
    }

    if (this.ventRemainingInBurst > 0) {
      if (this.tick >= this.ventNextSpawnTick) {
        this.spawnSingleVentParticle(this.ventOriginX, this.ventOriginY);
        this.ventRemainingInBurst--;
        if (this.ventRemainingInBurst > 0) {
          this.ventNextSpawnTick = this.tick + this.config.particles.ventCadenceTicks;
        } else {
          this.ventCooldownRemaining = this.config.particles.ventCooldownTicks;
        }
      }
      return;
    }

    const freeSlots = this.particles.capacity - this.particles.activeCount;
    if (freeSlots <= 0 || this.reservoir.external <= 0) return;

    const random = this.streams.stream('lifecycle');
    const { ventBurstMin, ventBurstMax, ventCooldownTicks, ventCadenceTicks } =
      this.config.particles;
    const burstTarget = Math.floor(
      ventBurstMin + random.next() * (ventBurstMax - ventBurstMin + 1),
    );
    const toReseed = Math.min(freeSlots, Math.min(this.reservoir.external, burstTarget));
    const count = this.reservoir.reseed(toReseed);
    if (count <= 0) return;

    const safeDistance = this.candidate.seeding.safeEdgeMarginUnits + 4;
    const { bbox } = this.domain;
    let originX = bbox.x + bbox.width / 2;
    let originY = bbox.y + bbox.height / 2;
    for (let attempt = 0; attempt < 32; attempt++) {
      const candidateX = bbox.x + random.next() * bbox.width;
      const candidateY = bbox.y + random.next() * bbox.height;
      if (
        this.domain.sampleDistanceAndNormal(candidateX, candidateY, this.scratchSample).distance >=
        safeDistance
      ) {
        originX = candidateX;
        originY = candidateY;
        break;
      }
    }

    this.ventOriginX = originX;
    this.ventOriginY = originY;
    this.ventRemainingInBurst = count;

    this.spawnSingleVentParticle(originX, originY);
    this.ventRemainingInBurst--;
    if (this.ventRemainingInBurst > 0) {
      this.ventNextSpawnTick = this.tick + ventCadenceTicks;
    } else {
      this.ventCooldownRemaining = ventCooldownTicks;
    }
  }

  private spawnSingleVentParticle(originX: number, originY: number): void {
    const random = this.streams.stream('lifecycle');
    const seeding = this.candidate.seeding;
    const angle = random.next() * Math.PI * 2;
    const driftRadius = random.next() * 12;
    const posX = originX + Math.cos(angle) * driftRadius;
    const posY = originY + Math.sin(angle) * driftRadius;
    const speed = seeding.initialSpeedUnitsPerReferenceTick * (0.5 + random.next() * 0.5);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const particleType = pickType(random, seeding.typeWeights);
    const slot = this.particles.activateSlot(posX, posY, vx, vy, particleType);
    if (slot !== NO_SLOT) {
      this.presentationEvents.push({
        kind: 'particle-spawn',
        tick: this.tick,
        stableId: this.particles.stableId[slot],
        x: posX,
        y: posY,
        vx,
        vy,
        type: particleType,
      });
    }
  }
}
