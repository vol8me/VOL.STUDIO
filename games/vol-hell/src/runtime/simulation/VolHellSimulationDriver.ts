import type { VolHellSimulation } from './VolHellSimulation';
import type { VolHellRenderSnapshot, VolHellSimulationRenderPort } from './types';

/**
 * Model ilerlemesi ile sunum arasındaki tek yönlü köprü.
 *
 * Driver yalnızca simülasyonu bir frame ilerletir ve kopyalanmış snapshot'ı
 * render portuna verir. Portun Phaser, Canvas veya test double olması modelin
 * umurunda değildir; port snapshot üzerinden kural değiştiremez.
 */
export class VolHellSimulationDriver {
  private active = true;

  constructor(
    private readonly simulation: VolHellSimulation,
    private readonly renderPort: VolHellSimulationRenderPort,
  ) {}

  /** Bir oyun frame'i işler ve render'a yeni snapshot verir. */
  step(deltaMs: number): VolHellRenderSnapshot | null {
    if (!this.active) return null;
    this.simulation.step(deltaMs);
    const snapshot = this.simulation.getRenderSnapshot();
    this.renderPort.render(snapshot);
    return snapshot;
  }

  /** Driver'ı kapatır; kapanıştan sonra render callback'i çağrılmaz. */
  destroy(): void {
    this.active = false;
  }
}
