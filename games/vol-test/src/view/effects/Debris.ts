import type Phaser from 'phaser';
import { DEBRIS } from '@/config/debris';
import type { ChunkArt } from '../debrisArt';

/** Bir parçanın fırlatma ayarı: dünya birimi, rad ve ms. */
export interface ChunkLaunch {
  readonly art: ChunkArt;
  readonly x: number;
  readonly y: number;
  /** Yatay fırlatma yönü (rad), yatay hız, dikey hız ve dönüş hızı (rad/s). */
  readonly angle: number;
  readonly speed: number;
  readonly lift: number;
  readonly spin: number;
  /** Sanatın ölçeğine çarpan. */
  readonly scale: number;
  readonly lifeMs: number;
  /** Başlangıç yüksekliği: ölüm patlamasında yüksek, isabet kıymığında gövde hizası. */
  readonly height: number;
  /** Başlangıçta kor gibi parlar ve soğur (patlamadan çıkan parça). */
  readonly hot: boolean;
}

interface Chunk {
  readonly image: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Image;
  active: boolean;
  settled: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotation: number;
  spin: number;
  scale: number;
  ageMs: number;
  lifeMs: number;
  hot: boolean;
  tint: number | null;
}

const MAX_STEP_MS = 50;

function mix(from: number, to: number, t: number): number {
  const channel = (shift: number): number =>
    Math.round(((from >> shift) & 0xff) * (1 - t) + ((to >> shift) & 0xff) * t);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * Enkaz fiziği ve çizimi. Her parça yerde (x, y) ve havada yükseklikte (z) ilerler: yerçekimi, hava
 * sürtünmesi, sekme (hız kaybıyla), duvar sekmesi; durunca yuvarlanma sönümü. Perspektif yükseklikle
 * büyür, gölge ışığın tersine yükseklikle kayar. Havuzludur: görüntü çiftleri (parça + gölge) bir kez
 * yaratılır, dolu havuzda en eski parça yeniden kullanılır. Sunum zamanıyla ilerler: dondurulmuş
 * (`deltaMs` = 0) sahnede hiçbir şey kıpırdamaz.
 */
export class Debris {
  private readonly chunks: Chunk[] = [];
  private capacity: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly bounds: { readonly width: number; readonly height: number },
    capacity: number = DEBRIS.capacity,
  ) {
    this.capacity = Math.max(1, Math.round(capacity));
  }

  /** Yaşayan parça sayısı (sınama ve ölçüm). */
  get count(): number {
    let count = 0;
    for (const chunk of this.chunks) if (chunk.active) count++;
    return count;
  }

  /** Kalite çarpanı (0–1): havuz tavanını ölçekler; fazla parçalar anında kalkar. */
  setScale(scale: number): void {
    this.capacity = Math.max(1, Math.round(DEBRIS.capacity * scale));
    for (const chunk of this.chunks.splice(this.capacity)) {
      chunk.image.destroy();
      chunk.shadow.destroy();
    }
  }

  spawn(launch: ChunkLaunch): void {
    const chunk = this.take();
    const { art } = launch;
    chunk.active = true;
    chunk.settled = false;
    chunk.x = launch.x;
    chunk.y = launch.y;
    chunk.z = launch.height;
    chunk.vx = Math.cos(launch.angle) * launch.speed;
    chunk.vy = Math.sin(launch.angle) * launch.speed;
    chunk.vz = launch.lift;
    chunk.rotation = launch.angle;
    chunk.spin = launch.spin;
    chunk.scale = art.scale * launch.scale;
    chunk.ageMs = 0;
    chunk.lifeMs = launch.lifeMs;
    chunk.hot = launch.hot;
    chunk.tint = art.tint;
    for (const image of [chunk.image, chunk.shadow]) {
      image.setTexture(art.texture, art.frame).setOrigin(art.originX, art.originY).setVisible(true);
    }
    chunk.shadow.setTint(0x000000);
    if (!launch.hot) {
      if (art.tint !== null) chunk.image.setTint(art.tint);
      else chunk.image.clearTint();
    }
    this.place(chunk);
  }

  update(deltaMs: number): void {
    if (deltaMs <= 0) return;
    const dt = Math.min(deltaMs, MAX_STEP_MS) / 1000;
    for (const chunk of this.chunks) {
      if (!chunk.active) continue;
      chunk.ageMs += deltaMs;
      if (chunk.ageMs >= chunk.lifeMs) {
        this.release(chunk);
        continue;
      }
      this.step(chunk, dt);
      this.place(chunk);
    }
  }

  clear(): void {
    for (const chunk of this.chunks) this.release(chunk);
  }

  destroy(): void {
    for (const chunk of this.chunks) {
      chunk.image.destroy();
      chunk.shadow.destroy();
    }
    this.chunks.length = 0;
  }

  private step(chunk: Chunk, dt: number): void {
    if (!chunk.settled) {
      const drag = Math.exp(-DEBRIS.airDrag * dt);
      chunk.vx *= drag;
      chunk.vy *= drag;
      chunk.vz -= DEBRIS.gravity * dt;
      chunk.z += chunk.vz * dt;
      if (chunk.z <= 0) {
        chunk.z = 0;
        if (-chunk.vz < DEBRIS.settleSpeed) {
          chunk.settled = true;
          chunk.vz = 0;
        } else {
          chunk.vz = -chunk.vz * DEBRIS.restitution;
          chunk.vx *= DEBRIS.bounceFriction;
          chunk.vy *= DEBRIS.bounceFriction;
          chunk.spin *= DEBRIS.bounceFriction;
        }
      }
    } else {
      const roll = Math.exp(-DEBRIS.rollDrag * dt);
      chunk.vx *= roll;
      chunk.vy *= roll;
      chunk.spin *= roll;
    }
    chunk.x += chunk.vx * dt;
    chunk.y += chunk.vy * dt;
    chunk.rotation += chunk.spin * dt;
    const margin = DEBRIS.edgeMargin;
    if (chunk.x < margin || chunk.x > this.bounds.width - margin) {
      chunk.x = Math.min(this.bounds.width - margin, Math.max(margin, chunk.x));
      chunk.vx = -chunk.vx * DEBRIS.restitution;
    }
    if (chunk.y < margin || chunk.y > this.bounds.height - margin) {
      chunk.y = Math.min(this.bounds.height - margin, Math.max(margin, chunk.y));
      chunk.vy = -chunk.vy * DEBRIS.restitution;
    }
  }

  private place(chunk: Chunk): void {
    const fade = Math.min(1, (chunk.lifeMs - chunk.ageMs) / DEBRIS.fadeMs);
    const scale = chunk.scale * (1 + chunk.z * DEBRIS.perspective);
    chunk.image
      .setPosition(chunk.x, chunk.y)
      .setRotation(chunk.rotation)
      .setScale(scale)
      .setAlpha(fade)
      .setDepth(chunk.z > DEBRIS.airHeight ? DEBRIS.depth.air : DEBRIS.depth.ground);
    const shadowFade = fade * DEBRIS.shadowAlpha * (1 - Math.min(0.55, chunk.z / 220));
    chunk.shadow
      .setPosition(chunk.x + DEBRIS.light.x * chunk.z + 1, chunk.y + DEBRIS.light.y * chunk.z + 1.5)
      .setRotation(chunk.rotation)
      .setScale(chunk.scale)
      .setAlpha(shadowFade)
      .setDepth(DEBRIS.depth.ground - 0.5);
    if (chunk.hot) {
      const heat = Math.max(0, 1 - chunk.ageMs / DEBRIS.hotMs);
      if (heat > 0) chunk.image.setTint(mix(chunk.tint ?? 0xffffff, DEBRIS.hotTint, heat));
      else {
        chunk.hot = false;
        if (chunk.tint !== null) chunk.image.setTint(chunk.tint);
        else chunk.image.clearTint();
      }
    }
  }

  private take(): Chunk {
    const free = this.chunks.find((chunk) => !chunk.active);
    if (free) return free;
    if (this.chunks.length < this.capacity) {
      const chunk: Chunk = {
        image: this.scene.add.image(0, 0, '__DEFAULT').setVisible(false),
        shadow: this.scene.add.image(0, 0, '__DEFAULT').setVisible(false),
        active: false,
        settled: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotation: 0,
        spin: 0,
        scale: 1,
        ageMs: 0,
        lifeMs: 0,
        hot: false,
        tint: null,
      };
      this.chunks.push(chunk);
      return chunk;
    }
    // Havuz doldu: en yaşlı parça yeni parçaya verilir.
    let oldest = this.chunks[0];
    for (const chunk of this.chunks) if (chunk.ageMs > oldest.ageMs) oldest = chunk;
    return oldest;
  }

  private release(chunk: Chunk): void {
    chunk.active = false;
    chunk.image.setVisible(false);
    chunk.shadow.setVisible(false);
  }
}
