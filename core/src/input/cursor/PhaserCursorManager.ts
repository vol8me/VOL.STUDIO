import type Phaser from 'phaser';
import type { CursorAsset, CursorColorTokens, CursorId, CursorTheme } from './types';
import { CursorRegistry } from './CursorRegistry';
import { convertCommands, drawCommands, parseSvgPath, type DrawCommand } from './svgToGraphics';

/**
 * Phaser sahnesi içinde vektörel cursor çizen yönetici.
 *
 * - GameObjects.Graphics tabanlı, sprite sheet yok.
 * - Her frame aktif pointer'ı takip eder.
 * - `set(id)` ile cursor değişir; `setTheme(theme)` ile tema güncellenir.
 * - `wait` ve `target` cursor'ları otomatik tween'e sahiptir.
 */
export class PhaserCursorManager {
  readonly scene: Phaser.Scene;
  readonly container: Phaser.GameObjects.Container;
  readonly graphics: Phaser.GameObjects.Graphics;

  private readonly registry: CursorRegistry;
  private size = 24;
  private commandsCache = new Map<string, DrawCommand[]>();
  private currentAsset: CursorAsset | null = null;
  private tween: Phaser.Tweens.Tween | null = null;
  private previousCursor: string;
  private colorTokens: {
    outline: number;
    body: number;
    accent: number;
    danger: number;
    disabled: number;
  };

  private readonly onSceneUpdate = (
    sys: Phaser.Scenes.Systems,
    time: number,
    delta: number,
  ): void => {
    this.update(time, delta);
  };

  constructor(scene: Phaser.Scene, theme?: CursorTheme) {
    this.scene = scene;
    this.registry = new CursorRegistry();
    this.colorTokens = toPhaserTokens(theme?.colors ?? defaultColors());
    this.previousCursor = scene.input.manager.defaultCursor;
    scene.input.setDefaultCursor('none');
    if (theme) {
      this.registry.registerTheme(theme);
    }

    this.graphics = scene.add.graphics();
    this.container = scene.add.container(0, 0, [this.graphics]);
    this.container.setDepth(Number.MAX_SAFE_INTEGER);

    scene.events.on('update', this.onSceneUpdate);
  }

  setTheme(theme: CursorTheme): void {
    this.registry.reset();
    this.registry.registerTheme(theme);
    this.colorTokens = toPhaserTokens(theme.colors);
    this.commandsCache.clear();
    if (this.currentAsset) {
      this.set(this.currentAsset.id);
    }
  }

  setSize(size: number): void {
    this.size = Math.max(1, size);
    this.draw();
  }

  set(id: CursorId): void {
    this.currentAsset = this.registry.resolve(id);
    this.draw();
    this.setupTween();
  }

  get current(): CursorAsset | null {
    return this.currentAsset;
  }

  reset(): void {
    this.set('default');
  }

  /** Aktif pointer pozisyonunu takip et. */
  update(_time: number, _delta: number): void {
    const pointer = this.scene.input.activePointer;
    if (pointer) {
      this.container.setPosition(pointer.x, pointer.y);
    }
  }

  /** Mevcut cursor'u tekrar çiz (tema/boyut değişimi sonrası). */
  private draw(): void {
    if (!this.currentAsset) return;

    const asset = this.currentAsset;
    const scale = this.size / asset.viewBox;
    const offsetX = -asset.hotspotX * scale;
    const offsetY = -asset.hotspotY * scale;

    this.graphics.clear();

    for (const l of asset.layers) {
      const color = colorForRole(l.role, this.getColors());
      const width = l.strokeWidth * scale;
      this.graphics.beginPath();

      let commands = this.commandsCache.get(`${asset.id}:${l.d}`);
      if (!commands) {
        commands = convertCommands(parseSvgPath(l.d));
        this.commandsCache.set(`${asset.id}:${l.d}`, commands);
      }
      drawCommands(this.graphics, commands, scale, offsetX, offsetY);

      if (l.fill) {
        this.graphics.fillStyle(color, 1);
        this.graphics.fillPath();
      }

      if (l.stroke) {
        this.graphics.lineStyle(width, color, 1);
        this.graphics.strokePath();
      }
    }
  }

  private getColors(): {
    outline: number;
    body: number;
    accent: number;
    danger: number;
    disabled: number;
  } {
    return this.colorTokens;
  }

  private setupTween(): void {
    this.tween?.stop();
    this.tween?.destroy();
    this.tween = null;

    const asset = this.currentAsset;
    if (!asset?.animation) return;

    const { type, duration } = asset.animation;

    if (type === 'rotate') {
      this.tween = this.scene.tweens.add({
        targets: this.container,
        angle: 360,
        duration,
        repeat: -1,
        ease: 'Linear',
      });
    } else if (type === 'pulse') {
      const scale = asset.animation.scale ?? { from: 1, to: 1.15 };
      this.tween = this.scene.tweens.add({
        targets: this.container,
        scaleX: { from: scale.from, to: scale.to },
        scaleY: { from: scale.from, to: scale.to },
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (type === 'shake') {
      const amount = asset.animation.amount ?? 2;
      this.tween = this.scene.tweens.add({
        targets: this.container,
        x: { from: -amount, to: amount },
        duration: duration / 4,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  destroy(): void {
    this.scene.events.off('update', this.onSceneUpdate);
    this.tween?.stop();
    this.tween?.destroy();
    this.scene.input.setDefaultCursor(this.previousCursor);
    this.container.destroy();
  }
}

/** Hex string'i Phaser'ın beklediği 0xRRGGBB sayısına çevirir. */
function hexToPhaserColor(hex: string): number {
  const value = hex.replace('#', '');
  return Number.parseInt(value, 16);
}

function defaultColors(): CursorColorTokens {
  return {
    outline: '#070a0d',
    body: '#e8eef5',
    accent: '#565dbe',
    danger: '#b94a4a',
    disabled: '#5d6a75',
  };
}

function toPhaserTokens(tokens: CursorColorTokens): {
  outline: number;
  body: number;
  accent: number;
  danger: number;
  disabled: number;
} {
  return {
    outline: hexToPhaserColor(tokens.outline),
    body: hexToPhaserColor(tokens.body),
    accent: hexToPhaserColor(tokens.accent),
    danger: hexToPhaserColor(tokens.danger),
    disabled: hexToPhaserColor(tokens.disabled),
  };
}

function colorForRole(
  role: string,
  tokens: { outline: number; body: number; accent: number; danger: number; disabled: number },
): number {
  if (role === 'outline') return tokens.outline;
  if (role === 'body') return tokens.body;
  if (role === 'accent') return tokens.accent;
  if (role === 'danger') return tokens.danger;
  if (role === 'disabled') return tokens.disabled;
  return tokens.body;
}
