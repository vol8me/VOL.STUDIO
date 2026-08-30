import Phaser from 'phaser';
import { TECH } from '../constants';

export type ScaleStrategy = 'fit' | 'envelop' | 'resize';

/**
 * Canlı okunabilen ölçek ayarı. Fonksiyon verilirse HER ölçümde yeniden
 * sorulur; kalite ayarı çalışma anında değiştiğinde viewport onu takip eder.
 */
export type ViewportScaleSetting = number | (() => number | undefined);

/** Geriye dönük ad — `maxDpr` alanının tipi. */
export type MaxDprSetting = ViewportScaleSetting;

/**
 * `renderScale` için güvenli aralık. 0 veya negatif değer canvas'ı yok eder;
 * 1'in üstü ise "kalite ayarı" olmaktan çıkıp süper-örnekleme olur ve DPR
 * kelepçesinin anlamını bozar.
 */
const MIN_RENDER_SCALE = 0.25;
const MAX_RENDER_SCALE = 1;

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
  maxDpr?: ViewportScaleSetting;
  /**
   * Rasterleme çözünürlüğü çarpanı (`0.25`–`1`). DPR'den BAĞIMSIZDIR.
   *
   * `0.75` verildiğinde GPU %56 kadar piksel işler ama oyun dünyası ve
   * ekrandaki boyut AYNI kalır — fark yalnızca netliktir. Bunun mümkün olması
   * için kamera, rasterleme çarpanı kadar yakınlaştırılır (bkz.
   * `applyToScene`); dünya birimleri böylece CSS pikseline sabitlenir.
   *
   * Yalnızca `strategy: 'resize'` için anlamlıdır; 'fit'/'envelop' zaten sabit
   * iç çözünürlükle çalışır.
   */
  renderScale?: ViewportScaleSetting;
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
      const quality = this.resolveRenderQuality();
      const { width, height } = this.getWorldSize();
      return {
        parent,
        width: Math.max(1, width * quality),
        height: Math.max(1, height * quality),
        backgroundColor: this.config.backgroundColor,
        zoom: 1 / quality,
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
   * Dünyanın CSS piksel cinsinden boyutu — rasterleme çözünürlüğünden BAĞIMSIZ.
   *
   * Oyun mantığı (saha sınırı, hız, yarıçap) bu birimde yaşar. Eskiden dünya
   * doğrudan CİHAZ pikseliydi: 2x bir ekranda arena iki kat geniş oluyor,
   * dünya birimi/saniye cinsinden sabit olan oyuncu hızı ekranda yarı hıza
   * düşüyordu. Yani DPR ve kalite ayarı sessizce OYNANIŞI değiştiriyordu.
   * Dünya artık her cihazda aynı.
   */
  getWorldSize(): { width: number; height: number } {
    if (this.config.strategy === 'resize') {
      return {
        width: Math.max(1, this.config.width ?? window.innerWidth),
        height: Math.max(1, this.config.height ?? window.innerHeight),
      };
    }
    return {
      width: Math.max(1, this.config.width ?? 1),
      height: Math.max(1, this.config.height ?? 1),
    };
  }

  /**
   * Dünya birimi başına rasterlenen cihaz pikseli.
   *
   * `min(devicePixelRatio, maxDpr) * renderScale`. Canvas'ın backing store'u
   * bu çarpanla büyür, kamera aynı çarpanla yakınlaştırılır — net sonuç:
   * daha az piksel, AYNI dünya, AYNI ekran boyutu.
   */
  resolveRenderQuality(): number {
    const clampedDpr = this.resolveDpr();
    const scale = resolveSetting(this.config.renderScale);
    const renderScale =
      scale !== undefined && Number.isFinite(scale)
        ? Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale))
        : 1;
    return Math.max(MIN_RENDER_SCALE, clampedDpr * renderScale);
  }

  /**
   * Sahnenin kamerasını geçerli rasterleme çarpanına göre kurar.
   *
   * Kamera yakınlaştırması çarpana EŞİTLENİR ve dünya merkezine odaklanır:
   * görünen dünya alanı `backing / quality` = CSS piksel boyutu olur, yani
   * çözünürlük değişse de oyuncunun gördüğü alan sabit kalır. Sahne
   * kurulumunda ve her yeniden boyutlandırmada çağrılmalıdır.
   */
  applyToScene(scene: Phaser.Scene): void {
    if (this.config.strategy !== 'resize') return;
    const quality = this.resolveRenderQuality();
    const world = this.getWorldSize();
    const camera = scene.cameras?.main;
    if (!camera) return;

    camera.setViewport(0, 0, world.width * quality, world.height * quality);
    camera.setZoom(quality);
    camera.centerOn(world.width / 2, world.height / 2);
  }

  /** getConfig() ve attachResize() aynı DPR'yi görmeli — `zoom` bu değere göre hesaplanır. */
  private resolveDpr(): number {
    const rawDpr =
      typeof window !== 'undefined' &&
      Number.isFinite(window.devicePixelRatio) &&
      window.devicePixelRatio > 0
        ? window.devicePixelRatio
        : TECH.DPR_FALLBACK;

    const configuredMaxDpr = resolveSetting(this.config.maxDpr);
    const maxDpr =
      configuredMaxDpr !== undefined && Number.isFinite(configuredMaxDpr) && configuredMaxDpr > 0
        ? configuredMaxDpr
        : undefined;
    return maxDpr ? Math.min(rawDpr, maxDpr) : rawDpr;
  }

  /**
   * Yalnızca strategy: 'resize' oyunlarında çağrılmalıdır. Pencere boyutu değiştikçe
   * canvas ve kamera viewport'larını günceller. Dönen fonksiyon dinleyiciyi kaldırır.
   *
   * Örnek metodudur (statik değil): `maxDpr` kelepçesi getConfig()'in kurduğu
   * `zoom` ile aynı olmak zorunda. Ham devicePixelRatio kullanılırsa canvas'ın
   * CSS boyutu `rawDpr / maxDpr` oranında pencereyi taşar.
   *
   * `setZoom()` `resize()`'dan ÖNCE çağrılmalı — Phaser `resize(w, h)` canvas'ın
   * CSS boyutunu `w × zoom` olarak hesaplar, o anki `zoom` değerini kullanarak.
   * Bu çağrı olmadan `zoom` Game kurulduğu andaki DPR'de SONSUZA DEK sabit
   * kalıyordu: tarayıcı yakınlaştırması `devicePixelRatio`'yu değiştirir (pencere
   * `resize` event'i de tetikler) ama `zoom` güncellenmediği için canvas'ın CSS
   * boyutu artık pencereyle uyuşmuyordu — ekranda büyüyüp küçülen, pencereyi
   * takip etmeyen bir kutu olarak görünüyordu.
   */
  attachResize(game: Phaser.Game): () => void {
    const handler = (): void => {
      const quality = this.resolveRenderQuality();
      const world = this.getWorldSize();
      const width = Math.max(1, world.width * quality);
      const height = Math.max(1, world.height * quality);

      game.scale.setZoom(1 / quality);
      game.scale.resize(width, height);

      for (const scene of game.scene.getScenes(true)) {
        this.applyToScene(scene);
      }
    };

    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }
}

/** Sabit ya da fonksiyon olarak verilmiş ölçek ayarını okur. */
function resolveSetting(setting: ViewportScaleSetting | undefined): number | undefined {
  return typeof setting === 'function' ? setting() : setting;
}
