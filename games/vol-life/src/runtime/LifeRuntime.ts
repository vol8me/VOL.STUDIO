import type Phaser from 'phaser';
import {
  DisposableScope,
  SimulationClock,
  WorldCameraController,
  type SimulationClockFrame,
} from '@volstudio/core';
import { worldConfig, type WorldConfig } from '@/config/world';
import { lifeGraphicsConfig } from '@/config/graphics';
import { particleConfig } from '@/config/particles';
import { FieldRenderer } from '@/runtime/render/FieldRenderer';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { WorldBoundaryRenderer } from '@/runtime/render/WorldBoundaryRenderer';
import { LifeWorld, type LifeWorldSnapshot } from '@/runtime/sim/LifeWorld';

interface RuntimeWorld {
  readonly fields: LifeWorld['fields'];
  readonly particles: LifeWorld['particles'];
  step(): boolean;
  snapshot(): LifeWorldSnapshot;
  restore(snapshot: LifeWorldSnapshot): void;
}

interface RuntimeRenderer {
  render(fields: LifeWorld['fields']): void;
  destroy(): void;
}

interface RuntimeDestroyable {
  destroy(): void;
}

interface RuntimeParticleRenderer {
  render(particles: LifeWorld['particles'], interpolationAlpha: number): void;
  destroy(): void;
}

interface RuntimeCamera {
  update(deltaMs: number): void;
  refreshViewport(): void;
  destroy(): void;
}

export interface LifeRuntimeDependencies {
  readonly config?: WorldConfig;
  readonly world?: RuntimeWorld;
  readonly renderer?: RuntimeRenderer;
  readonly boundaryRenderer?: RuntimeDestroyable;
  readonly particleRenderer?: RuntimeParticleRenderer;
  readonly cameraController?: RuntimeCamera;
  readonly initialSnapshot?: LifeWorldSnapshot | null;
}

export class LifeRuntime {
  private readonly scope = new DisposableScope();
  private readonly world: RuntimeWorld;
  private readonly renderer: RuntimeRenderer;
  private readonly particleRenderer: RuntimeParticleRenderer;
  private readonly boundaryRenderer: RuntimeDestroyable;
  private readonly cameraController: RuntimeCamera;
  private readonly clock: SimulationClock;

  constructor(scene: Phaser.Scene, dependencies: LifeRuntimeDependencies = {}) {
    const config = dependencies.config ?? worldConfig;
    this.world = dependencies.world ?? new LifeWorld(config);
    if (dependencies.initialSnapshot) this.world.restore(dependencies.initialSnapshot);
    this.renderer =
      dependencies.renderer ?? new FieldRenderer(scene, this.world.fields, config.boundsUnits);
    this.boundaryRenderer =
      dependencies.boundaryRenderer ??
      new WorldBoundaryRenderer(scene, config.boundsUnits, {
        thicknessUnits: config.boundaryThicknessUnits,
        color: lifeGraphicsConfig.boundaryColor,
      });
    this.particleRenderer =
      dependencies.particleRenderer ?? new ParticleRenderer(scene, particleConfig.radiusUnits);
    this.cameraController =
      dependencies.cameraController ??
      new WorldCameraController(scene.game.canvas, scene.cameras.main, {
        bounds: config.boundsUnits,
        maxZoomFactor: lifeGraphicsConfig.cameraMaxZoomFactor,
      });
    this.clock = new SimulationClock({
      fixedStepMs: config.fixedStepMs,
      maxStepsPerFrame: config.maxStepsPerFrame,
      partialStep: 'defer',
    });
    this.scope.addDestroyables(
      this.renderer,
      this.boundaryRenderer,
      this.particleRenderer,
      this.cameraController,
    );
    this.renderer.render(this.world.fields);
    this.particleRenderer.render(this.world.particles, 1);
  }

  update(deltaMs: number): SimulationClockFrame {
    this.cameraController.update(deltaMs);
    let fieldsChanged = false;
    const frame = this.clock.advance(deltaMs, () => {
      fieldsChanged = this.world.step() || fieldsChanged;
    });
    if (fieldsChanged) this.renderer.render(this.world.fields);
    this.particleRenderer.render(this.world.particles, this.clock.getInterpolationAlpha());
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
