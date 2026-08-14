import type Phaser from 'phaser';
import type { Random, StatBlock } from '@volstudio/core';
import { Diagnostics, Vector2 } from '@volstudio/core';
import { enemyConfig } from '@/config/enemy';
import { getEnemyDefinition, pickEnemyDefinition } from '@/config/enemies/catalog';
import type { EnemyDefinition } from '@/config/enemies/types';
import type { Border } from './Border';
import { Enemy } from './Enemy';
import { createEnemyStats } from './enemyStats';
import type { MinionSpawnRequest } from './behaviors';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { DifficultyState } from '@/runtime/systems/DifficultyCalculator';

/** Düşman güncellemesine dışarıdan verilen sahne durumu. */
export interface EnemyUpdateContext {
  /** Sahnedeki kule — yakınındaki düşmanlar oyuncu yerine onu hedefler. */
  turret?: { x: number; y: number; isAlive: boolean } | null;
}

/**
 * Düşman yöneticisi — katalogdan arketip seçip spawn eder, günceller, temizler.
 *
 * Spawn, border kenarlarında seed'li PRNG ile belirlenen bir noktada olur;
 * hangi türün doğacağını dalga numarası ve katalog ağırlıkları belirler.
 * Swarmer'ların minion doğurma istekleri de burada karşılanır.
 */
export interface EnemyManagerCallbacks {
  /**
   * Bir düşman ÖLDÜĞÜNDE — hasarın kaynağı ne olursa olsun.
   * Mermi, kule, zincir ve ateş alanı ölümleri buradan geçer.
   */
  onEnemyDeath?: (enemy: Enemy) => void;
}

