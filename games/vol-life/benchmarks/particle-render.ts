import Phaser from 'phaser';
import { particleConfig } from '../src/config/particles';
import { ParticleRenderer } from '../src/runtime/render/ParticleRenderer';
import { initializeParticles } from '../src/runtime/sim/ParticlePhysics';
import { ParticleStore } from '../src/runtime/sim/ParticleStore';
import { createSimRandom } from '../src/runtime/sim/rng';

interface RenderResult {
  readonly particles: number;
  readonly cpuP50Ms: number;
  readonly cpuP95Ms: number;
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
}

declare global {
  interface Window {
    __VOL_LIFE_RENDER_RESULT__?: RenderResult;
  }
}

const count = Math.max(1, Number(new URLSearchParams(location.search).get('particles')) || 100);

class RenderBenchmarkScene extends Phaser.Scene {
  private readonly cpuSamples: number[] = [];
  private readonly frameSamples: number[] = [];
  private particles!: ParticleStore;
  private particleRenderer!: ParticleRenderer;
  private frames = 0;

  create(): void {
    this.particles = new ParticleStore(count);
    initializeParticles(this.particles, createSimRandom(0x10fe1), { ...particleConfig, count });
    this.particleRenderer = new ParticleRenderer(
      this,
      particleConfig.worldSizeUnits,
      particleConfig.radiusUnits,
    );
    this.particleRenderer.updateCamera({
      centerX: particleConfig.worldSizeUnits / 2,
      centerY: particleConfig.worldSizeUnits / 2,
      zoom: 1,
      minZoom: 0.5,
      overview: false,
    });
    this.cameras.main.centerOn(
      particleConfig.worldSizeUnits / 2,
      particleConfig.worldSizeUnits / 2,
    );
  }

  update(_time: number, delta: number): void {
    const startedAt = performance.now();
    this.particleRenderer.render(this.particles);
    const cpuMs = performance.now() - startedAt;
    if (this.frames >= 60) {
      this.cpuSamples.push(cpuMs);
      this.frameSamples.push(delta);
    }
    this.frames++;
    if (this.cpuSamples.length === 180) {
      window.__VOL_LIFE_RENDER_RESULT__ = {
        particles: count,
        cpuP50Ms: percentile(this.cpuSamples, 0.5),
        cpuP95Ms: percentile(this.cpuSamples, 0.95),
        frameP50Ms: percentile(this.frameSamples, 0.5),
        frameP95Ms: percentile(this.frameSamples, 0.95),
      };
    }
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'benchmark',
  width: 800,
  height: 600,
  backgroundColor: '#05070c',
  scene: [RenderBenchmarkScene],
  banner: false,
});

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}
