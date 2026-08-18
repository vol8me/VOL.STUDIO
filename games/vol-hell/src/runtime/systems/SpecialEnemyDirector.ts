import type { Random, StatBlock, Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import { BOSS_ENEMY_ID, ELITE_ENEMY_ID, getEnemyDefinition } from '@/config/enemies/catalog';
import type { Border } from '@/runtime/entity/Border';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
import { EliteController } from '@/runtime/entity/EliteController';
import { BossController } from '@/runtime/entity/BossController';
import { computeBossScaling, scaleBossStats, type BossScaling } from '@/runtime/entity/bossScaling';
import { createEnemyStats } from '@/runtime/entity/enemyStats';
import type { SpatialGrid } from './SpatialGrid';
import type { EffectManager } from './EffectManager';
import type { TelegraphManager } from './TelegraphManager';
import type { DifficultyState } from './DifficultyCalculator';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';

export interface SpecialEnemyDirectorDeps {
  enemyManager: EnemyManager;
  effects: EffectManager;
  telegraphs: TelegraphManager;
  border: Border;
  random: Random;
  playerStats: StatBlock;
  damagePlayer: (amount: number) => void;
  getPlayerPosition: () => Vector2;
  getDifficulty: () => DifficultyState;
}

export interface SpecialEnemyDirectorCallbacks {
  /** Elite ya da Boss öldü — `WaveManager` engeli kaldırır. */
  onBlockerDefeated?: () => void;
}

/**
 * Elite ve Boss'un yaşam döngüsü — spawn, güncelleme, ölüm sinyali.
 *
 * Bu iki düşman "zorunlu engel"dir: yaşadıkları dalga, süre dolsa bile
 * onlar ölene kadar bitmez. Engel sinyalini tek elden buradan vermek, sinyalin
 * `EnemyManager`, `WaveManager` ve iki ayrı kontrolcü arasında dağılmasını
 * önler.
 *
 * Kontrolcüler burada TUTULUR ama içleri bilinmez: `EliteController` ve
 * `BossController` birbirinden ve `Enemy`'den bağımsızdır.
 */
export class SpecialEnemyDirector {
  private elite: EliteController | null = null;
  private boss: BossController | null = null;
  /** Boss'un spawn anında dondurulan ölçekleme profili — HUD/test okur. */
  private bossScaling: BossScaling | null = null;

  constructor(
    private readonly deps: SpecialEnemyDirectorDeps,
    private readonly callbacks: SpecialEnemyDirectorCallbacks = {},
  ) {}

  /**
   * Bir zorunlu engel şu an hayatta mı? `WaveManager` bunu okur.
   * İkisi de yoksa dalga normal seyrinde ilerler.
   */
  isBlockerAlive(): boolean {
    return this.elite?.isAlive === true || this.boss?.isAlive === true;
  }

  /** Sahnedeki Elite — HUD göstergesi için. */
  getElite(): Enemy | null {
    return this.elite?.isAlive ? this.elite.getEnemy() : null;
  }

  /** Sahnedeki Boss — HUD göstergesi için. */
  getBoss(): Enemy | null {
    return this.boss?.isAlive ? this.boss.getEnemy() : null;
  }

  /** Boss'un spawn anındaki ölçekleme profili (yoksa null). */
  getBossScaling(): BossScaling | null {
    return this.bossScaling;
  }

  /** Elite dalgası başladı — arenanın kenarında Warden doğar. */
  spawnElite(): void {
    if (this.elite?.isAlive) return;

    const definition = getEnemyDefinition(ELITE_ENEMY_ID);
    const position = this.pickSpawnPosition(definition.radius);
    const enemy = this.deps.enemyManager.spawnSpecial(
      definition,
      position.x,
      position.y,
      this.deps.getDifficulty(),
    );

    this.deps.effects.play('eliteSpawn', position.x, position.y);
    if (gameAudio) {
      void gameAudio.playSfx('eliteSpawn', { volume: sfxVolumes.eliteSpawn });
    }
    Diagnostics.getInstance()?.recordEvent('eliteSpawn', { x: position.x, y: position.y });

    this.elite = new EliteController(enemy, definition, {
      effects: this.deps.effects,
      telegraphs: this.deps.telegraphs,
      random: this.deps.random,
      spawnMinions: (parent, request) =>
        this.deps.enemyManager.spawnMinionsFor(parent, request, this.deps.getDifficulty()),
    });
  }

  /**
   * Boss dalgası başladı — Sovereign, oyuncunun O ANKİ gücüne oranlı
   * stat'larla doğar. Ölçekleme burada BİR KEZ hesaplanır ve sabit
   * sayılara dönüştürülür; sonraki kartlar boss'u güçlendirmez.
   */
  spawnBoss(): void {
    if (this.boss?.isAlive) return;

    const definition = getEnemyDefinition(BOSS_ENEMY_ID);
    const scaling = computeBossScaling(this.deps.playerStats);
    this.bossScaling = scaling;

    // Zorluk eğrisinin çarpanları da uygulanır, ÜSTÜNE oyuncu ölçeklemesi
    // biner: boss hem koşunun geç saatinde hem güçlü build karşısında zorlu.
    const difficulty = this.deps.getDifficulty();
    const difficultyStats = createEnemyStats(definition, difficulty);
    const stats = scaleBossStats(
      {
        damage: difficultyStats.getValue('damage'),
        speed: difficultyStats.getValue('speed'),
        health: difficultyStats.getValue('health'),
        fireRate: difficultyStats.getValue('fireRate'),
      },
      scaling,
    );

    const bounds = this.deps.border.bounds;
    const enemy = this.deps.enemyManager.spawnSpecial(
      definition,
      bounds.centerX,
      bounds.top + definition.radius * 3,
      difficulty,
      stats,
    );

    this.deps.effects.play('bossSpawn', enemy.x, enemy.y);
    if (gameAudio) {
      void gameAudio.playSfx('bossSpawn', { volume: sfxVolumes.bossSpawn });
    }
    Diagnostics.getInstance()?.recordEvent('bossSpawn', {
      powerRatio: scaling.playerPowerRatio,
      health: stats.getValue('health'),
      damage: stats.getValue('damage'),
    });

    this.boss = new BossController(enemy, definition, {
      effects: this.deps.effects,
      telegraphs: this.deps.telegraphs,
      random: this.deps.random,
      damagePlayer: this.deps.damagePlayer,
      getPlayerPosition: this.deps.getPlayerPosition,
      spawnMinions: (parent, request) =>
        this.deps.enemyManager.spawnMinionsFor(parent, request, this.deps.getDifficulty()),
    });
  }

  update(deltaMs: number, playerPos: Vector2, grid: SpatialGrid): void {
    if (this.elite) {
      if (this.elite.isAlive) {
        this.elite.update(deltaMs, playerPos, this.deps.border, grid);
      } else {
        this.elite.destroy();
        this.elite = null;
        this.reportBlockerDefeated();
      }
    }

    if (this.boss) {
      if (this.boss.isAlive) {
        this.boss.update(deltaMs, playerPos, this.deps.border, grid);
      } else {
        const position = this.boss.getEnemy();
        this.deps.effects.play('bossDefeat', position.x, position.y);
        if (gameAudio) {
          void gameAudio.playSfx('bossDown', { volume: sfxVolumes.bossDown });
        }
        this.boss.destroy();
        this.boss = null;
        this.reportBlockerDefeated();
      }
    }
  }

  destroy(): void {
    this.elite?.destroy();
    this.boss?.destroy();
    this.elite = null;
    this.boss = null;
    this.bossScaling = null;
  }

  /** Engel öldü — ama DİĞER engel hâlâ ayaktaysa dalga açılmaz. */
  private reportBlockerDefeated(): void {
    if (this.isBlockerAlive()) return;
    this.callbacks.onBlockerDefeated?.();
  }

  /** Arenanın kenarında, oyuncudan uzak bir doğum noktası. */
  private pickSpawnPosition(radius: number): { x: number; y: number } {
    const bounds = this.deps.border.bounds;
    const player = this.deps.getPlayerPosition();
    // Oyuncunun bulunduğu yarının KARŞI tarafından doğar: elite oyuncunun
    // üstünde belirmesin, oyuncu ona doğru ilerlemek zorunda kalsın.
    const y = player.y > bounds.centerY ? bounds.top + radius * 2 : bounds.bottom - radius * 2;
    return { x: bounds.centerX, y };
  }
}