export class EnemyManager {
  private readonly enemies: Enemy[] = [];
  private spawnTimer = 0;
  private currentWave = 1;
  /**
   * Hareketi DIŞARIDAN sürülen düşmanlar (Elite/Boss). Normal davranış
   * döngüsünden muaf tutulur; çarpışma ve temizlik için listede kalır.
   */
  private readonly externallyDriven = new Set<Enemy>();
  /** Reusable buffer — hedef seçimi her frame yeni Vector2 yaratmaz. */
  private readonly targetBuf: Vector2 = Vector2.zero();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectManager,
    private readonly random: Random,
    private readonly callbacks: EnemyManagerCallbacks = {},
  ) {}

  /** Aktif dalga — spawn havuzunu belirler. */
  setWave(wave: number): void {
    this.currentWave = wave;
  }

  update(
    delta: number,
    playerPos: Vector2,
    border: Border,
    _time: number,
    grid: SpatialGrid,
    difficulty: DifficultyState,
    context: EnemyUpdateContext = {},
  ): void {
    this.spawnTimer += delta;
    if (
      this.spawnTimer >= difficulty.spawnIntervalMs &&
      this.enemies.length < difficulty.maxEnemies
    ) {
      const spawned = this.spawnFromCatalog(border, playerPos, difficulty);
      if (spawned) {
        this.spawnTimer = 0;
      } else {
        // Spawn başarısız (oyuncuya çok yakın) — kısa bekleme sonra tekrar dene
        this.spawnTimer = difficulty.spawnIntervalMs * enemyConfig.spawnRetryIntervalFactor;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Elite/Boss'un hareketini kendi kontrolcüsü sürer; burada yalnızca
      // listede tutulur (çarpışma, temizlik, spatial grid).
      if (!this.externallyDriven.has(enemy)) {
        const target = this.pickTarget(enemy, playerPos, context.turret ?? null);
        const spawnRequest = enemy.update(delta, target, border, grid, this.random);
        if (spawnRequest) {
          this.spawnMinions(enemy, spawnRequest, difficulty);
        }
      }

      if (!enemy.isAlive) {
        this.externallyDriven.delete(enemy);
        // Swap-and-pop: O(1) kaldırma, kaydırma yok
        const last = this.enemies.pop();
        if (last && i < this.enemies.length) {
          this.enemies[i] = last;
        }
      }
    }
  }

  /**
   * Özel bir düşman (Elite/Boss) doğurur ve hareketini DIŞARIYA bırakır.
   *
   * Normal spawn havuzuna girmez; `WaveManager` özel dalga kancasından
   * çağrılır. Dönen `Enemy` bir kontrolcüye (EliteController/BossController)
   * verilir.
   *
   * @param stats Verilirse taban stat'ların YERİNE kullanılır — boss'un
   * oyuncuya oranlı stat'ları böyle enjekte edilir.
   */
  spawnSpecial(
    definition: EnemyDefinition,
    x: number,
    y: number,
    difficulty: DifficultyState,
    stats?: StatBlock,
  ): Enemy {
    const enemy = this.createEnemy(definition, x, y, difficulty, stats);
    this.externallyDriven.add(enemy);
    return enemy;
  }

  /** Bir doğurma isteğini karşılar — Elite/Boss kontrolcüleri için genel kapı. */
  spawnMinionsFor(parent: Enemy, request: MinionSpawnRequest, difficulty: DifficultyState): void {
    this.spawnMinions(parent, request, difficulty);
  }

  /**
   * Dalga geçişinde sahnedeki düşmanları temizler (B1b).
   *
   * Bu bir öldürme DEĞİLDİR: ödül vermez, `onEnemyDeath` çağrılmaz, oyuncu
   * ceza almaz. Dışarıdan sürülen düşmanlar (Elite/Boss) korunur — onların
   * yaşadığı dalgada zaten temizlik yapılmaz, ama çağrı yanlışlıkla gelirse
   * zorunlu engel silinmemeli.
   *
   * @returns Temizlenen düşman sayısı.
   */
  clearRegularEnemies(): number {
    let cleared = 0;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (this.externallyDriven.has(enemy)) continue;

      enemy.clearWithEffect();
      cleared++;
      const last = this.enemies.pop();
      if (last && i < this.enemies.length) {
        this.enemies[i] = last;
      }
    }
    return cleared;
  }

  /**
   * Bir düşmanın bu frame'deki hedefi: kule sahadaysa ve düşmana oyuncudan
   * DAHA YAKINSA kule, aksi halde oyuncu. Kule böylece gerçek bir çekim
   * merkezi olur; uzaktaki düşmanlar oyuncuyu kovalamayı sürdürür.
   */
  private pickTarget(
    enemy: Enemy,
    playerPos: Vector2,
    turret: { x: number; y: number; isAlive: boolean } | null,
  ): Vector2 {
    if (!turret || !turret.isAlive) return playerPos;

    const toTurret = Math.hypot(turret.x - enemy.x, turret.y - enemy.y);
    const toPlayer = Math.hypot(playerPos.x - enemy.x, playerPos.y - enemy.y);
    if (toTurret >= toPlayer) return playerPos;

    this.targetBuf.set(turret.x, turret.y);
    return this.targetBuf;
  }

  /** Border kenarından, dalga havuzundan seçilen bir düşman doğurur. */
  private spawnFromCatalog(
    border: Border,
    playerPos: Vector2,
    difficulty: DifficultyState,
  ): boolean {
    const definition = pickEnemyDefinition(this.random, this.currentWave);
    if (!definition) return false;

    const position = this.pickEdgePosition(border, definition.radius);

    // Oyuncuya çok yakın spawn etme
    const distToPlayer = Math.hypot(position.x - playerPos.x, position.y - playerPos.y);
    if (distToPlayer < enemyConfig.spawnMinPlayerDistance) return false;

    this.createEnemy(definition, position.x, position.y, difficulty);
    return true;
  }

  /** Swarmer'ın doğurma isteğini karşılar — minion'lar ebeveyne kaydedilir. */
  private spawnMinions(
    parent: Enemy,
    request: MinionSpawnRequest,
    difficulty: DifficultyState,
  ): void {
    const definition = getEnemyDefinition(request.minionId);

    for (const angle of request.angles) {
      // Sürü, normal spawn ile aynı dalga limitini paylaşır: aksi halde
      // minion'lar tavanı doldurup normal spawn'ı tamamen kilitleyebilirdi.
      if (this.enemies.length >= difficulty.maxEnemies) return;

      const x = parent.x + Math.cos(angle) * request.radius;
      const y = parent.y + Math.sin(angle) * request.radius;
      const minion = this.createEnemy(definition, x, y, difficulty);
      parent.registerMinion(minion);
    }
  }

  private createEnemy(
    definition: EnemyDefinition,
    x: number,
    y: number,
    difficulty: DifficultyState,
    stats?: StatBlock,
  ): Enemy {
    const enemy = new Enemy(this.scene, x, y, this.effects, {
      definition,
      stats: stats ?? createEnemyStats(definition, difficulty),
      scoreValue: definition.scoreValue * difficulty.scoreMultiplier,
      // Ödül ölümün KENDİSİNE bağlı: kule/zincir/ateş ölümleri de sayılır.
      onDeath: (killed) => this.callbacks.onEnemyDeath?.(killed),
    });
    this.enemies.push(enemy);

    Diagnostics.getInstance()?.recordEvent('enemySpawn', { x, y, id: definition.id });

    return enemy;
  }

  /** Border kenarlarından birinde rastgele (seed'li) bir nokta seçer. */
  private pickEdgePosition(border: Border, radius: number): { x: number; y: number } {
    const b = border.bounds;
    const side = Math.floor(this.random.next() * enemyConfig.spawnEdgeCount);

    switch (side) {
      case 0: // top
        return { x: b.left + this.random.next() * b.width, y: b.top + radius };
      case 1: // bottom
        return { x: b.left + this.random.next() * b.width, y: b.bottom - radius };
      case 2: // left
        return { x: b.left + radius, y: b.top + this.random.next() * b.height };
      default: // right
        return { x: b.right - radius, y: b.top + this.random.next() * b.height };
    }
  }

  getEnemies(): readonly Enemy[] {
    return this.enemies;
  }

  destroy(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies.length = 0;
    this.externallyDriven.clear();
  }
}
