import type Phaser from 'phaser';
import type { Random, StatBlock, Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import type { Border } from '@/runtime/entity/Border';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
import { FluxPickupManager } from '@/runtime/entity/FluxPickupManager';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { EffectManager } from './EffectManager';
import type { TelegraphManager } from './TelegraphManager';
import type { SpatialGrid } from './SpatialGrid';
import type { DifficultyState } from './DifficultyCalculator';
import { RunEconomy } from './RunEconomy';
import { WaveManager } from './WaveManager';
import { SpecialEnemyDirector } from './SpecialEnemyDirector';

export interface RunDirectorDeps {
  scene: Phaser.Scene;
  border: Border;
  effects: EffectManager;
  telegraphs: TelegraphManager;
  random: Random;
  enemyManager: EnemyManager;
  bulletManager: BulletManager;
  playerStats: StatBlock;
  damagePlayer: (amount: number) => void;
  getPlayerPosition: () => Vector2;
  getDifficulty: () => DifficultyState;
  /** Flux parçası toplandığında — ses vb. geri bildirim. */
  onFluxCollected?: () => void;
}

export interface RunDirectorCallbacks {
  /** Spark eşiği aşıldı — kart seçim ekranı buna bağlanır. */
  onLevelUp?: (level: number) => void;
  /** Dalga bitti — dükkan ekranı buna bağlanır. */
  onShopOpen?: (wave: number) => void;
  /** Yeni dalga başladı — HUD bildirimi buna bağlanır. */
  onWaveStart?: (wave: number) => void;
  /** Tüm dalgalar tamamlandı (Boss öldü) — zafer ekranı. */
  onRunComplete?: () => void;
}

/**
 * Koşu yaşam döngüsü — dalgalar, ekonomi, yerdeki Flux ve özel düşmanlar.
 *
 * `GameScene` bu sistemleri tek tek tutup birbirine bağlıyordu; sahne dosyası
 * hem oynanış hem HUD hem ses hem koşu akışını taşıdığı için okunaksız
 * büyüyordu. Sahne artık koşu akışını TEK bir nesne üzerinden sürüyor.
 */
export class RunDirector {
  readonly economy: RunEconomy;
  private readonly waves: WaveManager;
  private readonly pickups: FluxPickupManager;
  private readonly enemyManager: EnemyManager;
  private readonly bulletManager: BulletManager;
  private readonly telegraphs: TelegraphManager;
  private readonly specials: SpecialEnemyDirector;

  constructor(deps: RunDirectorDeps, callbacks: RunDirectorCallbacks = {}) {
    this.enemyManager = deps.enemyManager;
    this.bulletManager = deps.bulletManager;
    this.telegraphs = deps.telegraphs;

    this.economy = new RunEconomy({
      onLevelUp: (level) => {
        Diagnostics.getInstance()?.recordEvent('sparkLevelUp', { level });
        callbacks.onLevelUp?.(level);
      },
    });

    this.pickups = new FluxPickupManager(deps.scene, deps.border, deps.effects, deps.random, {
      onCollected: (amount) => {
        this.economy.addFlux(amount);
        deps.onFluxCollected?.();
      },
    });

    this.specials = new SpecialEnemyDirector(
      {
        enemyManager: deps.enemyManager,
        effects: deps.effects,
        telegraphs: deps.telegraphs,
        border: deps.border,
        random: deps.random,
        playerStats: deps.playerStats,
        damagePlayer: deps.damagePlayer,
        getPlayerPosition: deps.getPlayerPosition,
        getDifficulty: deps.getDifficulty,
      },
      {
        // Engel öldü — süre çoktan dolduysa dalga BU AN biter.
        onBlockerDefeated: () => this.waves.notifyBlockerDefeated(),
      },
    );

    this.waves = new WaveManager({
      isBlockerAlive: () => this.specials.isBlockerAlive(),
      onWaveStart: (wave) => {
        this.enemyManager.setWave(wave);
        Diagnostics.getInstance()?.recordEvent('waveStart', { wave });
        callbacks.onWaveStart?.(wave);
      },
      onWaveClear: (wave) => this.clearArena(wave),
      onWaveEnd: (wave) => {
        Diagnostics.getInstance()?.recordEvent('shopOpen', { wave, flux: this.economy.getFlux() });
        callbacks.onShopOpen?.(wave);
      },
      onEliteWave: () => this.specials.spawnElite(),
      onBossWave: () => this.specials.spawnBoss(),
      onRunComplete: () => {
        Diagnostics.getInstance()?.recordEvent('runComplete', { flux: this.economy.getFlux() });
        callbacks.onRunComplete?.();
      },
    });
  }

  /** Koşuyu ilk dalgadan başlatır. */
  start(): void {
    this.waves.start();
  }

  update(deltaMs: number, playerPos: Vector2, grid: SpatialGrid): void {
    this.waves.update(deltaMs);
    this.pickups.update(deltaMs, playerPos);
    this.telegraphs.update(deltaMs);
    this.specials.update(deltaMs, playerPos, grid);
  }

  /**
   * Düşman ölümü — Spark anında sayaca, Flux yere pickup olarak düşer.
   * Skor sahnenin kendi sorumluluğu (koşu ekonomisine ait değil).
   */
  onEnemyKilled(enemy: Enemy): void {
    this.economy.addSpark(enemy.sparkReward);
    this.pickups.drop(enemy.x, enemy.y, enemy.fluxReward);
  }

  getCurrentWave(): number {
    return this.waves.getCurrentWave();
  }

  getWaveRemainingMs(): number {
    return this.waves.getRemainingMs();
  }

  /** Süre doldu ama dalga bir engelin ölmesini bekliyor mu? */
  isAwaitingBlocker(): boolean {
    return this.waves.isAwaitingBlocker();
  }

  /** Sahnedeki zorunlu engel (Elite ya da Boss) — HUD göstergesi için. */
  getBlocker(): Enemy | null {
    return this.specials.getBoss() ?? this.specials.getElite();
  }

  isRunComplete(): boolean {
    return this.waves.isRunComplete();
  }

  /** Sahnedeki toplanmamış Flux parçası sayısı — diagnostic için. */
  getPickupCount(): number {
    return this.pickups.getActiveCount();
  }

  destroy(): void {
    this.pickups.destroy();
    this.specials.destroy();
  }

  /**
   * Normal dalga sonu temizliği — sonraki dalga temiz sahnede başlar.
   *
   * Kalan düşmanlar, uçan mermiler, bekleyen telegraph'lar ve YERDE KALAN
   * Flux silinir. Bu bir ceza değil: oyuncu can/skor kaybetmez, düşmanlar
   * ödül de vermez. Sonraki dalga tamamen temiz bir sahneyle başlar.
   *
   * Zorunlu-engel dalgalarında `WaveManager` bunu ZATEN çağırmaz.
   */
  private clearArena(wave: number): void {
    const enemies = this.enemyManager.clearRegularEnemies();
    const bullets = this.bulletManager.clearAll();
    const pickups = this.pickups.clearAll();
    // Bekleyen saldırı uyarıları da silinir: dalga bittikten sonra görünmez
    // bir kaynaktan hasar gelmesin.
    this.telegraphs.cancelAll();

    Diagnostics.getInstance()?.recordEvent('waveClear', { wave, enemies, bullets, pickups });
  }
}
