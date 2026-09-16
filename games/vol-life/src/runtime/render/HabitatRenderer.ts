import type { Rect } from '@volstudio/core/math/geometry';
import Phaser from 'phaser';
import {
  rasterizeHabitatGlowRows,
  type HabitatGlowStyle,
} from '@/runtime/render/HabitatGlowRasterizer';
import type { WorldDomain } from '@/runtime/sim/WorldDomain';

export interface HabitatStyle extends HabitatGlowStyle {
  /** Işıma dokusunun kenar çözünürlüğü; ölçümle seçilir (DESIGN §6). */
  readonly resolution: number;
  /** Kare başına rasterleme bütçesi (ms); doku satır satır dolar. */
  readonly rasterBudgetMs: number;
  /** Void'in kıyıda içeri akan nabzı; yalnız ALFAYI oynatır, fizik SDF'sine dokunmaz. */
  readonly pulsePeriodMs: number;
  readonly pulseAlphaMin: number;
  readonly pulseAlphaMax: number;
}

const GLOW_TEXTURE_KEY = 'vol-life:habitat-glow';

/**
 * Habitat/Void sunumu (DESIGN.md §6). Kıyı ve ışıması doğrudan SDF
 * MESAFESİNDEN rasterize edilir; kontur noktalarını normal yönünde öteleyip
 * `strokePoints` ile bağlayan yol kaldırıldı — yüksek eğrilikte ötelenen
 * noktalar çaprazlanıyor ve düz kiriş Void'den habitatın içine geçen bir çizgi
 * bırakıyordu.
 *
 * Raster KURULUMDA koşmaz: 512² tek seferde 723 ms ölçüldü ve DESIGN §18 yükleme
 * sırasında ana iş parçacığını kilitlemeyi yasaklıyor. Doku kare bütçesiyle
 * satır satır dolar; tamamlandığında sonuç tek seferlik rasterle bayt bayt
 * aynıdır. Nabız yalnız alfayı değiştirir.
 */
export class HabitatRenderer {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly imageData: ImageData;
  private readonly rect: Rect;
  private rasterRow = 0;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly domain: WorldDomain,
    rect: Readonly<Rect>,
    private readonly style: HabitatStyle,
  ) {
    this.rect = { ...rect };
    const texture = scene.textures.createCanvas(
      GLOW_TEXTURE_KEY,
      style.resolution,
      style.resolution,
    );
    if (!texture) throw new Error('Habitat ışıma dokusu oluşturulamadı.');
    this.texture = texture;
    this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.imageData = texture.context.createImageData(style.resolution, style.resolution);
    this.image = scene.add
      .image(this.rect.x, this.rect.y, GLOW_TEXTURE_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(this.rect.width, this.rect.height)
      .setDepth(-990);
    this.image.setAlpha(style.pulseAlphaMin);
  }

  /** Doku tamamen rasterize edildi mi; dolana kadar üst satırlar saydamdır. */
  get rasterComplete(): boolean {
    return this.rasterRow >= this.style.resolution;
  }

  update(nowMs: number): void {
    if (this.destroyed) return;
    this.advanceRaster();
    if (!Number.isFinite(nowMs)) return;
    const phase = 0.5 + 0.5 * Math.sin((nowMs / this.style.pulsePeriodMs) * Math.PI * 2);
    const alpha =
      this.style.pulseAlphaMin + (this.style.pulseAlphaMax - this.style.pulseAlphaMin) * phase;
    this.image.setAlpha(alpha);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.image.destroy();
    this.scene.textures.remove(GLOW_TEXTURE_KEY);
  }

  /** Bütçe bir satırın ortasında dolmaz: taşma en fazla bir satırdır. */
  private advanceRaster(): void {
    if (this.rasterComplete) return;
    const deadline = performance.now() + this.style.rasterBudgetMs;
    do {
      rasterizeHabitatGlowRows(
        this.domain,
        this.rect,
        this.style.resolution,
        this.style,
        this.imageData.data,
        this.rasterRow,
        1,
      );
      this.rasterRow++;
    } while (!this.rasterComplete && performance.now() < deadline);
    this.texture.putData(this.imageData, 0, 0);
    this.texture.refresh();
  }
}
