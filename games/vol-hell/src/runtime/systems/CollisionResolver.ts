import { bulletConfig } from '@/config/bullet';
import { playerConfig } from '@/config/player';
import { physicsConfig } from '@/config/physics';
import { sfxVolumes } from '@/config/audio';
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
  /**
   * Düşman öldüğünde — skor, öldürme sayısı ve ekonomi (Spark/Flux) için.
   * Ölüm ANINDA çağrılır; düşman nesnesi bu çağrıdan sonra listeden düşer,
   * bu yüzden referansı saklamayın, ihtiyacınız olan değerleri hemen okuyun.
   */
  onEnemyKilled?: (enemy: Enemy) => void;
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
    if (!turret) return;

    const nearbyEnemies = this.spatialGrid.queryNearby(turret.x, turret.y);
    for (const enemy of nearbyEnemies) {
      if (!enemy.isAlive) continue;

      const dist = Math.hypot(enemy.x - turret.x, enemy.y - turret.y);
      if (dist >= enemy.radius + turret.radius) continue;

      const damage = enemy.tryContactDamage(time);
      if (damage > 0) {
        turret.takeDamage(damage);
      }
    }
  }

  /** Mermi-düşman çarpışma kontrolü — spatial grid ile sadece komşu hücreleri kontrol eder. */
  private checkBulletEnemyCollisions(): void {
    const bullets = this.bulletManager.getBullets();
    this.bulletsToRemoveBuf.length = 0;

    for (const bullet of bullets) {
      if (!bullet.isAlive) continue;

      const nearbyEnemies = this.spatialGrid.queryNearby(bullet.x, bullet.y);
      for (const enemy of nearbyEnemies) {
        if (!enemy.isAlive) continue;

        const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
        if (dist < enemy.radius + bulletConfig.radius) {
          const killed = enemy.takeDamage(bullet.damage);
          this.bulletsToRemoveBuf.push(bullet);

          if (killed) {
            // Killing blow — hit tail'ini kes, sadece death çalsın.
            void gameAudio.playSfx('enemyDeath', {
              volume: sfxVolumes.enemyDeath,
              stopEvents: ['enemyHit'],
            });
            this.callbacks.onEnemyKilled?.(enemy);
          } else {
            void gameAudio.playSfx('enemyHit', { volume: sfxVolumes.enemyHit });
          }
          break;
        }
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
        const damage = enemy.tryContactDamage(time);
        // Hasar görselleri (partikül + sarsıntı) Player.takeDamage içinden
        // efekt katmanına gider; burada yalnızca ses kalır.
        if (damage > 0 && this.player.takeDamage(damage)) {
          void gameAudio.playSfx('hurt', { volume: sfxVolumes.hurt });
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

        if (dist < minDist && dist > 0) {
          hasOverlap = true;
          const overlap = minDist - dist;
          // İlk iterasyonda büyük itme, sonrakilerde giderek küçük — overlap
          // anında çözülür, titreme önlenir.
          const pushDist = (overlap * pushFactor) / (iter + 1);
          pushX += (dx / dist) * pushDist;
          pushY += (dy / dist) * pushDist;
          enemy.applyPush(-(dx / dist) * pushDist, -(dy / dist) * pushDist, this.border);
        }
      }

      if (pushX !== 0 || pushY !== 0) {
        this.player.applyPush(pushX, pushY);
      }

      if (!hasOverlap) break;
    }
  }
}
