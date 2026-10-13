import type Phaser from 'phaser';
import type { FactoryController } from '@/app/FactoryController';
import { PALETTE, VIEW, type ToolId } from '@/config/game';
import { BELT, ITEM, KIND, UNIT, UNIT_KIND, WORLD } from '@/config/factory';
import type { FactoryState } from '@/sim/state';
import { evictionOrder } from './chunkCache';
import { beltItemPoint, lerp, visibleChunks, type WorldRect } from './geometry';
import { drawChunk } from './raster';

/** Phaser `FilterMode.NEAREST`: Phaser'ı çalışma zamanında içe aktarmadan sabit kullanılır. */
const NEAREST = 1;

const CHUNK_DEPTH = 0;
const DYNAMIC_DEPTH = 1;
const OVERLAY_DEPTH = 2;

/** Eşya karesi ve birim yarıçapı (tile oranı). */
const ITEM_SIZE_PX = 4;
const CRAWLER_RADIUS = 0.28;
const BRUTE_RADIUS = 0.42;
const HEALTH_BAR_HEIGHT_PX = 2;

interface ChunkEntry {
  readonly image: Phaser.GameObjects.Image;
  readonly texture: Phaser.Textures.CanvasTexture;
  readonly key: string;
  /** Son çizilen `chunkVersion`; `-1` hiç çizilmedi ya da durum nesnesi değişti. */
  version: number;
}

/**
 * Dünyanın Phaser karşılığı: görünür chunk'ların durağan dokusu (yalnız sürümü değişince yeniden çizilir),
 * her karede yeniden çizilen dinamik katman (bant eşyaları, birimler, atışlar) ve bindirme katmanı
 * (imleç önizlemesi, bekleyen komut hayaletleri). Oyun durumunu okur, asla yazmaz.
 */
export class WorldView {
  /** İmlecin altındaki tile ve seçili aracın önizlemesi; sahne her karede günceller. */
  hover: { x: number; y: number } | null = null;

  private readonly entries = new Map<number, ChunkEntry>();
  private readonly lastUsed = new Map<number, number>();
  private readonly dynamic: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private frame = 0;
  private lastState: FactoryState | null = null;
  private readonly point = { x: 0, y: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly controller: FactoryController,
    private readonly tilePx: number = VIEW.tilePx,
    private readonly textureLimit: number = VIEW.chunkTextureLimit,
  ) {
    this.dynamic = scene.add.graphics().setDepth(DYNAMIC_DEPTH);
    this.overlay = scene.add.graphics().setDepth(OVERLAY_DEPTH);
  }

  /** Bellekte tutulan chunk dokusu sayısı (test ve ölçüm). */
  get textureCount(): number {
    return this.entries.size;
  }

  update(): void {
    const sim = this.controller.sim;
    this.dynamic.clear();
    this.overlay.clear();
    if (sim === null) return;
    const s = sim.state;
    this.frame++;
    if (s !== this.lastState) {
      // Yeni durum nesnesi (anlık görüntü / yeniden eşitleme): eski dokular geçersiz.
      this.lastState = s;
      for (const entry of this.entries.values()) entry.version = -1;
    }
    const camera = this.scene.cameras.main;
    const view: WorldRect = camera.worldView;
    this.syncChunks(s, view);
    this.drawDynamic(s, view, camera.zoom);
    this.drawOverlay(s);
  }

  private syncChunks(s: FactoryState, view: WorldRect): void {
    const chunkPx = WORLD.chunk * this.tilePx;
    const range = visibleChunks(view, chunkPx, s.chunksX, s.chunksY);
    let budget = VIEW.chunkRedrawBudget;
    for (let cy = range.y0; cy <= range.y1; cy++) {
      for (let cx = range.x0; cx <= range.x1; cx++) {
        const chunk = cy * s.chunksX + cx;
        this.lastUsed.set(chunk, this.frame);
        let entry = this.entries.get(chunk);
        if (entry === undefined) {
          entry = this.createEntry(chunk, cx * chunkPx, cy * chunkPx, chunkPx);
          this.entries.set(chunk, entry);
        }
        if (entry.version === s.chunkVersion[chunk] || budget <= 0) continue;
        budget--;
        const context = entry.texture.context;
        context.clearRect(0, 0, chunkPx, chunkPx);
        drawChunk(context, s, chunk, this.tilePx);
        entry.texture.refresh();
        entry.version = s.chunkVersion[chunk];
      }
    }
    const inView = (chunk: number): boolean => {
      const x = chunk % s.chunksX;
      const y = Math.floor(chunk / s.chunksX);
      return x >= range.x0 && x <= range.x1 && y >= range.y0 && y <= range.y1;
    };
    for (const chunk of evictionOrder(this.lastUsed, this.textureLimit, inView)) {
      const entry = this.entries.get(chunk);
      if (entry) this.disposeEntry(entry);
      this.entries.delete(chunk);
      this.lastUsed.delete(chunk);
    }
  }

  private createEntry(chunk: number, x: number, y: number, size: number): ChunkEntry {
    const key = `factory-chunk-${chunk}`;
    const texture = this.scene.textures.createCanvas(key, size, size)!;
    texture.setFilter(NEAREST);
    const image = this.scene.add.image(x, y, key).setOrigin(0, 0).setDepth(CHUNK_DEPTH);
    return { image, texture, key, version: -1 };
  }

  private disposeEntry(entry: ChunkEntry): void {
    entry.image.destroy();
    this.scene.textures.remove(entry.key);
  }

