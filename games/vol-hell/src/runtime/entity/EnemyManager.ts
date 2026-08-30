import type Phaser from 'phaser';
import type { EntityVisualQualityProvider } from './entityVisuals';
import type { Random } from '@volstudio/core';
import type { HellStatBlock } from '@/config/stats';
import { Vector2 } from '@volstudio/core';
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
import { diagnostics } from '@/app/services';
import { nonNegativeFinite, safeDeltaMs, saturatingAdd } from '@/runtime/utils/numeric';
import { gameConfig } from '@/config/game';

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
  /**
   * Koşu içi doğum sayacı. Örnek yönetici koşu başına yeniden kurulduğu için
   * aynı seed aynı sırayı üretir — ayrışma yönleri replay'de tekrarlanır.
   */
  private spawnSequence = 0;
  private spawnTimer = 0;
  private currentWave = 1;
  /**
   * Hareketi DIŞARIDAN sürülen düşmanlar (Elite/Boss). Normal davranış
   * döngüsünden muaf tutulur; çarpışma ve temizlik için listede kalır.
   */
  private readonly externallyDriven = new Set<Enemy>();
  /** Reusable buffer — hedef seçimi her frame yeni Vector2 yaratmaz. */
  private readonly targetBuf: Vector2 = Vector2.zero();
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly effects: EffectManager,
    private readonly random: Random,
    private readonly callbacks: EnemyManagerCallbacks = {},
    /** Kalite kademesi görsel anahtarları; verilmezse tam kalite. */
    private readonly visualsProvider?: EntityVisualQualityProvider,
  ) {}

  /** Aktif dalga — spawn havuzunu belirler. */
  setWave(wave: number): void {
    if (!Number.isFinite(wave)) return;
    this.currentWave = Math.max(1, Math.floor(wave));
    // Önceki dalganın kalan süresi yeni dalgada toplu spawn üretmesin.
    this.spawnTimer = 0;
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
    if (this.destroyed) return;
    const safeDelta = safeDeltaMs(delta);
    this.spawnTimer = saturatingAdd(this.spawnTimer, safeDelta);
    const spawnInterval = nonNegativeFinite(difficulty.spawnIntervalMs);
    const maxEnemies = Number.isFinite(difficulty.maxEnemies)
      ? Math.max(0, Math.floor(difficulty.maxEnemies))
      : 0;
    if (spawnInterval > 0 && this.enemies.length < maxEnemies) {
      let attempts = 0;
      while (
        this.spawnTimer >= spawnInterval &&
        this.enemies.length < maxEnemies &&
        attempts < gameConfig.maxTimerCatchUpSteps
      ) {
        const spawned = this.spawnFromCatalog(border, playerPos, difficulty, grid);
        if (spawned) {
          this.spawnTimer -= spawnInterval;
        } else {
          // Spawn başarısız (oyuncuya çok yakın) — kısa bekleme sonra tekrar dene.
          this.spawnTimer = Math.min(
            this.spawnTimer,
            spawnInterval * enemyConfig.spawnRetryIntervalFactor,
          );
          break;
        }
        attempts++;
      }
      if (attempts >= gameConfig.maxTimerCatchUpSteps && this.spawnTimer >= spawnInterval) {
        this.spawnTimer %= spawnInterval;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Elite/Boss'un hareketini kendi kontrolcüsü sürer; burada yalnızca
      // listede tutulur (çarpışma, temizlik, spatial grid).
      if (!this.externallyDriven.has(enemy)) {
        const target = this.pickTarget(enemy, playerPos, context.turret ?? null);
        const spawnRequest = enemy.update(safeDelta, target, border, grid, this.random);
        if (spawnRequest) {
          this.spawnMinions(enemy, spawnRequest, difficulty, grid);
        }
        // Separation sırasında grid'de eski hücre tutulmasın. Böylece bir
        // düşman hücre sınırını geçtiğinde sonraki düşman onu kaçırmaz.
        if (typeof grid.update === 'function') grid.update(enemy);
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
    stats?: HellStatBlock,
  ): Enemy {
    if (this.destroyed) {
      throw new Error('[EnemyManager] yok edilmiş yöneticide düşman doğurulamaz');
    }
    const enemy = this.createEnemy(definition, x, y, difficulty, stats);
    this.externallyDriven.add(enemy);
    return enemy;
  }

  /** Bir doğurma isteğini karşılar — Elite/Boss kontrolcüleri için genel kapı. */
  spawnMinionsFor(parent: Enemy, request: MinionSpawnRequest, difficulty: DifficultyState): void {
    this.spawnMinions(parent, request, difficulty);
  }

  /**
   * Dalga geçişinde sahnedeki düşmanları temizler.
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
      if (!enemy.isAlive) {
        this.externallyDriven.delete(enemy);
        const dead = this.enemies.pop();
        if (dead && i < this.enemies.length) this.enemies[i] = dead;
        continue;
      }

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
    if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y)) {
      this.targetBuf.set(enemy.x, enemy.y);
      return this.targetBuf;
    }
    if (!turret || !turret.isAlive || !Number.isFinite(turret.x) || !Number.isFinite(turret.y)) {
      return playerPos;
    }

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
    grid?: SpatialGrid,
  ): boolean {
    if (!Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.y)) return false;
    const definition = pickEnemyDefinition(this.random, this.currentWave);
    if (!definition) return false;

    const position = this.pickEdgePosition(border, definition.radius);

    // Oyuncuya çok yakın spawn etme
    const distToPlayer = Math.hypot(position.x - playerPos.x, position.y - playerPos.y);
    if (distToPlayer < enemyConfig.spawnMinPlayerDistance) return false;

    const enemy = this.createEnemy(definition, position.x, position.y, difficulty);
    if (grid && typeof grid.insert === 'function') grid.insert(enemy);
    return true;
  }

  /** Swarmer'ın doğurma isteğini karşılar — minion'lar ebeveyne kaydedilir. */
  private spawnMinions(
    parent: Enemy,
    request: MinionSpawnRequest,
    difficulty: DifficultyState,
    grid?: SpatialGrid,
  ): void {
    if (this.destroyed || !parent.isAlive || !request || !Array.isArray(request.angles)) return;
    const radius = nonNegativeFinite(request.radius);
    const count = Math.min(request.angles.length, Math.floor(nonNegativeFinite(request.count)));
    const maxEnemies = Number.isFinite(difficulty.maxEnemies)
      ? Math.max(0, Math.floor(difficulty.maxEnemies))
      : 0;
    let definition: EnemyDefinition;
    try {
      definition = getEnemyDefinition(request.minionId);
    } catch (error) {
      console.warn('[EnemyManager] Geçersiz minion tanımı yok sayıldı:', error);
      return;
    }

    for (let i = 0; i < count; i++) {
      const angle = request.angles[i];
      if (!Number.isFinite(angle)) continue;
      // Sürü, normal spawn ile aynı dalga limitini paylaşır: aksi halde
      // minion'lar tavanı doldurup normal spawn'ı tamamen kilitleyebilirdi.
      if (this.enemies.length >= maxEnemies) return;

      const x = parent.x + Math.cos(angle) * radius;
      const y = parent.y + Math.sin(angle) * radius;
      const minion = this.createEnemy(definition, x, y, difficulty);
      if (grid && typeof grid.insert === 'function') grid.insert(minion);
      parent.registerMinion(minion);
    }
  }

  private createEnemy(
    definition: EnemyDefinition,
    x: number,
    y: number,
    difficulty: DifficultyState,
    stats?: HellStatBlock,
  ): Enemy {
    const enemy = new Enemy(this.scene, x, y, this.effects, {
      definition,
      stats: stats ?? createEnemyStats(definition, difficulty),
      scoreValue: definition.scoreValue * difficulty.scoreMultiplier,
      // Ödül ölümün KENDİSİNE bağlı: kule/zincir/ateş ölümleri de sayılır.
      onDeath: (killed) => this.callbacks.onEnemyDeath?.(killed),
      spawnIndex: this.spawnSequence++,
      visualsProvider: this.visualsProvider,
    });
    this.enemies.push(enemy);

    diagnostics?.recordEvent('enemySpawn', { x, y, id: definition.id });

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
    if (this.destroyed) return;
    this.destroyed = true;
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies.length = 0;
    this.externallyDriven.clear();
  }
}
