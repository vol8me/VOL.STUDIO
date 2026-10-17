import type Phaser from 'phaser';
import { clamp01 } from '@volstudio/core/math/interpolation';
import { FEEL } from '@/config/feel';
import { FX } from '@/config/fx';
import { PALETTE } from '@/config/palette';
import { WORLD } from '@/config/world';
import type { World } from '@/sim/world/World';

const GRID_WIDTH = 1;
/** Her bu kadar ızgara hücresinde bir ana çizgi. */
const BORDER_WIDTH = 4;
const FLASH = FX.wallFlash;
/** Sekme dönüşünde tek karede yankının tamamı sönmesin diye süre tavanı. */
const MAX_FLASH_DELTA_MS = 50;
/** Örtü altındaki ızgara kesimlerinin örnekleme adımı (dünya birimi) ve görünür alana eklenen pay. */
const COVER_STEP = 32;
const COVER_MARGIN = 256;
/** Izgara bu kadar kaymadan ya da bu süre dolmadan yeniden kurulmaz. */
const COVER_REFIT_MOVE = 160;
const COVER_REFIT_MS = 1500;

/** Dünya birimindeki dikdörtgen. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Flash {
  x: number;
  y: number;
  vertical: boolean;
  strength: number;
  remainingMs: number;
}

/**
 * Boş dünyanın zemini: ızgara ve sınır ayrı katmanlarda bir kez çizilir;
 * ızgara kapatılsa da sınır görünür kalır. Duvar çarpması
 * sınırın o bölümünü şiddetle orantılı parlatır; yalnız yankı katmanı her
 * karede yeniden çizilir.
 */
