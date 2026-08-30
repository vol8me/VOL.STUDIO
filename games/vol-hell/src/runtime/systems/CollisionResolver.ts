import { segmentCircleEntryT, vibrate } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { playerConfig } from '@/config/player';
import { physicsConfig } from '@/config/physics';
import { sfxVolumes } from '@/config/audio';
import { getMaxEnemyRadius } from '@/config/enemies/catalog';
import { gameAudio } from '@/app/services';
import type { Player } from '@/runtime/entity/Player';
import type { Bullet } from '@/runtime/entity/Bullet';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
import type { Turret } from '@/runtime/entity/Turret';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { SpatialGrid } from './SpatialGrid';
import type { Border } from '@/runtime/entity/Border';

export interface CollisionResolverCallbacks {
  /** Sahnedeki kule — düşmanlar temasla yıpratır. Yoksa null döner. */
  getTurret?: () => Turret | null;
}

/**
 * Çarpışma çözümleyici — mermi-düşman, düşman-oyuncu ve overlap çözümü.
 * GameScene'den ayrı tutularak sahne dosyası sınırlandırılır.
 */
export class CollisionResolver {
  // Reusable buffer — her frame yeni obje yaratmaz
  private readonly bulletsToRemoveBuf: Bullet[] = [];
  private nextPlayerContactDamageAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly player: Player,
    private readonly bulletManager: BulletManager,
    private readonly enemyManager: EnemyManager,
    private readonly spatialGrid: SpatialGrid,
    private readonly border: Border,
    private readonly callbacks: CollisionResolverCallbacks = {},
  ) {}

  /** Tüm çarpışma aşamalarını çalıştırır. */
  resolve(time: number): void {
    this.checkBulletEnemyCollisions();
    this.checkEnemyPlayerCollisions(time);
    this.checkEnemyTurretCollisions(time);
    this.resolvePlayerEnemyOverlap();
  }

  /**
   * Düşman-kule teması — kuleye değen düşman onu yıpratır.
   * Aynı temas cooldown'unu kullanır: kuleye saldırmak oyuncuya saldırmakla
   * aynı tempoda olur, düşman iki hedefe aynı anda vurmuş sayılmaz.
   */
  private checkEnemyTurretCollisions(time: number): void {
    const turret = this.callbacks.getTurret?.();
    if (!turret || !turret.canTakeContactDamage(time)) return;

    const nearbyEnemies = this.spatialGrid.queryNearby(turret.x, turret.y);
    for (const enemy of nearbyEnemies) {
      if (!enemy.isAlive) continue;

      const dist = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
      if (dist >= enemy.radius + turret.radius) continue;

      const damage = enemy.tryContactDamage(time);
      if (damage > 0 && turret.takeContactDamage(damage, time)) {
        // Kule sabit bir çekim merkezidir; aynı karede bütün çevre halkasının
        // hasarını toplamak düşman yoğunluğunu anlık tek-vuruşa çevirir.
        // Ortak kapı açılana kadar başka düşmanın cooldown'unu da tüketme.
        return;
      }
    }
  }

  /** Mermi-düşman çarpışma kontrolü — spatial grid ile sadece komşu hücreleri kontrol eder. */
  private checkBulletEnemyCollisions(): void {
    const bullets = this.bulletManager.getBullets();
    this.bulletsToRemoveBuf.length = 0;

    for (const bullet of bullets) {
      if (!bullet.isAlive) continue;

      const previousX = bullet.previousPositionX ?? bullet.x;
      const previousY = bullet.previousPositionY ?? bullet.y;
      const broadphaseRadius = bulletConfig.radius + getMaxEnemyRadius();

      // Sekmede yol DÜZ DEĞİLDİR: `önceki -> temas -> güncel`. Tek segmentle
      // taramak, merminin hiç uğramadığı bir kirişi tarardı (bkz.
      // `Bullet.bouncePositionX`). Parçalar SIRAYLA denenir; ilk parçada
      // vuruş varsa ikinciye hiç bakılmaz — zaman sırası korunur.
      const bounceX = bullet.bouncePositionX ?? null;
      const bounceY = bullet.bouncePositionY ?? null;
      const hasBounce = bounceX !== null && bounceY !== null;
      const legs: readonly (readonly [number, number, number, number])[] = hasBounce
        ? [
            [previousX, previousY, bounceX, bounceY],
            [bounceX, bounceY, bullet.x, bullet.y],
          ]
        : [[previousX, previousY, bullet.x, bullet.y]];

      let nearest: Enemy | null = null;
      for (const [startX, startY, endX, endY] of legs) {
        const nearbyEnemies =
          typeof this.spatialGrid.querySegmentNearby === 'function'
            ? this.spatialGrid.querySegmentNearby(startX, startY, endX, endY, broadphaseRadius)
            : this.spatialGrid.queryNearby(endX, endY);

        // Aynı parça üzerinde birden fazla düşman kesişebilir; dizideki İLK
        // eşleşmeyi almak sonucu grid'in hücre sırasına bağlar ve mermi
        // öndekinin içinden geçebilir. En küçük giriş parametresi gerçek ilk
        // temastır; eşitlikte dizi sırası kazanır, yani deterministik kalır.
        let nearestT = Number.POSITIVE_INFINITY;
        for (const enemy of nearbyEnemies) {
          if (!enemy.isAlive) continue;

          const entryT = segmentCircleEntryT(
            startX,
            startY,
            endX,
            endY,
            enemy.x,
            enemy.y,
            enemy.radius + bulletConfig.radius,
          );
          if (entryT === null || entryT >= nearestT) continue;
          nearest = enemy;
          nearestT = entryT;
        }
        if (nearest) break;
      }

      if (nearest) {
        const killed = nearest.takeDamage(bullet.damage);
        this.bulletsToRemoveBuf.push(bullet);

        // Ölüm anında hit çalmaz; death sesi GameScene.onEnemyKilled'da
        // tüm kaynaklar için (mermi/kule/zincir/ateş) tek yerden verilir.
        if (!killed) {
          void gameAudio.playSfx('enemyHit', { volume: sfxVolumes.enemyHit });
        }
      } else if (bullet.isExpired && bullet.isAlive) {
        this.bulletsToRemoveBuf.push(bullet);
      }
    }

    for (const bullet of this.bulletsToRemoveBuf) {
      this.bulletManager.removeBullet(bullet);
    }
  }

  /** Düşman-oyuncu temas kontrolü — spatial grid ile sadece yakındaki düşmanları kontrol eder. */
  private checkEnemyPlayerCollisions(time: number): void {
    const playerPos = this.player.getPosition();
    const nearbyEnemies = this.spatialGrid.queryNearby(playerPos.x, playerPos.y);

    for (const enemy of nearbyEnemies) {
      if (!enemy.isAlive) continue;

      const dist = Math.hypot(enemy.x - playerPos.x, enemy.y - playerPos.y);
      if (dist < enemy.radius + playerConfig.hitboxRadius) {
        if (!Number.isFinite(time) || time < this.nextPlayerContactDamageAt) continue;
        const damage = enemy.tryContactDamage(time);
        // Hasar görselleri (partikül + sarsıntı) Player.takeDamage içinden
        // efekt katmanına gider; burada yalnızca ses kalır.
        if (damage > 0 && this.player.takeDamage(damage)) {
          this.nextPlayerContactDamageAt = time + playerConfig.contactDamageGraceMs;
          void gameAudio.playSfx('hurt', { volume: sfxVolumes.hurt });
          // Oyuncunun hasar alması en önemli geri bildirim; kendi kısıt
          // penceresi ateş salkımından bağımsızdır (bkz. MIN_INTERVAL_MS).
          vibrate('warning');
        }
      }
    }
  }

  /**
   * Player-enemy overlap çözümü — player düşmanların içine girmesin.
   * Her iterasyonda kalan overlap azalır, titreme önlenir.
   * Player ve düşman karşılıklı itilir, border clamp uygulanır.
   */
  private resolvePlayerEnemyOverlap(): void {
    const { iterations, pushFactor } = physicsConfig.overlapResolve;

    for (let iter = 0; iter < iterations; iter++) {
      const playerPos = this.player.getPosition();
      const nearbyEnemies = this.spatialGrid.queryNearby(playerPos.x, playerPos.y);
      let pushX = 0;
      let pushY = 0;
      let hasOverlap = false;

      for (const enemy of nearbyEnemies) {
        if (!enemy.isAlive) continue;

        const dx = playerPos.x - enemy.x;
        const dy = playerPos.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        const minDist = enemy.radius + playerConfig.hitboxRadius;

        if (dist < minDist) {
          hasOverlap = true;
          // Tam üst üste binmede yön düşmanın KENDİ kararlı normalinden gelir
          // (bkz. `Enemy.separationNormalX`); tür başına tek yön kalabalığı
          // aynı tarafa itip blok hâlinde kaydırıyordu.
          const normalX = dist > 0 ? dx / dist : enemy.separationNormalX;
          const normalY = dist > 0 ? dy / dist : enemy.separationNormalY;
          const overlap = minDist - dist;
          // İlk iterasyonda büyük itme, sonrakilerde giderek küçük — overlap
          // anında çözülür, titreme önlenir.
          const pushDist = (overlap * pushFactor) / (iter + 1);
          pushX += normalX * pushDist;
          pushY += normalY * pushDist;
          enemy.applyPush(-normalX * pushDist, -normalY * pushDist, this.border);
          if (typeof this.spatialGrid.update === 'function') this.spatialGrid.update(enemy);
        }
      }

      if (pushX !== 0 || pushY !== 0) {
        this.player.applyPush(pushX, pushY);
      }

      if (!hasOverlap) break;
    }
  }
}
