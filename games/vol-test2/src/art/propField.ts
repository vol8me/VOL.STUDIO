import { animationValue, DEG } from './anim';
import { ASSETS, TILE_UNITS } from './manifest';
import { textureKey } from './textures';
import { BLEND, type PartFactory, type PartPort, type TilePort } from './parts';
import { PROPS, type LayerDef, type PropKind } from './props';

export interface PropFieldOptions {
  /** Ekranda tasarım birimi başına piksel (1 karo = 64 birim). */
  readonly zoom: number;
  /** Dokuların rasterlendiği çözünürlük (tasarım birimi başına piksel). */
  readonly pxPerUnit: number;
  /** Tasarım biriminde alanın sol-üst köşesi; prop konumları buna göredir. */
  readonly originX?: number;
  readonly originY?: number;
}

interface LayerState {
  readonly def: LayerDef;
  readonly part: PartPort;
  readonly parent: number;
  /** Kökte: durağan dünya konumu (tasarım birimi). Çocukta kullanılmaz. */
  readonly baseX: number;
  readonly baseY: number;
  readonly propRotation: number;
  readonly phase: number;
  readonly isTile: boolean;
  /** Bu karede hesaplanan dünya dönüşü: çocuklar bunu okur. */
  wx: number;
  wy: number;
  wrot: number;
}

interface DynamicLayer {
  readonly layers: LayerState[];
  readonly index: number;
}

export interface PropFieldCounts {
  readonly props: number;
  readonly parts: number;
  readonly dynamicLayers: number;
  readonly tileSprites: number;
  readonly byKind: Readonly<Record<string, number>>;
}

/**
 * Yapı alanı: karo yerleşimi verilen yapıları sahne nesnelerine çevirir ve her karede yalnız
 * hareketli katmanları günceller. Durağan katmanların dünya dönüşümü yerleştirmede bir kez hesaplanır,
 * kare başına maliyetleri sıfırdır. Phaser'ı tanımaz (`PartFactory`).
 */
export class PropField {
  private readonly dynamic: DynamicLayer[] = [];
  private readonly parts: PartPort[] = [];
  private readonly byKind: Record<string, number> = {};
  private props = 0;
  private tileSprites = 0;
  private readonly rasterScale: number;

  constructor(
    private readonly factory: PartFactory,
    private readonly options: PropFieldOptions,
  ) {
    this.rasterScale = options.zoom / options.pxPerUnit;
  }

  /**
   * Bir yapıyı (`col`,`row`) karosuna yerleştirir. `quarterTurns` yapıyı merkezi çevresinde 90°'nin katı
   * döndürür; `phase` saniye cinsinden animasyon kaymasıdır.
   */
  add(kind: PropKind, col: number, row: number, quarterTurns = 0, phase = 0): void {
    const def = PROPS[kind];
    const [tilesW, tilesH] = def.tiles;
    const originX = this.options.originX ?? 0;
    const originY = this.options.originY ?? 0;
    const left = originX + col * TILE_UNITS;
    const top = originY + row * TILE_UNITS;
    const centerX = left + (tilesW * TILE_UNITS) / 2;
    const centerY = top + (tilesH * TILE_UNITS) / 2;
    const propRotation = (quarterTurns % 4) * (Math.PI / 2);
    const cos = Math.cos(propRotation);
    const sin = Math.sin(propRotation);

    const layers: LayerState[] = [];
    const indexOf = new Map<string, number>();
    def.layers.forEach((layerDef, index) => {
      indexOf.set(layerDef.id, index);
      const parent = layerDef.parent === undefined ? -1 : (indexOf.get(layerDef.parent) ?? -1);
      const relX = left + layerDef.at[0] - centerX;
      const relY = top + layerDef.at[1] - centerY;
      const asset = ASSETS[layerDef.asset];
      const isTile = layerDef.scroll !== undefined;
      const key = textureKey(layerDef.asset, this.options.pxPerUnit);
      let part: PartPort;
      if (isTile) {
        const tile: TilePort = this.factory.tile(
          key,
          asset.width * this.options.zoom,
          asset.height * this.options.zoom,
        );
        tile.tileScaleX = this.rasterScale;
        tile.tileScaleY = this.rasterScale;
        part = tile;
        this.tileSprites++;
      } else {
        part = this.factory.image(key);
        part.scaleX = this.rasterScale;
        part.scaleY = this.rasterScale;
      }
      const pivot = layerDef.pivot ?? [0, 0];
      part.setOrigin(pivot[0] / asset.width, pivot[1] / asset.height);
      part.setDepth(index);
      if (layerDef.blend === 'add') part.setBlendMode(BLEND.add);
      this.parts.push(part);
      layers.push({
        def: layerDef,
        part,
        parent,
        baseX: centerX + relX * cos - relY * sin,
        baseY: centerY + relX * sin + relY * cos,
        propRotation,
        phase,
        isTile,
        wx: 0,
        wy: 0,
        wrot: propRotation,
      });
    });

    layers.forEach((layer, index) => {
      const hasOwn =
        layer.def.rotate !== undefined ||
        layer.def.alpha !== undefined ||
        layer.def.slide !== undefined ||
        layer.def.scroll !== undefined;
      const parentDynamic = layer.parent >= 0 && this.isDynamic(layers, layer.parent);
      if (hasOwn || parentDynamic) this.dynamic.push({ layers, index });
      // Durağan katman ya da animasyonun ilk karesi: bir kez yerleştirilir.
      this.place(layers, index, 0);
    });
    this.props++;
    this.byKind[kind] = (this.byKind[kind] ?? 0) + 1;
  }

