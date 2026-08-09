import Phaser from 'phaser';
import { TECH } from '../constants';

export type ScaleStrategy = 'fit' | 'envelop' | 'resize';

export interface ViewportConfig {
  /**
   * `strategy: 'resize'` iken opsiyoneldir (verilmezse `window.innerWidth` kullanılır).
   * 'fit'/'envelop' için zorunludur (sabit iç çözünürlük).
   */
  width?: number;
  height?: number;
  strategy?: ScaleStrategy;
  parent?: string | HTMLElement;
  backgroundColor?: string;
  /**
   * Yüksek DPR ekranlarda piksel fill-rate'i sınırlamak için maksimum DPR.
   * Verilmezse `window.devicePixelRatio` olduğu gibi kullanılır.
   */
  maxDpr?: number;
}

export interface ViewportResult {
  parent: string | HTMLElement;
  width: number;
  height: number;
  backgroundColor?: string;
  zoom?: number;
  scale: {
    mode: Phaser.Scale.ScaleModeType;
    autoCenter: Phaser.Scale.CenterType;
  };
}

/**
 * Phaser GameConfig için ölçekleme ayarlarını üretir.
 * - 'fit'/'envelop': sabit iç çözünürlük, canvas CSS ile ekrana sığdırılır (letterbox oluşabilir).
 * - 'resize': letterbox'sız, devicePixelRatio'ya göre keskin render (Phaser'ın RESIZE modu
 *   DPR'yi ele almadığı için `Scale.NONE` + manuel zoom/boyut kullanılır, bkz. phaserjs/phaser#5581).
 */
export class ViewportManager {
  private readonly config: ViewportConfig;

  constructor(config: ViewportConfig) {
    this.config = config;
  }

  getConfig(): ViewportResult {
    const parent = this.config.parent ?? 'game-container';

    if (this.config.strategy === 'resize') {
      const rawDpr = window.devicePixelRatio || TECH.DPR_FALLBACK;
      const dpr = this.config.maxDpr ? Math.min(rawDpr, this.config.maxDpr) : rawDpr;
      const width = this.config.width ?? window.innerWidth;
      const height = this.config.height ?? window.innerHeight;
      return {
        parent,
        width: width * dpr,
        height: height * dpr,
        backgroundColor: this.config.backgroundColor,
        zoom: 1 / dpr,
        scale: {
          mode: Phaser.Scale.NONE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };
    }

    if (this.config.width === undefined || this.config.height === undefined) {
      throw new Error(
        `ViewportManager: 'width'/'height' yalnızca strategy: 'resize' iken opsiyoneldir (mevcut strategy: '${
          this.config.strategy ?? 'fit'
        }').`,
      );
    }

    return {
      parent,
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      scale: {
        mode: this.config.strategy === 'envelop' ? Phaser.Scale.ENVELOP : Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };
  }

  /**
   * Yalnızca strategy: 'resize' oyunlarında çağrılmalıdır. Pencere boyutu değiştikçe
   * canvas ve kamera viewport'larını günceller. Dönen fonksiyon dinleyiciyi kaldırır.
   */
  static attachResize(game: Phaser.Game): () => void {
    const handler = (): void => {
      const dpr = window.devicePixelRatio || TECH.DPR_FALLBACK;
      const width = window.innerWidth * dpr;
      const height = window.innerHeight * dpr;

      game.scale.resize(width, height);

      for (const scene of game.scene.getScenes(true)) {
        scene.cameras.main.setViewport(0, 0, width, height);
      }
    };

    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }
}
