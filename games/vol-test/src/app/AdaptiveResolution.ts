import Phaser from 'phaser';
import { AdaptiveRenderScale, refreshVolViewport } from '@volstudio/core';

/**
 * Uyarlanır çizim çözünürlüğü: sürekli yavaş kareleri CORE `AdaptiveRenderScale` ile `renderScale`i
 * kısarak toparlar. Çarpan `createVolGame`e canlı sağlayıcı olarak verilir; değişince canvas ve
 * kameralar aynı pencerede yeniden kurulur. Pencere boyutu değişince (tam ekran) çarpan 1'e döner ve
 * yeniden ölçülür. Ölçüm oturumlarında (Deck sondası) bağlanmaz: ölçülen çözünürlük sabit kalmalıdır.
 * Duraklatılmış oyun ölçülmez: dünya donmuştur, kare süresi oynanışı temsil etmez ve canvas'ın yeniden
 * kurulması donmuş görüntüyü değiştirirdi.
 */
export class AdaptiveResolution {
  private readonly controller = new AdaptiveRenderScale();

  constructor(private readonly isPaused: () => boolean = () => false) {}

  get scale(): number {
    return this.controller.scale;
  }

  /** Oyunun kare ve pencere olaylarına bağlanır; dönen işlev bırakır. */
  attach(game: Phaser.Game): () => void {
    const onStep = (_time: number, delta: number): void => {
      if (!this.isPaused() && this.controller.sample(delta)) refreshVolViewport(game);
    };
    const onResize = (): void => {
      if (this.controller.reset()) refreshVolViewport(game);
    };
    game.events.on(Phaser.Core.Events.STEP, onStep);
    window.addEventListener('resize', onResize);
    return () => {
      game.events.off(Phaser.Core.Events.STEP, onStep);
      window.removeEventListener('resize', onResize);
    };
  }
}
