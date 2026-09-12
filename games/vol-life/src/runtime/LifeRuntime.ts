import type Phaser from 'phaser';
import {
  DisposableScope,
  SimulationClock,
  WorldCameraController,
  type WorldCameraState,
  type SimulationClockFrame,
} from '@volstudio/core';
import { worldConfig, type WorldConfig } from '@/config/world';
import { particleConfig } from '@/config/particles';
import { FieldRenderer } from '@/runtime/render/FieldRenderer';
import { ParticleRenderer } from '@/runtime/render/ParticleRenderer';
import { LifeWorld } from '@/runtime/sim/LifeWorld';

interface RuntimeWorld {
  readonly fields: LifeWorld['fields'];
  readonly particles: LifeWorld['particles'];
  step(): boolean;
}

interface RuntimeRenderer {
  render(fields: LifeWorld['fields']): void;
  updateCamera?(state: WorldCameraState): void;
  destroy(): void;
}

interface RuntimeParticleRenderer {
  render(particles: LifeWorld['particles']): void;
  updateCamera?(state: WorldCameraState): void;
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
  readonly particleRenderer?: RuntimeParticleRenderer;
  readonly cameraController?: RuntimeCamera;
}

export class LifeRuntime {
  private readonly scope = new DisposableScope();
  private readonly world: RuntimeWorld;
  private readonly renderer: RuntimeRenderer;
  private readonly particleRenderer: RuntimeParticleRenderer;
  private readonly cameraController: RuntimeCamera;
  private readonly clock: SimulationClock;

  constructor(scene: Phaser.Scene, dependencies: LifeRuntimeDependencies = {}) {
    const config = dependencies.config ?? worldConfig;
    this.world = dependencies.world ?? new LifeWorld(config);
    this.renderer =
      dependencies.renderer ?? new FieldRenderer(scene, this.world.fields, config.sizeUnits);
    this.particleRenderer =
      dependencies.particleRenderer ??
      new ParticleRenderer(scene, config.sizeUnits, particleConfig.radiusUnits);
    this.cameraController =
      dependencies.cameraController ??
      new WorldCameraController(scene.game.canvas, scene.cameras.main, {
        worldSize: config.sizeUnits,
        onChange: (state) => {
          this.renderer.updateCamera?.(state);
          this.particleRenderer.updateCamera?.(state);
        },
      });
    this.clock = new SimulationClock({
      fixedStepMs: config.fixedStepMs,
      maxStepsPerFrame: config.maxStepsPerFrame,
      partialStep: 'defer',
    });
    this.scope.addDestroyables(this.renderer, this.particleRenderer, this.cameraController);
    this.renderer.render(this.world.fields);
    this.particleRenderer.render(this.world.particles);
  }

  update(deltaMs: number): SimulationClockFrame {
    this.cameraController.update(deltaMs);
    let fieldsChanged = false;
    const frame = this.clock.advance(deltaMs, () => {
      fieldsChanged = this.world.step() || fieldsChanged;
    });
    if (fieldsChanged) this.renderer.render(this.world.fields);
    if (frame.fixedSteps > 0) this.particleRenderer.render(this.world.particles);
    return frame;
  }

  refreshViewport(): void {
    this.cameraController.refreshViewport();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
