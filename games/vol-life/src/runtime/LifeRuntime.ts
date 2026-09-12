import type Phaser from 'phaser';
import {
  DisposableScope,
  SimulationClock,
  WorldCameraController,
  type SimulationClockFrame,
} from '@volstudio/core';
import { worldConfig, type WorldConfig } from '@/config/world';
import { FieldRenderer } from '@/runtime/render/FieldRenderer';
import { LifeWorld } from '@/runtime/sim/LifeWorld';

interface RuntimeWorld {
  readonly fields: LifeWorld['fields'];
  step(): boolean;
}

interface RuntimeRenderer {
  render(fields: LifeWorld['fields']): void;
  destroy(): void;
}

interface RuntimeCamera {
  refreshViewport(): void;
  destroy(): void;
}

export interface LifeRuntimeDependencies {
  readonly config?: WorldConfig;
  readonly world?: RuntimeWorld;
  readonly renderer?: RuntimeRenderer;
  readonly cameraController?: RuntimeCamera;
}

export class LifeRuntime {
  private readonly scope = new DisposableScope();
  private readonly world: RuntimeWorld;
  private readonly renderer: RuntimeRenderer;
  private readonly cameraController: RuntimeCamera;
  private readonly clock: SimulationClock;

  constructor(scene: Phaser.Scene, dependencies: LifeRuntimeDependencies = {}) {
    const config = dependencies.config ?? worldConfig;
    this.world = dependencies.world ?? new LifeWorld(config);
    this.renderer =
      dependencies.renderer ?? new FieldRenderer(scene, this.world.fields, config.sizeUnits);
    this.cameraController =
      dependencies.cameraController ??
      new WorldCameraController(scene.game.canvas, scene.cameras.main, {
        worldSize: config.sizeUnits,
      });
    this.clock = new SimulationClock({
      fixedStepMs: config.fixedStepMs,
      maxStepsPerFrame: config.maxStepsPerFrame,
      partialStep: 'defer',
    });
    this.scope.addDestroyables(this.renderer, this.cameraController);
    this.renderer.render(this.world.fields);
  }

  update(deltaMs: number): SimulationClockFrame {
    let fieldsChanged = false;
    const frame = this.clock.advance(deltaMs, () => {
      fieldsChanged = this.world.step() || fieldsChanged;
    });
    if (fieldsChanged) this.renderer.render(this.world.fields);
    return frame;
  }

  refreshViewport(): void {
    this.cameraController.refreshViewport();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
