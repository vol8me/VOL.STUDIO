import type Phaser from 'phaser';
import {
  DisposableScope,
  SimulationClock,
  WorldCameraController,
  type SimulationClockFrame,
} from '@volstudio/core';
import type { SubstrateCandidate } from '@/config/candidate';
import {
  lifeGraphicsConfig,
  validateLifeGraphicsConfig,
  type LifeGraphicsConfig,
} from '@/config/graphics';
import { substrateConfig, type SubstrateConfig } from '@/config/substrate';
import { cameraScales, entryCameraScale, zoomForScale } from '@/config/cameraScales';
import { resolveCameraDomain } from '@/runtime/render/cameraDomain';
import { resolveEntryCamera } from '@/runtime/render/EntryCameraResolver';
import { FieldRenderer } from '@/runtime/render/FieldRenderer';
import { HabitatRenderer } from '@/runtime/render/HabitatRenderer';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { VoidDeathRenderer } from '@/runtime/render/VoidDeathRenderer';
import { LifeWorld, type LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';
import type { TransientPresentationEvent } from '@/runtime/sim/WorldEvents';
import { rasterizeHabitatShade, type WorldDomain } from '@/runtime/sim/WorldDomain';
import { createFreshWorldMetadata, type WorldMetadata } from '@/runtime/sim/WorldMetadata';

interface RuntimeWorld {
  readonly domain: WorldDomain;
  readonly fields: LifeWorld['fields'];
  readonly particles: LifeWorld['particles'];
  step(): boolean;
  snapshot(): LifeWorldSnapshot;
  restore(snapshot: LifeWorldSnapshot): void;
  drainTransientPresentationEvents(): readonly TransientPresentationEvent[];
}

interface RuntimeFieldRenderer {
  render(fields: LifeWorld['fields']): void;
  destroy(): void;
}

interface RuntimeAnimated {
  update(nowMs: number): void;
  destroy(): void;
}

interface RuntimeDeathRenderer {
  push(events: readonly TransientPresentationEvent[], nowMs: number): void;
  render(nowMs: number): void;
  destroy(): void;
}

interface RuntimeParticleRenderer {
  render(particles: LifeWorld['particles'], interpolationAlpha: number): void;
  destroy(): void;
}

interface RuntimeCamera {
  update(deltaMs: number): void;
  refreshViewport(): void;
  /** D2: açılış odağı anlık uygulanır; geçiş animasyonu kurulmaz. */
  setState(next: { centerX?: number; centerY?: number; zoom?: number }): void;
  destroy(): void;
}

interface RuntimeBackdrop {
  setBackgroundColor(color: number): unknown;
}

export interface LifeRuntimeDependencies {
  readonly config?: SubstrateConfig;
  readonly graphics?: LifeGraphicsConfig;
  /** Geliştirme audition genomu; üretimde hiçbir yol bunu doldurmaz. */
  readonly candidate?: SubstrateCandidate;
  readonly world?: RuntimeWorld;
  readonly fieldRenderer?: RuntimeFieldRenderer;
  readonly habitatRenderer?: RuntimeAnimated;
  readonly deathRenderer?: RuntimeDeathRenderer;
  readonly particleRenderer?: RuntimeParticleRenderer;
  readonly cameraController?: RuntimeCamera;
  /** Void arka planını alan yüzey; varsayılan ana kameradır. */
  readonly backdrop?: RuntimeBackdrop;
  readonly initialSnapshot?: LifeWorldSnapshot | null;
  readonly worldMetadata?: WorldMetadata;
}

export class LifeRuntime {
  private readonly scope = new DisposableScope();
  private readonly world: RuntimeWorld;
  private readonly fieldRenderer: RuntimeFieldRenderer;
  private readonly habitatRenderer: RuntimeAnimated;
  private readonly deathRenderer: RuntimeDeathRenderer;
  private readonly particleRenderer: RuntimeParticleRenderer;
  private readonly cameraController: RuntimeCamera;
  /**
   * Açılış kamerası (D2). Eski açılış `fit: 'contain'` ve zoom 1 ile bütün
   * dünyayı gösteriyordu: ekranda küçük bir ada ve dev bir Void kalıyordu.
   * Artık ECOSYSTEM ölçeğinde, maddenin yoğun olduğu odağa gelinir.
   */
  private applyEntryCamera(scene: Phaser.Scene, config: SubstrateConfig): void {
    const target = resolveEntryCamera(this.world.particles, this.world.domain, {
      cellUnits: config.candidate.physics.cutoffUnits,
      safeMarginUnits: config.candidate.void.widthUnits,
    });
    const viewportWidth = scene.cameras.main.width;
    this.cameraController.setState({
      centerX: target.x,
      centerY: target.y,
      zoom: zoomForScale(
        cameraScales[entryCameraScale],
        viewportWidth,
        config.candidate.physics.cutoffUnits,
      ),
    });
  }

  private readonly clock: SimulationClock;
  private elapsedMs = 0;

  constructor(scene: Phaser.Scene, dependencies: LifeRuntimeDependencies = {}) {
    const baseConfig = dependencies.config ?? substrateConfig;
    const config = dependencies.candidate
      ? { ...baseConfig, candidate: dependencies.candidate }
      : baseConfig;
    const graphics = dependencies.graphics ?? lifeGraphicsConfig;
    validateLifeGraphicsConfig(graphics);
    const metadata =
      dependencies.initialSnapshot?.metadata ??
      dependencies.worldMetadata ??
      createFreshWorldMetadata();
    try {
      this.world = dependencies.world ?? new LifeWorld(config, metadata);
      if (dependencies.initialSnapshot) this.world.restore(dependencies.initialSnapshot);
      const { domain } = this.world;
      this.fieldRenderer = this.scope.addDestroyable(
        dependencies.fieldRenderer ??
          new FieldRenderer(
            scene,
            this.world.fields,
            config.world.boundsUnits,
            rasterizeHabitatShade(
              domain,
              config.world.fieldResolution,
              graphics.habitatEdgeFadeUnits,
            ),
          ),
      );
      this.habitatRenderer = this.scope.addDestroyable(
        dependencies.habitatRenderer ??
          new HabitatRenderer(
            scene,
            domain,
            resolveCameraDomain(domain.bbox, config.habitat.cameraVoidMarginRatio),
            {
              resolution: graphics.habitatGlowResolution,
              decayUnits: graphics.habitatGlowDecayUnits,
              shoreWidthUnits: graphics.habitatGlowShoreWidthUnits,
              interiorFadeUnits: graphics.habitatGlowInteriorFadeUnits,
              voidAlpha: graphics.habitatGlowVoidAlpha,
              shoreAlpha: graphics.habitatGlowShoreAlpha,
              rasterBudgetMs: graphics.habitatGlowRasterBudgetMs,
              color: graphics.voidColor,
              pulsePeriodMs: graphics.voidPulsePeriodMs,
              pulseAlphaMin: graphics.voidPulseAlphaMin,
              pulseAlphaMax: graphics.voidPulseAlphaMax,
            },
          ),
      );
      this.particleRenderer = this.scope.addDestroyable(
        dependencies.particleRenderer ??
          new ParticleRenderer(
            scene,
            {
              radiusUnits: config.particles.radiusUnits,
              maxSpeedUnitsPerReferenceTick:
                config.candidate.physics.dynamics.maxSpeedUnitsPerReferenceTick,
              velocityStretchMax: graphics.particleVelocityStretchMax,
              fringeWidthUnits: config.candidate.void.widthUnits,
              fringeStretchMax: graphics.particleFringeStretchMax,
            },
            domain,
          ),
      );
      this.deathRenderer = this.scope.addDestroyable(
        dependencies.deathRenderer ??
          new VoidDeathRenderer(scene, {
            durationMs: graphics.voidDeathDurationMs,
            maxGhosts: graphics.voidDeathMaxGhosts,
            stretchMax: graphics.voidDeathStretchMax,
            radiusUnits: config.particles.radiusUnits,
            drainColor: graphics.voidColor,
          }),
      );
      this.cameraController = this.scope.addDestroyable(
        dependencies.cameraController ??
          new WorldCameraController(scene.game.canvas, scene.cameras.main, {
            bounds: resolveCameraDomain(domain.bbox, config.habitat.cameraVoidMarginRatio),
            fit: 'contain',
            maxZoomFactor: graphics.cameraMaxZoomFactor,
            initialZoomFactor: graphics.cameraInitialZoomFactor,
          }),
      );
      // D2: açılış ECOSYSTEM ölçeğinde ve maddenin yoğun olduğu odakta.
      this.applyEntryCamera(scene, config);
      (dependencies.backdrop ?? scene.cameras.main).setBackgroundColor(
        graphics.voidBackgroundColor,
      );
      this.clock = new SimulationClock({
        fixedStepMs: config.world.fixedStepMs,
        maxStepsPerFrame: config.world.maxStepsPerFrame,
        partialStep: 'defer',
      });
      this.fieldRenderer.render(this.world.fields);
      this.particleRenderer.render(this.world.particles, 1);
    } catch (error) {
      this.scope.dispose();
      throw error;
    }
  }

  update(deltaMs: number): SimulationClockFrame {
    if (Number.isFinite(deltaMs) && deltaMs > 0) this.elapsedMs += deltaMs;
    this.cameraController.update(deltaMs);
    this.habitatRenderer.update(this.elapsedMs);
    let fieldsChanged = false;
    const frame = this.clock.advance(deltaMs, () => {
      fieldsChanged = this.world.step() || fieldsChanged;
    });
    if (fieldsChanged) this.fieldRenderer.render(this.world.fields);
    const presentationEvents = this.world.drainTransientPresentationEvents();
    if (presentationEvents.length > 0) this.deathRenderer.push(presentationEvents, this.elapsedMs);
    this.particleRenderer.render(this.world.particles, this.clock.getInterpolationAlpha());
    this.deathRenderer.render(this.elapsedMs);
    return frame;
  }

  refreshViewport(): void {
    this.cameraController.refreshViewport();
  }

  snapshot(): LifeWorldSnapshot {
    return this.world.snapshot();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
