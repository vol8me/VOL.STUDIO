import type Phaser from 'phaser';
import {
  resolveEntityVisuals,
  type EntityVisualQuality,
  type EntityVisualQualityProvider,
} from './entityVisuals';
import { Vector2 } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { RENDER_DEPTH } from '@/config/layers';
import { sfxVolumes } from '@/config/audio';
import { diagnostics, gameAudio } from '@/app/services';
import type { Border } from './Border';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { finiteOr, nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

/**
 * Mermi — oyuncunun fare yönüne doğru ateşlediği projectile.
 * Border duvarından seker, ömrü dolunca yok edilir.
 */
export class Bullet {
  readonly arc: Phaser.GameObjects.Arc;
  private readonly velocity: Vector2 = Vector2.zero();
  private age = 0;
  private alive = true;
  private expired = false;
  private previousX: number;
  private previousY: number;
  /** Bu adımda duvara temas noktası; sekme olmadıysa `null` (bkz. getter). */
  private readonly visuals: EntityVisualQuality;
  private bounceX: number | null = null;
  private bounceY: number | null = null;
  private readonly damageValue: number;
  private lastTrailTime = 0;
  private lastBounceSoundTime = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    direction: Vector2,
    private readonly effects: EffectManager,
    /** Ateşlendiği andaki hasar — oyuncunun stat bloğundan gelir. */
    damageValue: number = bulletConfig.damage,
    visualsProvider?: EntityVisualQualityProvider,
  ) {
    this.visuals = resolveEntityVisuals(visualsProvider);
    this.damageValue = nonNegativeFinite(damageValue);
    const directionX = finiteOr(direction.x, 0);
    const directionY = finiteOr(direction.y, 0);
    this.arc = scene.add.circle(
      finiteOr(x, 0),
      finiteOr(y, 0),
      bulletConfig.radius,
      bulletConfig.color,
      bulletConfig.fillAlpha,
    );
    this.previousX = this.arc.x;
    this.previousY = this.arc.y;
    // Kenar çizgisi arc başına İKİNCİ bir çizim geçişidir; ekranda onlarca
    // mermi olabildiği için kalite kademesi bunu kapatabilir.
    if (this.visuals.entityStrokes) {
      this.arc.setStrokeStyle(
        bulletConfig.strokeWidth,
        bulletConfig.strokeColor,
        bulletConfig.strokeAlpha,
      );
    }
    this.arc.setDepth(RENDER_DEPTH.bullet);

    this.velocity.set(directionX, directionY);
    if (this.velocity.length() > 0) {
      this.velocity.normalizeInPlace().scaleInPlace(bulletConfig.speed);
    }
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get x(): number {
    return this.arc.x;
  }

  get y(): number {
    return this.arc.y;
  }

  get damage(): number {
    return this.damageValue;
  }

  /**
   * Bu adımda duvara temas edilen nokta — sekme olmadıysa `null`.
   *
   * Çarpışma, merminin süpürdüğü yolu `previousPosition -> konum` DÜZ
   * ÇİZGİSİYLE tarıyor. Sekmede bu çizgi yalan söyler: mermi duvara gidip
   * geri döndüğü hâlde segment, iki uç arasında arenanın İÇİNDEN geçen ve
   * merminin hiç uğramadığı bir kiriş çizer — o kiriş üzerindeki bir düşman
   * haksız yere vurulabilir, gerçek yol üzerindeki ise atlanabilir.
   * Temas noktası verilince çarpışma yolu iki gerçek parçaya bölünür.
   */
  get bouncePositionX(): number | null {
    return this.bounceX;
  }

  get bouncePositionY(): number | null {
    return this.bounceY;
  }

  get previousPositionX(): number {
    return this.previousX;
  }

  get previousPositionY(): number {
    return this.previousY;
  }

  /** Ömrü doldu; çarpışma aşaması son hareketi hâlâ işleyebilir. */
  get isExpired(): boolean {
    return this.expired;
  }

  update(delta: number, border: Border): void {
    if (!this.alive) return;

    const safeDelta = safeDeltaMs(delta);
    const remainingMs = Math.max(0, bulletConfig.lifetimeMs - this.age);
    const movementDelta = Math.min(safeDelta, remainingMs);
    const dt = movementDelta / 1000;
    this.previousX = this.arc.x;
    this.previousY = this.arc.y;
    this.bounceX = null;
    this.bounceY = null;
    this.arc.x += this.velocity.x * dt;
    this.arc.y += this.velocity.y * dt;

    this.handleBounce(border);

    // Trail partikül — mermi başına saniyede ~40 emisyon. Kalabalık bir
    // ekranda tek başına en pahalı efekt kaynağı; kalite kademesi kapatır.
    if (this.visuals.bulletTrails) {
      this.lastTrailTime += movementDelta;
      if (this.lastTrailTime >= bulletConfig.trailFrequencyMs) {
        this.lastTrailTime = 0;
        this.spawnTrailParticle();
      }
    }

    this.age += safeDelta;
    if (this.age >= bulletConfig.lifetimeMs) {
      // CollisionResolver bu frame'in süpürülmüş segmentini gördükten sonra
      // mermiyi kaldırır. Önce yok etmek son kare vuruşunu kaybettiriyordu.
      this.expired = true;
    }
  }

  /** Hareket sırasında arkada iz bırakır — mermi yönünün tersine yayılır. */
  private spawnTrailParticle(): void {
    // Phaser açıları derece cinsinden bekler; iz mermi yönünün tersine gider.
    const angleDeg = Math.atan2(-this.velocity.y, -this.velocity.x) * (180 / Math.PI);
    this.effects.play('bulletTrail', this.arc.x, this.arc.y, angleDeg);
  }

  /** Border duvarından sekme — hız vektörünü yansıt. */
  private handleBounce(border: Border): void {
    const r = bulletConfig.radius;
    const b = border.bounds;
    let bounced = false;

    if (this.arc.x - r < b.left) {
      this.arc.x = b.left + r;
      this.velocity.x = -this.velocity.x * bulletConfig.bounceDamping;
      bounced = true;
    } else if (this.arc.x + r > b.right) {
      this.arc.x = b.right - r;
      this.velocity.x = -this.velocity.x * bulletConfig.bounceDamping;
      bounced = true;
    }

    if (this.arc.y - r < b.top) {
      this.arc.y = b.top + r;
      this.velocity.y = -this.velocity.y * bulletConfig.bounceDamping;
      bounced = true;
    } else if (this.arc.y + r > b.bottom) {
      this.arc.y = b.bottom - r;
      this.velocity.y = -this.velocity.y * bulletConfig.bounceDamping;
      bounced = true;
    }

    if (bounced) {
      // Clamp sonrası konum, duvarla temas noktasının kendisidir: çarpışma
      // yolunu `önceki -> temas` ve `temas -> güncel` diye ikiye böler.
      this.bounceX = this.arc.x;
      this.bounceY = this.arc.y;
      diagnostics?.recordEvent('bulletBounce', {
        x: this.arc.x,
        y: this.arc.y,
      });

      const now = finiteOr(this.scene.time.now, 0);
      if (now - this.lastBounceSoundTime >= bulletConfig.bounceSoundCooldownMs) {
        this.lastBounceSoundTime = now;
        void gameAudio.playSfx('bulletBounce', { volume: sfxVolumes.bulletBounce });
      }

      this.spawnBounceParticles();
    }
  }

  /** Sekme anında küçük kıvılcım patlaması. */
  private spawnBounceParticles(): void {
    this.effects.play('bulletBounce', this.arc.x, this.arc.y);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.arc.destroy();
  }
}