export class ArenaView {
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly flashLayer: Phaser.GameObjects.Graphics;
  private flash: Flash | null = null;
  private fitted: { x: number; y: number; width: number; height: number; at: number } | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.ground = scene.add.graphics().setDepth(-110);
    this.grid = scene.add.graphics().setDepth(-100);
    this.border = scene.add.graphics().setDepth(-95);
    this.flashLayer = scene.add.graphics().setDepth(-90);
    this.draw();
  }

  get gridVisible(): boolean {
    return this.grid.visible;
  }

  setGridVisible(visible: boolean): void {
    this.grid.setVisible(visible);
  }

  /**
   * Izgarayı çayır örtüsünün altında gizler: görünen alandaki çizgiler `covered` doğru olan kesimlerden
   * kesilir. Dünya boyunca çizilen ilk ızgara yerine yalnız görünen (payla genişletilmiş) çizgiler kurulur
   * ve kamera `COVER_REFIT_MOVE` kayınca ya da `COVER_REFIT_MS` geçince yenilenir; örtü dakikalar içinde
   * değiştiği için bu sıklık yeter.
   */
  fitGrid(view: ViewRect, covered: (x: number, y: number) => boolean, nowMs: number): void {
    if (!this.grid.visible) return;
    const last = this.fitted;
    if (
      last &&
      nowMs - last.at < COVER_REFIT_MS &&
      Math.abs(view.x - last.x) < COVER_REFIT_MOVE &&
      Math.abs(view.y - last.y) < COVER_REFIT_MOVE &&
      view.width === last.width &&
      view.height === last.height
    )
      return;
    this.fitted = { x: view.x, y: view.y, width: view.width, height: view.height, at: nowMs };
    this.grid.clear();
    const { width, height } = this.world;
    this.drawGrid(
      Math.max(0, view.x - COVER_MARGIN),
      Math.min(width, view.x + view.width + COVER_MARGIN),
      Math.max(0, view.y - COVER_MARGIN),
      Math.min(height, view.y + view.height + COVER_MARGIN),
      covered,
    );
  }

  /** Duvar çarpmasını görünür kılar; süren yankı yenisiyle değişir. */
  strike(x: number, y: number, normalX: number, speed: number): void {
    this.flash = {
      x,
      y,
      vertical: Math.abs(normalX) > 0.5,
      strength: clamp01(speed / FEEL.wall.fullSpeed),
      remainingMs: FLASH.durationMs,
    };
  }

  update(deltaMs: number): void {
    if (!this.flash) return;
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? Math.min(deltaMs, MAX_FLASH_DELTA_MS) : 0;
    this.flash.remainingMs -= dt;
    if (this.flash.remainingMs <= 0) {
      this.flash = null;
      this.flashLayer.clear();
      return;
    }
    const flash = this.flash;
    const life = clamp01(flash.remainingMs / FLASH.durationMs);
    const half = (FLASH.span * (0.4 + 0.6 * flash.strength)) / 2;
    this.flashLayer.clear();
    this.flashLayer.lineStyle(
      FLASH.width * (0.5 + 0.5 * flash.strength),
      PALETTE.impact,
      life * (0.35 + 0.65 * flash.strength),
    );
    const { width, height } = this.world;
    if (flash.vertical) {
      const x = flash.x < width / 2 ? 0 : width;
      this.flashLayer.lineBetween(
        x,
        Math.max(0, flash.y - half),
        x,
        Math.min(height, flash.y + half),
      );
    } else {
      const y = flash.y < height / 2 ? 0 : height;
      this.flashLayer.lineBetween(
        Math.max(0, flash.x - half),
        y,
        Math.min(width, flash.x + half),
        y,
      );
    }
  }

  destroy(): void {
    this.ground.destroy();
    this.grid.destroy();
    this.border.destroy();
    this.flashLayer.destroy();
  }

  private draw(): void {
    const { width, height } = this.world;
    this.ground.fillStyle(PALETTE.sand, 1);
    this.ground.fillRect(0, 0, width, height);
    this.drawGrid(0, width, 0, height);
    this.border.lineStyle(BORDER_WIDTH, PALETTE.border, 1);
    this.border.strokeRect(0, 0, width, height);
  }

  /** Verilen dikdörtgendeki ızgara çizgileri; `covered` verilirse örtülü kesimler atlanır. */
  private drawGrid(
    left: number,
    right: number,
    top: number,
    bottom: number,
    covered?: (x: number, y: number) => boolean,
  ): void {
    const { width, height, gridStep } = this.world;
    for (const major of [false, true]) {
      const style = major ? PALETTE.gridMajor : PALETTE.gridMinor;
      this.grid.lineStyle(GRID_WIDTH * (major ? 1.5 : 1), style.color, style.alpha);
      this.grid.beginPath();
      for (let index = 1; index * gridStep < width; index++) {
        const x = index * gridStep;
        if ((index % WORLD.gridMajorEvery === 0) !== major || x < left || x > right) continue;
        this.stroke(
          top,
          bottom,
          (along) => covered?.(x, along) ?? false,
          (a, b) => {
            this.grid.moveTo(x, a);
            this.grid.lineTo(x, b);
          },
        );
      }
      for (let index = 1; index * gridStep < height; index++) {
        const y = index * gridStep;
        if ((index % WORLD.gridMajorEvery === 0) !== major || y < top || y > bottom) continue;
        this.stroke(
          left,
          right,
          (along) => covered?.(along, y) ?? false,
          (a, b) => {
            this.grid.moveTo(a, y);
            this.grid.lineTo(b, y);
          },
        );
      }
      this.grid.strokePath();
    }
  }

  /** Bir çizginin `from`–`to` aralığını örtülü olmayan kesimlere bölerek `line`a verir. */
  private stroke(
    from: number,
    to: number,
    covered: (along: number) => boolean,
    line: (a: number, b: number) => void,
  ): void {
    let start: number | null = null;
    for (let along = from; along < to; along += COVER_STEP) {
      const next = Math.min(to, along + COVER_STEP);
      const hidden = covered((along + next) / 2);
      if (!hidden && start === null) start = along;
      if (hidden && start !== null) {
        line(start, along);
        start = null;
      }
    }
    if (start !== null) line(start, to);
  }
}
