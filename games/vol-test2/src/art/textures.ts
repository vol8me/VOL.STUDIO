import type Phaser from 'phaser';
import { measureSvg, type SvgComplexity } from './svg';
import { ASSETS, type AssetId } from './manifest';

/** Doku adı: aynı varlık farklı rasterleme ölçeğinde ayrı doku olarak yaşar. */
export function textureKey(id: AssetId, pxPerUnit: number): string {
  return `kit-${id}@${pxPerUnit}`;
}

/** Bir varlığın rasterlenmiş doku boyutu (px): oran korunur, `pxPerUnit` tasarım birimi başına piksel. */
export function rasterSize(id: AssetId, pxPerUnit: number): { width: number; height: number } {
  const asset = ASSETS[id];
  return {
    width: Math.max(1, Math.round(asset.width * pxPerUnit)),
    height: Math.max(1, Math.round(asset.height * pxPerUnit)),
  };
}

export interface KitRaster {
  readonly id: AssetId;
  readonly key: string;
  readonly width: number;
  readonly height: number;
  /** Parti başlangıcından bu varlığın bitişine kadar geçen süre; yükleyici paralel çalışır, değerler çakışır. */
  readonly completeMs: number;
  /** Doku önceki koşudan kaldı: rasterleme ölçülmedi, 0 "ücretsiz" demek değildir. */
  readonly cached: boolean;
  readonly complexity: SvgComplexity;
}

export interface KitLoad {
  readonly rasters: readonly KitRaster[];
  /** Eksik dokuların tamamını yükleyen partinin toplam süresi (ms); hepsi önbellekteyse 0. */
  readonly batchMs: number;
  /** Rasterlenen dokuların GPU belleği tahmini (bayt, RGBA). */
  readonly textureBytes: number;
}

/**
 * Varlıkları sahnenin doku yöneticisine rasterler. Süre yük başlamadan ölçülür ve kare ölçümüne karışmaz;
 * karmaşıklık kaynak metinden okunur (`measureSvg`), böylece rapor "ne çizildiğini" de söyler.
 */
export async function loadKit(
  scene: Phaser.Scene,
  ids: readonly AssetId[],
  pxPerUnit: number,
): Promise<KitLoad> {
  const startedAt = performance.now();
  const completedAt = new Map<AssetId, number>();
  const failed: string[] = [];
  const queued = new Set<AssetId>();
  for (const id of ids) {
    const key = textureKey(id, pxPerUnit);
    if (scene.textures.exists(key) || queued.has(id)) continue;
    queued.add(id);
    const { width, height } = rasterSize(id, pxPerUnit);
    scene.load.once(`filecomplete-svg-${key}`, () => completedAt.set(id, performance.now()));
    scene.load.svg(key, ASSETS[id].url, { width, height });
  }
  if (queued.size > 0) {
    await new Promise<void>((resolve) => {
      scene.load.on('loaderror', (file: { key: string }) => failed.push(file.key));
      scene.load.once('complete', () => resolve());
      scene.load.start();
    });
  }
  const batchMs = queued.size > 0 ? performance.now() - startedAt : 0;
  if (failed.length > 0) throw new Error(`SVG yüklenemedi: ${failed.join(', ')}`);

  const rasters: KitRaster[] = [];
  let textureBytes = 0;
  for (const id of new Set(ids)) {
    const asset = ASSETS[id];
    const key = textureKey(id, pxPerUnit);
    const { width, height } = rasterSize(id, pxPerUnit);
    const source = await (await fetch(asset.url)).text();
    textureBytes += width * height * 4;
    rasters.push({
      id,
      key,
      width,
      height,
      completeMs: Math.max(0, (completedAt.get(id) ?? startedAt) - startedAt),
      cached: !queued.has(id),
      complexity: measureSvg(source),
    });
  }
  return { rasters, batchMs, textureBytes };
}

/** Rasterleme sonuçlarını düz olgulara çevirir (`WorkloadInstance.facts`). */
export function kitFacts(
  load: KitLoad,
  pxPerUnit: number,
): Record<string, string | number | boolean> {
  const total = load.rasters.reduce(
    (sum, raster) => ({
      elements: sum.elements + raster.complexity.elements,
      pathCommands: sum.pathCommands + raster.complexity.pathCommands,
      gradients: sum.gradients + raster.complexity.gradients,
    }),
    { elements: 0, pathCommands: 0, gradients: 0 },
  );
  const facts: Record<string, string | number | boolean> = {
    'svg.assets': load.rasters.length,
    'svg.elements': total.elements,
    'svg.pathCommands': total.pathCommands,
    'svg.gradients': total.gradients,
    'svg.pxPerUnit': pxPerUnit,
    'svg.loadMs': Math.round(load.batchMs),
    'svg.textureKB': Math.round(load.textureBytes / 1024),
    'svg.cached': load.rasters.every((raster) => raster.cached),
  };
  for (const raster of load.rasters)
    facts[`svg.completeMs.${raster.id}`] = Math.round(raster.completeMs);
  return facts;
}
