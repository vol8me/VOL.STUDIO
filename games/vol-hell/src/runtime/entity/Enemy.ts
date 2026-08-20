import type Phaser from 'phaser';
import { Vector2, type Random } from '@volstudio/core';
import type { HellStatBlock } from '@/config/stats';
import { enemyConfig } from '@/config/enemy';
import { playerConfig } from '@/config/player';
import { RENDER_DEPTH } from '@/config/layers';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { Border } from './Border';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import { EntityHealthBar } from './EntityHealthBar';
import { quantizeEnemyHealth } from './enemyStats';
import {
  applyRusherBehavior,
  applySeekBehavior,
  applySwarmerBehavior,
  createMinionSpawnRequest,
  createRusherState,
  createSwarmerState,
  type BehaviorContext,
  type MinionSpawnRequest,
  type MutableBehaviorContext,
  type RusherState,
  type SwarmerState,
  type VelocityOutput,
} from './behaviors';
import { diagnostics } from '@/app/services';

/** Bir düşmanı doğururken verilen bağlam. */
export interface EnemyOptions {
  /** Katalog tanımı — arketip, görünüm ve davranış parametreleri. */
  definition: EnemyDefinition;
  /** Taban stat'lar + zorluk modifier'ları (bkz. `createEnemyStats`). */
  stats: HellStatBlock;
  /** Zorluk çarpanı uygulanmış skor değeri. */
  scoreValue: number;
  /**
   * Düşman öldüğünde — hasarın kaynağı ne olursa olsun çağrılır.
   *
   * Ödül ölümün kendisine bağlıdır.
   * `destroy()` ile sahneden kaldırma (dalga temizliği) bunu tetiklemez.
   */
  onDeath?: (enemy: Enemy) => void;
}

/**
 * Düşman — katalog tanımına göre davranır, temasla hasar verir.
 * Diğer düşmanlarla overlap etmez (separation). Can barı üzerindedir.
 *
 * Stat'lar `StatBlock` üzerinden okunur; arketipe özel hareket mantığı
 * `behaviors/` altındaki bağımsız fonksiyonlardadır; Elite bunları kompoze
 * ederek kullanır.
 */
