import Phaser from 'phaser';
import { AdaptiveRenderScale, refreshVolViewport } from '@volstudio/core';
import { RESOLUTION_AUTO, type RenderScaleChoice } from '@/config/resolution';

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
  /** Oyuncunun seçtiği sabit ölçek; `null` uyarlanır ölçektir. */
  private fixed: number | null = null;

  constructor(private readonly isPaused: () => boolean = () => false) {}

  get scale(): number {
    return this.fixed ?? this.controller.scale;
  }

  /**
   * Oyuncunun seçimini uygular: sayı sabit ölçektir ve uyarlanır kısmayı durdurur, `auto` uyarlanıra
   * 1'den yeniden başlar. Ölçek değiştiyse `true` döner; canvas'ı yeniden kurmak çağıranın (`attach` ile
   * bağlanan oyun) işidir: `apply` bunu yapar.
   */
  choose(choice: RenderScaleChoice): boolean {
    const before = this.scale;
    this.fixed = choice === RESOLUTION_AUTO ? null : choice;
    this.controller.reset();
    return this.scale !== before;
  }

  /** Seçimi uygular ve ölçek değiştiyse canvas ile kameraları aynı pencerede yeniden kurar. */
  apply(game: Phaser.Game, choice: RenderScaleChoice): void {
    if (this.choose(choice)) refreshVolViewport(game);
  }

  /** Oyunun kare ve pencere olaylarına bağlanır; dönen işlev bırakır. */
  attach(game: Phaser.Game): () => void {
    const onStep = (_time: number, delta: number): void => {
      if (this.fixed === null && !this.isPaused() && this.controller.sample(delta))
        refreshVolViewport(game);
    };
    const onResize = (): void => {
      if (this.fixed === null && this.controller.reset()) refreshVolViewport(game);
    };
    game.events.on(Phaser.Core.Events.STEP, onStep);
    window.addEventListener('resize', onResize);
    return () => {
      game.events.off(Phaser.Core.Events.STEP, onStep);
      window.removeEventListener('resize', onResize);
    };
  }
}