  private isDynamic(layers: readonly LayerState[], index: number): boolean {
    const layer = layers[index];
    const own =
      layer.def.rotate !== undefined ||
      layer.def.alpha !== undefined ||
      layer.def.slide !== undefined ||
      layer.def.scroll !== undefined;
    return own || (layer.parent >= 0 && this.isDynamic(layers, layer.parent));
  }

  /** Hareketli katmanları `timeSeconds` anına getirir. */
  update(timeSeconds: number): void {
    for (const entry of this.dynamic) this.place(entry.layers, entry.index, timeSeconds);
  }

  private place(layers: LayerState[], index: number, t: number): void {
    const layer = layers[index];
    const def = layer.def;
    const parent = layer.parent >= 0 ? layers[layer.parent] : null;
    let rotation = parent === null ? layer.propRotation : parent.wrot;
    if (def.rotate !== undefined) rotation += animationValue(def.rotate, t, layer.phase) * DEG;
    let x: number;
    let y: number;
    if (parent === null) {
      x = layer.baseX;
      y = layer.baseY;
    } else {
      const cos = Math.cos(parent.wrot);
      const sin = Math.sin(parent.wrot);
      x = parent.wx + def.at[0] * cos - def.at[1] * sin;
      y = parent.wy + def.at[0] * sin + def.at[1] * cos;
    }
    if (def.slide !== undefined) {
      const offset = animationValue(def.slide, t, layer.phase);
      x += Math.cos(rotation) * offset;
      y += Math.sin(rotation) * offset;
    }
    layer.wx = x;
    layer.wy = y;
    layer.wrot = rotation;
    const part = layer.part;
    const zoom = this.options.zoom;
    part.x = x * zoom;
    part.y = y * zoom;
    part.rotation = rotation;
    if (def.alpha !== undefined) part.alpha = animationValue(def.alpha, t, layer.phase);
    if (layer.isTile && def.scroll !== undefined) {
      // Doku birimi piksel: yönü ekseni boyunca +x'e kayar (içerik sola kaydığı için eksi).
      (part as TilePort).tilePositionX =
        -animationValue(def.scroll, t, layer.phase) * this.options.pxPerUnit;
    }
  }

  counts(): PropFieldCounts {
    return {
      props: this.props,
      parts: this.parts.length,
      dynamicLayers: this.dynamic.length,
      tileSprites: this.tileSprites,
      byKind: { ...this.byKind },
    };
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
    this.dynamic.length = 0;
    this.props = 0;
    this.tileSprites = 0;
  }
}
