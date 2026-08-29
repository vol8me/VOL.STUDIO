import Phaser from 'phaser';
import { FontManager, type FontFaceSpec } from './systems/FontManager';
import { ViewportManager, type MaxDprSetting, type ScaleStrategy } from './systems/ViewportManager';
import { VOL_FONTS, type VolFontFamily } from './systems/DefaultFonts';
import { TECH } from './constants';
import type { Diagnostics } from './debug/Diagnostics';

export interface VolGameConfig {
  /** Yalnızca strategy: 'resize' iken opsiyoneldir — bkz. ViewportConfig.width. */
  width?: number;
  height?: number;
  parent?: string | HTMLElement;
  backgroundColor?: string;
  strategy?: ScaleStrategy;
  /** Yüksek DPR ekranlarda piksel fill-rate'i sınırlamak için maksimum DPR. */
  maxDpr?: MaxDprSetting;
  scenes: Phaser.Types.Core.GameConfig['scene'];
  physics?: Phaser.Types.Core.GameConfig['physics'];
  input?: Phaser.Types.Core.InputConfig;
  /** Yüklenecek font alt seti. Belirtilmezse tüm VOL fontları yüklenir. */
  fonts?: VolFontFamily[];
  /**
   * Ölçüm örneği. `createVolGame` bunu OLUŞTURMAZ, yalnızca oyunun ömrüne
   * bağlar (oyun destroy olunca `destroy()` çağırır).
   *
   * Tüketici `isDiagnosticsEnabled()` ile karar verip `createDiagnostics(...)` ile
   * kendi örneğini üretir ve buraya geçirir.
   */
  diagnostics?: Diagnostics;
  /**
   * Sahneler init edilmeden (Phaser.Game oluşturulmadan) ÖNCE çalışır; native
   * state/save load için kullanılır (bkz. GDD 17.3). Hook reddedilirse oyun başlatılmaz.
   */
  onBeforeSceneInit?: () => Promise<void>;
}

/**
 * VOL.STUDIO oyunlarını asenkron olarak başlatır. Deterministic boot order (GDD 17.3):
 * fontlar yüklenir, ardından `onBeforeSceneInit` awaitlenir, sonra `Phaser.Game` oluşturulur.
 */
export async function createVolGame(config: VolGameConfig): Promise<Phaser.Game> {
  const selectedFamilies: VolFontFamily[] =
    config.fonts ?? (Object.keys(VOL_FONTS) as VolFontFamily[]);

  const specs: FontFaceSpec[] = [];
  for (const family of selectedFamilies) {
    const spec = VOL_FONTS[family];
    if (!spec) {
      throw new Error(`Geçersiz font ailesi: ${family}`);
    }
    specs.push(spec);
  }

  const fontManager = new FontManager({ fonts: specs, timeoutMs: TECH.FONT_LOAD_TIMEOUT });
  const loaded = await fontManager.load();
  const failed = loaded.filter((f) => f.status === 'error');

  if (failed.length > 0) {
    console.warn(
      `[createVolGame] Fontlar yüklenemedi, sistem fontuna düşülüyor: ${failed
        .map((f) => f.family)
        .join(', ')}`,
    );
  }

  await Promise.race([
    document.fonts.ready,
    new Promise<void>((resolve) => setTimeout(resolve, TECH.FONT_READY_FALLBACK)),
  ]);

  if (config.onBeforeSceneInit) {
    await config.onBeforeSceneInit();
  }

  const viewportManager = new ViewportManager({
    width: config.width,
    height: config.height,
    parent: config.parent,
    backgroundColor: config.backgroundColor,
    strategy: config.strategy,
    maxDpr: config.maxDpr,
  });

  const gameConfig: Phaser.Types.Core.GameConfig = {
    ...viewportManager.getConfig(),
    scene: config.scenes,
    physics: config.physics,
    input: config.input,
    audio: { noAudio: true },
  };

  const game = new Phaser.Game(gameConfig);

  const { diagnostics } = config;
  if (diagnostics) {
    game.events.once(Phaser.Core.Events.DESTROY, () => diagnostics.destroy());
  }

  if (config.strategy === 'resize') {
    const detachResize = viewportManager.attachResize(game);
    game.events.once(Phaser.Core.Events.DESTROY, detachResize);
  }

  return game;
}