export class Enemy {
  readonly arc: Phaser.GameObjects.Arc;
  readonly definition: EnemyDefinition;
  private readonly stats: HellStatBlock;
  private readonly healthBar: EntityHealthBar;
  private readonly maxHealth: number;
  private readonly score: number;
  private health: number;
  private alive = true;
  private lastContactDamage = -Infinity;
  private readonly velocity: Vector2 = Vector2.zero();
  // Reusable buffer'lar — her frame yeni obje yaratmaz
  private readonly separationBuf: Vector2 = Vector2.zero();
  private readonly behaviorVelocity: VelocityOutput = { x: 0, y: 0 };
  /** İlk update'te kurulur, sonra alanları yerinde güncellenir. */
  private behaviorContext: MutableBehaviorContext | null = null;
  // Arketipe özel davranış durumları — yalnızca ilgili arketipte kurulur.
  private readonly rusherState: RusherState | null;
  private readonly swarmerState: SwarmerState | null;
  private readonly spawnRequest: MinionSpawnRequest | null;
  /** Bu düşmanın doğurduğu ve hâlâ yaşayan minion'lar. */
  private readonly minions: Enemy[] = [];
  private readonly onDeath?: (enemy: Enemy) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly effects: EffectManager,
    options: EnemyOptions,
  ) {
    this.definition = options.definition;
    this.stats = options.stats;
    this.score = options.scoreValue;
    this.onDeath = options.onDeath;

    this.maxHealth = quantizeEnemyHealth(this.stats.getValue('health'));
    this.health = this.maxHealth;

    this.arc = scene.add.circle(
      x,
      y,
      this.definition.radius,
      this.definition.color,
      enemyConfig.fillAlpha,
    );
    this.arc.setStrokeStyle(
      enemyConfig.strokeWidth,
      this.definition.strokeColor,
      enemyConfig.strokeAlpha,
    );
    this.arc.setDepth(RENDER_DEPTH.enemy);

    this.rusherState = this.definition.archetype === 'rusher' ? createRusherState() : null;
    this.swarmerState = this.definition.archetype === 'swarmer' ? createSwarmerState() : null;
    this.spawnRequest = this.swarmerState ? createMinionSpawnRequest() : null;

    this.healthBar = new EntityHealthBar(scene, x, y, this.definition.radius);
    this.updateHealthBar();
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

  get radius(): number {
    return this.definition.radius;
  }

  get scoreValue(): number {
    return this.score;
  }

  /** Öldürülünce doğrudan sayaca eklenen Spark. */
  get sparkReward(): number {
    return this.definition.sparkReward;
  }

  /** Öldürülünce yere düşen Flux miktarı (0 = düşmez). */
  get fluxReward(): number {
    return this.definition.fluxReward;
  }

  /** Düşmanın stat bloğu — dışarıdan modifier eklemek için. */
  getStats(): HellStatBlock {
    return this.stats;
  }

  /** Kalan can oranı (0-1) — Boss faz geçişi bunu okur. */
  getHealthRatio(): number {
    return this.maxHealth > 0 ? this.health / this.maxHealth : 0;
  }

  /**
   * Temas hasarı değeri — COOLDOWN'A BAKMAZ.
   * Boss saldırıları kendi zamanlamasını taşıdığı için temas cooldown'unu
   * kullanmaz; hasar miktarını buradan okur.
   */
  getContactDamage(): number {
    return Math.max(0, this.stats.getValue('damage'));
  }

  /** Doğurulan minion'u sahiplenir; kapasite kontrolü buradan beslenir. */
  registerMinion(minion: Enemy): void {
    this.minions.push(minion);
  }

  /** Hayatta olan minion sayısı — dış kontrolcüler (Elite) kapasiteyi buradan okur. */
  getAliveMinionCount(): number {
    this.pruneMinions();
    return this.minions.length;
  }

  /**
   * Hareketi DIŞARIDAN sürer — Elite/Boss kontrolcüleri için.
   *
   * `update()` ile aynı son adımları uygular (separation + border clamp + can
   * barı takibi) ama davranış seçimini atlar: hızı çağıran belirler. Böylece
   * özel düşmanlar kendi yapay zekâlarını taşırken çarpışma/sınır mantığını
   * kopyalamak zorunda kalmaz.
   *
   * @param vx Hız (piksel/saniye).
   * @param vy Hız (piksel/saniye).
   */
  moveBy(vx: number, vy: number, deltaMs: number, border: Border, grid: SpatialGrid): void {
    if (!this.alive) return;

    const dt = deltaMs / 1000;
    this.applySeparation(grid);

    this.arc.x += (vx + this.separationBuf.x) * dt;
    this.arc.y += (vy + this.separationBuf.y) * dt;

    this.arc.x = border.clampX(this.arc.x, this.definition.radius);
    this.arc.y = border.clampY(this.arc.y, this.definition.radius);

    this.healthBar.follow(this.arc.x, this.arc.y);
  }

  /** Düşmana hasar verir. Ölürse true döner. */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.health = Math.max(0, this.health - amount);
    this.updateHealthBar();

    diagnostics?.recordEvent('enemyHit', {
      x: this.arc.x,
      y: this.arc.y,
      amount,
      health: this.health,
    });

    if (this.health <= 0) {
      this.kill();
      return true;
    }

    this.effects.play('enemyHit', this.arc.x, this.arc.y);
    return false;
  }

  /** Oyuncuya temas hasarı verir — cooldown aktifse reddedir. */
  tryContactDamage(time: number): number {
    // fireRate = saldırılar arası bekleme (ms).
    if (time - this.lastContactDamage < this.stats.getValue('fireRate')) return 0;
    this.lastContactDamage = time;
    // Negatif hasar oyuncuyu iyileştirirdi; modifier ne verirse versin taban sıfır.
    return Math.max(0, this.stats.getValue('damage'));
  }

  /**
   * Düşmanı günceller — arketip davranışı + separation + border clamp.
   * Separation için spatial grid kullanır — O(N²) yerine O(N·k).
   *
   * @returns Bu frame'de minion doğurulacaksa istek nesnesi, yoksa null.
   * Dönen nesne yeniden kullanılır; hemen tüket, saklama.
   */
  update(
    delta: number,
    playerPos: Vector2,
    border: Border,
    grid: SpatialGrid,
    random: Random,
  ): MinionSpawnRequest | null {
    if (!this.alive) return null;

    const dt = delta / 1000;
    // Bağlam nesnesi düşman başına bir kez kurulur, her frame yerinde güncellenir.
    const context: MutableBehaviorContext = (this.behaviorContext ??= {
      x: this.arc.x,
      y: this.arc.y,
      targetX: playerPos.x,
      targetY: playerPos.y,
      deltaMs: delta,
      speed: 0,
      random,
    });
    context.x = this.arc.x;
    context.y = this.arc.y;
    context.targetX = playerPos.x;
    context.targetY = playerPos.y;
    context.deltaMs = delta;
    context.speed = Math.max(0, this.stats.getValue('speed'));
    context.random = random;

    const spawnRequest = this.runBehavior(context);
    this.velocity.set(this.behaviorVelocity.x, this.behaviorVelocity.y);

    this.applySeparation(grid);

    this.arc.x += (this.velocity.x + this.separationBuf.x) * dt;
    this.arc.y += (this.velocity.y + this.separationBuf.y) * dt;

    // Border clamp — obje yaratmaz
    this.arc.x = border.clampX(this.arc.x, this.definition.radius);
    this.arc.y = border.clampY(this.arc.y, this.definition.radius);

    this.healthBar.follow(this.arc.x, this.arc.y);

    return spawnRequest;
  }

  /** Arketipe göre davranışı çalıştırır ve `behaviorVelocity`'yi doldurur. */
  private runBehavior(context: BehaviorContext): MinionSpawnRequest | null {
    const contactDistance = this.definition.radius + playerConfig.hitboxRadius;

    if (this.rusherState && this.definition.rusher) {
      applyRusherBehavior(
        this.rusherState,
        context,
        this.definition.rusher,
        contactDistance,
        this.behaviorVelocity,
      );
      if (this.rusherState.dashStarted) {
        const angleDeg =
          Math.atan2(-this.rusherState.dashDirY, -this.rusherState.dashDirX) * (180 / Math.PI);
        this.effects.play('enemyDash', this.arc.x, this.arc.y, angleDeg);
      }
      return null;
    }

    if (this.swarmerState && this.definition.swarmer && this.spawnRequest) {
      this.pruneMinions();
      this.swarmerState.aliveMinions = this.minions.length;
      return applySwarmerBehavior(
        this.swarmerState,
        context,
        this.definition.swarmer,
        this.behaviorVelocity,
        this.spawnRequest,
      );
    }

    applySeekBehavior(context, contactDistance, this.behaviorVelocity);
    return null;
  }

  /** Yakındaki düşmanlardan uzaklaşma kuvveti — üst üste binmeyi engeller. */
  private applySeparation(grid: SpatialGrid): void {
    this.separationBuf.reset();
    // Ölçek olarak arketipin TABAN hızı kullanılır: zorlukla büyüyen hız
    // separation'ı da büyütseydi geç oyunda düşmanlar birbirini fırlatırdı.
    const separationScale = this.definition.baseStats.speed;

    const nearby = grid.queryNearby(this.arc.x, this.arc.y);
    for (const other of nearby) {
      if (other === this || !other.alive) continue;
      const dx = this.arc.x - other.x;
      const dy = this.arc.y - other.y;
      const d = Math.hypot(dx, dy);
      const minDistance =
        this.definition.radius + other.definition.radius + enemyConfig.separationGap;
      if (Number.isFinite(d) && d > 0 && d < minDistance) {
        const force = (1 - d / minDistance) * enemyConfig.separationForce;
        this.separationBuf.x += (dx / d) * force * separationScale;
        this.separationBuf.y += (dy / d) * force * separationScale;
      }
    }
  }

  /** Ölmüş minion referanslarını listeden düşürür. */
  private pruneMinions(): void {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      if (this.minions[i].alive) continue;
      const last = this.minions.pop();
      if (last && i < this.minions.length) {
        this.minions[i] = last;
      }
    }
  }

  private updateHealthBar(): void {
    this.healthBar.setRatio(this.health / this.maxHealth, this.alive, this.arc.x);
  }

  /** Düşmanı öldürür — ölüm efekti + ödül kancası + yok etme. */
  private kill(): void {
    if (!this.alive) return;
    this.alive = false;

    diagnostics?.recordEvent('enemyDeath', {
      x: this.arc.x,
      y: this.arc.y,
      id: this.definition.id,
    });

    this.effects.play('enemyDeath', this.arc.x, this.arc.y);
    // Kanca, görseller oynatıldıktan SONRA ama nesne yok edilmeden ÖNCE:
    // dinleyici hâlâ konumu okuyabilir (Flux ölüm noktasına düşer).
    this.onDeath?.(this);
    this.arc.destroy();
    this.healthBar.destroy();
  }

  /**
   * Dalga geçişinde sahneden kaldırır — ödül YOK, ölüm sayılmaz.
   *
   * Normal dalga bitince kalan düşmanlar temizlenir. Bu bir öldürme
   * değildir: skor/Spark/Flux vermez, `onDeath` çağrılmaz. Oyuncu ceza da
   * almaz, ödül de almaz — dalga geçişinin nötr bir parçasıdır.
   */
  clearWithEffect(): void {
    if (!this.alive) return;
    this.alive = false;
    this.minions.length = 0;
    this.effects.play('waveClear', this.arc.x, this.arc.y);
    this.arc.destroy();
    this.healthBar.destroy();
  }

  /** Düşmana dışarıdan itme uygular (overlap çözümü için). Border'a clamp eder. */
  applyPush(pushX: number, pushY: number, border: Border): void {
    this.arc.x += pushX;
    this.arc.y += pushY;

    this.arc.x = border.clampX(this.arc.x, this.definition.radius);
    this.arc.y = border.clampY(this.arc.y, this.definition.radius);
  }

  /** Düşmanı yok eder — sadece alive ise. kill() zaten destroy yapar. */
  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.minions.length = 0;
    this.arc.destroy();
    this.healthBar.destroy();
  }
}
