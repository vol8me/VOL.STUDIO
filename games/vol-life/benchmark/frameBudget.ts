import Phaser from 'phaser';
import { VOL_COLORS, createVolGame } from '@volstudio/core';
import { lifeGraphicsConfig } from '@/config/graphics';
import { substrateConfig } from '@/config/substrate';
import { LifeRuntime } from '@/runtime/LifeRuntime';
import { resolveCameraDomain } from '@/runtime/render/cameraDomain';
import { LifeWorld } from '@/runtime/sim/LifeWorld';
import { createExplicitWorldMetadata } from '@/runtime/sim/WorldMetadata';

/*
 * D4 ölçüm sayfası. Kanca YALNIZ buradadır: uygulama paketi bu dosyayı
 * import etmez, bu yüzden ölçüm kodu üretim bundle'ına girmez.
 *
 * Ölçülen üç şey: gerçek WebGL'de kare süresi dağılımı, simülasyonun kare
 * içindeki payı ve görünür alandaki aktif madde payı (D2'nin sayısal kontrolü).
 */
interface BenchState {
  readonly frames: number[];
  simMsPerFrame: number;
  ready: boolean;
  camera: { centerX: number; centerY: number; zoom: number } | null;
  /** AÇILIŞ anındaki pay; D2'nin iddiası budur. */
  openingMatterShare: number;
  /** Açılışta maddenin gerçek yayılımı (dünya birimi) ve görünür pencere. */
  matterExtent: { width: number; height: number; centerX: number; centerY: number } | null;
  viewport: { worldWidth: number; worldHeight: number } | null;
  /** Çözücünün verdiği odak ile kameranın oturduğu yer AYRI kaydedilir. */
  entryTarget: { x: number; y: number } | null;
  /** Odağın SINIRA kıstırılmış hâli; kamera bunun üstüne oturmalıdır. */
  expectedCenter: { x: number; y: number } | null;
  cameraSize: { width: number; height: number } | null;
  /** Son örnek; madde zamanla dağılır ve kamera takip etmez (takip D2'de yok). */
  visibleMatterShare: number;
  activeCount: number;
}

const bench: BenchState = {
  frames: [],
  simMsPerFrame: 0,
  ready: false,
  camera: null,
  openingMatterShare: 0,
  matterExtent: null,
  viewport: null,
  entryTarget: null,
  expectedCenter: null,
  cameraSize: null,
  visibleMatterShare: 0,
  activeCount: 0,
};
(globalThis as unknown as { __volLifeBench: BenchState }).__volLifeBench = bench;

class BenchScene extends Phaser.Scene {
  private runtime!: LifeRuntime;
  private lastFrameMs = 0;
  private openingSampled = false;
  private pendingBounds: { x: number; y: number; width: number; height: number } | null = null;

  create(): void {
    this.runtime = new LifeRuntime(this, {});
    this.scale.on('resize', () => this.runtime.refreshViewport());
    this.lastFrameMs = performance.now();
    bench.entryTarget = null;
    bench.cameraSize = { width: this.cameras.main.width, height: this.cameras.main.height };
    /*
     * Beklenen merkez, odağın KAMERA SINIRINA kıstırılmış hâlidir. Görünür
     * pencere dünyadan büyükse (dar ve uzun ekranlarda olur) kamera odağa
     * oturamaz ve sınırın ortasına kıstırılır; iddia bunu hesaba katmalı.
     */
    const bounds = resolveCameraDomain(
      this.runtime.world.domain.bbox,
      substrateConfig.habitat.cameraVoidMarginRatio,
    );
    this.pendingBounds = bounds;
    bench.ready = true;
  }

  update(): void {
    /*
     * Açılış örneği, pencerenin GERÇEKTEN dolduğu ilk karede alınır. Phaser'ın
     * döngüsünde `update` `preRender`dan önce koşar; `create()` ya da ilk
     * `update` anında `worldView` sıfırdır ve ölçülen pay her zaman %0 çıkardı.
     */
    if (!this.openingSampled && this.cameras.main.worldView.width > 0) {
      this.sampleWorld();
      bench.openingMatterShare = bench.visibleMatterShare;
      this.openingSampled = true;
    }
    const now = performance.now();
    const deltaMs = now - this.lastFrameMs;
    this.lastFrameMs = now;
    this.runtime.update(deltaMs);
    bench.frames.push(performance.now() - now);
    if (bench.frames.length % 60 === 0) this.sampleWorld();
  }