  private drawDynamic(s: FactoryState, view: WorldRect, zoom: number): void {
    const g = this.dynamic;
    const tilePx = this.tilePx;
    const x0 = view.x / tilePx - 1;
    const y0 = view.y / tilePx - 1;
    const x1 = (view.x + view.width) / tilePx + 1;
    const y1 = (view.y + view.height) / tilePx + 1;

    if (zoom >= VIEW.detailMinZoom && !s.listsDirty) this.drawItems(s, x0, y0, x1, y1);

    const fraction = this.controller.pacer.fraction;
    const { previousX, previousY, previousGen } = this.controller;
    for (const unit of s.units) {
      if (!unit.alive) continue;
      const interpolated = previousGen[unit.slot] === s.unitGen[unit.slot] + 1;
      const x = interpolated ? lerp(previousX[unit.slot], unit.x, fraction) : unit.x;
      const y = interpolated ? lerp(previousY[unit.slot], unit.y, fraction) : unit.y;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const brute = unit.kind === UNIT_KIND.brute;
      g.fillStyle(brute ? PALETTE.brute : PALETTE.crawler, 1);
      g.fillCircle(x * tilePx, y * tilePx, (brute ? BRUTE_RADIUS : CRAWLER_RADIUS) * tilePx);
      const maxHp = brute ? UNIT.brute.hp : UNIT.crawler.hp;
      if (unit.hp < maxHp) {
        const width = tilePx * 0.8;
        const left = x * tilePx - width / 2;
        const top = y * tilePx - (brute ? BRUTE_RADIUS : CRAWLER_RADIUS) * tilePx - 4;
        g.fillStyle(PALETTE.healthBack, 1);
        g.fillRect(left, top, width, HEALTH_BAR_HEIGHT_PX);
        g.fillStyle(PALETTE.health, 1);
        g.fillRect(left, top, width * Math.max(0, unit.hp / maxHp), HEALTH_BAR_HEIGHT_PX);
      }
    }

    const shots = this.controller.activeShots();
    if (shots.length > 0) {
      g.lineStyle(2, PALETTE.shot, 1);
      for (const shot of shots) {
        g.lineBetween(
          shot.fromX * tilePx,
          shot.fromY * tilePx,
          shot.targetX * tilePx,
          shot.targetY * tilePx,
        );
      }
    }
  }

  private drawItems(s: FactoryState, x0: number, y0: number, x1: number, y1: number): void {
    const g = this.dynamic;
    const tilePx = this.tilePx;
    const half = ITEM_SIZE_PX / 2;
    let current = -1;
    for (let entry = 0; entry < s.beltListLength; entry++) {
      const tile = s.beltList[entry];
      const count = s.beltCount[tile];
      if (count === 0) continue;
      const ty = Math.floor(tile / s.width);
      const tx = tile - ty * s.width;
      if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
      const base = tile * BELT.slots;
      for (let slot = 0; slot < count; slot++) {
        const item = s.beltItem[base + slot];
        if (item !== current) {
          current = item;
          g.fillStyle(item === ITEM.plate ? PALETTE.itemPlate : PALETTE.itemOre, 1);
        }
        beltItemPoint(tx, ty, s.rot[tile], s.beltPos[base + slot], tilePx, this.point);
        g.fillRect(this.point.x - half, this.point.y - half, ITEM_SIZE_PX, ITEM_SIZE_PX);
      }
    }
  }

  private drawOverlay(s: FactoryState): void {
    const g = this.overlay;
    const tilePx = this.tilePx;
    const tool = this.controller.tool;
    if (this.hover !== null && tool !== null) {
      const valid = s.inBounds(this.hover.x, this.hover.y);
      if (valid) this.drawPreview(g, tool, this.hover.x, this.hover.y, this.controller.rot, 0.35);
    }
    for (const ghost of this.controller.activeGhosts()) {
      g.lineStyle(2, PALETTE.ghostOk, 0.9);
      g.strokeRect(ghost.x * tilePx + 1, ghost.y * tilePx + 1, tilePx - 2, tilePx - 2);
      if (ghost.kind === KIND.conveyor) this.drawDirection(g, ghost.x, ghost.y, ghost.rot, 0.9);
    }
  }

  private drawPreview(
    g: Phaser.GameObjects.Graphics,
    tool: ToolId,
    x: number,
    y: number,
    rot: number,
    alpha: number,
  ): void {
    const tilePx = this.tilePx;
    const color = tool === 'remove' ? PALETTE.ghostBad : PALETTE.ghostOk;
    g.fillStyle(color, alpha);
    g.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
    if (tool === 'conveyor') this.drawDirection(g, x, y, rot, 0.9);
  }

  private drawDirection(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    rot: number,
    alpha: number,
  ): void {
    const tilePx = this.tilePx;
    const cx = (x + 0.5) * tilePx;
    const cy = (y + 0.5) * tilePx;
    const dx = [1, 0, -1, 0][rot & 3];
    const dy = [0, 1, 0, -1][rot & 3];
    const size = tilePx * 0.3;
    g.fillStyle(PALETTE.ghostOk, alpha);
    g.fillTriangle(
      cx + dx * size,
      cy + dy * size,
      cx - dx * size - dy * size,
      cy - dy * size + dx * size,
      cx - dx * size + dy * size,
      cy - dy * size - dx * size,
    );
  }

  destroy(): void {
    for (const entry of this.entries.values()) this.disposeEntry(entry);
    this.entries.clear();
    this.lastUsed.clear();
    this.dynamic.destroy();
    this.overlay.destroy();
  }
}
