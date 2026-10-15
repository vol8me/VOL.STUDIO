import type Phaser from 'phaser';
import { ONLINE_VIEW } from '@/config/onlineView';

/** Bir aracın etiketinin o karedeki durumu; poz çizilen (ara değerli) konumdur. */
export interface TagFrame {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly color: number;
  /** 0..1 arası can oranı. */
  readonly health: number;
  readonly alive: boolean;
  /** Yeniden doğma koruması sürüyor: bar çerçevesi parlar. */
  readonly protected: boolean;
  /** Bot mu: adın yanına küçük sarı rozet noktası çizilir. */
  readonly bot: boolean;
}

const TAG = ONLINE_VIEW.tag;
const FRAME_ALPHA = 0.55;
/** Bundan küçük can düşüşü isabet sayılmaz (yuvarlama gürültüsü). */
const DROP_EPSILON = 0.002;

/** Aracın çubuğunun isabet geri bildirimi durumu. */
interface BarState {
  /** Çubuğun gerisinde kalan, kaybedilen canı gösteren oran. */
  lag: number;
  last: number;
  holdUntilMs: number;
  flashUntilMs: number;
  atMs: number;
}

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * Araçların üstünde ad ve can çubuğu çizer. Çevrimiçi dünyada kimin kim olduğu (kendimiz, takım,
 * rakip) araç gövdesinden okunmaz; etiket rengi bunu söyler. Yazılar araç başına bir `Text`,
 * çubuklar tek `Graphics` üzerindedir: kare başına yeniden kurulan şey yalnız çubuk çizgileridir.
 */
export class NameTags {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<number, Phaser.GameObjects.Text>();
  private readonly seen = new Set<number>();
  private readonly bars = new Map<number, BarState>();

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(TAG.depth);
  }

  /**
   * Bu karenin etiketlerini çizer; çerçevede olmayan araçların yazısı sökülür.
   * @param nowMs sürekli saat: isabet izi ve parlaması bununla ilerler.
   */
  update(frames: Iterable<TagFrame>, nowMs = 0): void {
    const graphics = this.graphics;
    graphics.clear();
    this.seen.clear();
    for (const frame of frames) {
      this.seen.add(frame.id);
      const label = this.label(frame);
      const alpha = frame.alive ? 1 : TAG.deadAlpha;
      const top = frame.y + TAG.offsetY;
      label.setPosition(frame.x, top - TAG.barHeight - 2).setAlpha(alpha);
      const left = frame.x - TAG.barWidth / 2;
      graphics.fillStyle(0x14100c, 0.6 * alpha);
      graphics.fillRect(left - 1, top - 1, TAG.barWidth + 2, TAG.barHeight + 2);
      if (frame.alive) {
        const health = Math.min(1, Math.max(0, frame.health));
        const bar = this.track(frame.id, health, nowMs);
        if (bar.lag > health) {
          graphics.fillStyle(TAG.trailColor, 0.9);
          graphics.fillRect(
            left + TAG.barWidth * health,
            top,
            TAG.barWidth * (bar.lag - health),
            TAG.barHeight,
          );
        }
        graphics.fillStyle(nowMs < bar.flashUntilMs ? 0xffffff : frame.color, 1);
        graphics.fillRect(left, top, TAG.barWidth * health, TAG.barHeight);
      } else {
        this.bars.delete(frame.id);
      }
      if (frame.bot) {
        const badgeX = frame.x - label.width / 2 - TAG.badgeGap;
        const badgeY = top - TAG.barHeight - 2 - label.height / 2;
        graphics.fillStyle(0x14100c, 0.8 * alpha);
        graphics.fillCircle(badgeX, badgeY, TAG.badgeRadius + 1);
        graphics.fillStyle(ONLINE_VIEW.colors.bot, alpha);
        graphics.fillCircle(badgeX, badgeY, TAG.badgeRadius);
      }
      if (frame.protected) {
        graphics.lineStyle(1, 0xffffff, FRAME_ALPHA);
        graphics.strokeRect(left - 1.5, top - 1.5, TAG.barWidth + 3, TAG.barHeight + 3);
      }
    }
    for (const [id, label] of this.labels) {
      if (this.seen.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
      this.bars.delete(id);
    }
  }

  get count(): number {
    return this.labels.size;
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.labels.clear();
    this.bars.clear();
    this.graphics.destroy();
  }

  /** Canı izler: düşüş izi ve parlamayı başlatır, iyileşmede sıfırlar, bekleme sonrası eritir. */
  private track(id: number, health: number, nowMs: number): BarState {
    let bar = this.bars.get(id);
    if (!bar) {
      bar = { lag: health, last: health, holdUntilMs: 0, flashUntilMs: 0, atMs: nowMs };
      this.bars.set(id, bar);
      return bar;
    }
    if (health < bar.last - DROP_EPSILON) {
      bar.lag = Math.max(bar.lag, bar.last);
      bar.holdUntilMs = nowMs + TAG.trailHoldMs;
      bar.flashUntilMs = nowMs + TAG.flashMs;
    }
    if (health >= bar.lag) bar.lag = health;
    else if (nowMs >= bar.holdUntilMs) {
      const drain = (TAG.trailDrainPerSec * Math.max(0, nowMs - bar.atMs)) / 1000;
      bar.lag = Math.max(health, bar.lag - drain);
    }
    bar.last = health;
    bar.atMs = nowMs;
    return bar;
  }

  private label(frame: TagFrame): Phaser.GameObjects.Text {
    let label = this.labels.get(frame.id);
    if (!label) {
      label = this.scene.add
        .text(0, 0, frame.name, {
          fontFamily: 'Jura, sans-serif',
          fontSize: `${TAG.fontSize}px`,
          fontStyle: 'bold',
          color: css(frame.color),
          stroke: '#14100c',
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1)
        .setResolution(TAG.resolution)
        .setDepth(TAG.depth);
      this.labels.set(frame.id, label);
      return label;
    }
    if (label.text !== frame.name) label.setText(frame.name);
    const color = css(frame.color);
    if (label.style.color !== color) label.setColor(color);
    return label;
  }
}