  /** Görünür alandaki aktif madde payı. */
  private sampleWorld(): void {
    const camera = this.cameras.main;
    const world = this.runtime.world;
    /*
     * Görünür pencere Phaser'ın KENDİ `worldView`'ından okunur. Elle
     * `scrollX + genişlik/(2×zoom)` hesaplamak yanlış merkez veriyordu: Phaser'da
     * görünür alanın merkezi `scrollX + genişlik/2`dir, zoom'a bölünmez. O hata
     * kamerayı 339 birim kaymış gösteriyor ve görünür madde payını %8'e
     * düşürüyordu — kod değil ölçüm yanlıştı.
     */
    const view = camera.worldView;
    const halfWidth = view.width / 2;
    const halfHeight = view.height / 2;
    const centerX = view.centerX;
    const centerY = view.centerY;
    let visible = 0;
    let active = 0;
    for (let slot = 0; slot < world.particles.capacity; slot++) {
      if (world.particles.active[slot] === 0) continue;
      active++;
      if (
        Math.abs(world.particles.x[slot] - centerX) <= halfWidth &&
        Math.abs(world.particles.y[slot] - centerY) <= halfHeight
      ) {
        visible++;
      }
    }
    bench.camera = { centerX, centerY, zoom: camera.zoom };
    bench.activeCount = active;
    bench.visibleMatterShare = active > 0 ? visible / active : 0;
    bench.viewport = { worldWidth: halfWidth * 2, worldHeight: halfHeight * 2 };
    bench.matterExtent = measureExtent(world);
  }
}

/** Kamera kıstırmasının aynısı: görünür alan sınırın dışına taşmaz. */
function clampCenterAxis(value: number, start: number, size: number, half: number): number {
  if (size <= half * 2) return start + size / 2;
  return Math.min(start + size - half, Math.max(start + half, value));
}

/** Maddenin gerçek yayılımı; kamera penceresiyle karşılaştırılır. */
function measureExtent(world: LifeRuntime['world']): {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let slot = 0; slot < world.particles.capacity; slot++) {
    if (world.particles.active[slot] === 0) continue;
    minX = Math.min(minX, world.particles.x[slot]);
    maxX = Math.max(maxX, world.particles.x[slot]);
    minY = Math.min(minY, world.particles.y[slot]);
    maxY = Math.max(maxY, world.particles.y[slot]);
  }
  if (!Number.isFinite(minX)) return { width: 0, height: 0, centerX: 0, centerY: 0 };
  return {
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Simülasyonun kare içindeki payı AYRI ölçülür: aynı sayfada, aynı motorda saf
 * `world.step()` zamanlanır. Render'ı sim'den ayırmak için runtime'a sayaç
 * gömmek, ölçüm kancasını üretim koduna taşırdı.
 */
function measureSimCost(): number {
  const world = new LifeWorld(substrateConfig, createExplicitWorldMetadata(1));
  for (let warm = 0; warm < 60; warm++) world.step();
  const started = performance.now();
  const ticks = 600;
  for (let tick = 0; tick < ticks; tick++) world.step();
  return (performance.now() - started) / ticks;
}

/*
 * Oyun UYGULAMANIN yoluyla kurulur (`createVolGame`, `strategy: 'resize'`).
 * Sabit 1280×720'lik bir Phaser oyunu, mobil viewport'ta bile 16:9 pencere
 * ölçtürüyordu ve ölçüm kamerayı değil ölçüm aracını gösteriyordu.
 */
await createVolGame({
  backgroundColor: VOL_COLORS.uiBg,
  parent: 'game-container',
  strategy: 'resize',
  renderScale: lifeGraphicsConfig.renderScale,
  renderer: lifeGraphicsConfig.renderer,
  scenes: [new BenchScene()],
});

bench.simMsPerFrame = measureSimCost();
