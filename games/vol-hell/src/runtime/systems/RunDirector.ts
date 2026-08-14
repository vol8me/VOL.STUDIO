import type Phaser from 'phaser';
import type { Random, Vector2 } from '@volstudio/core';
import { Diagnostics } from '@volstudio/core';
import type { Border } from '@/runtime/entity/Border';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
import { FluxPickupManager } from '@/runtime/entity/FluxPickupManager';
import type { EffectManager } from './EffectManager';
import { RunEconomy } from './RunEconomy';
import { WaveManager } from './WaveManager';

export interface RunDirectorDeps {
  scene: Phaser.Scene;
  border: Border;
  effects: EffectManager;
  random: Random;
  enemyManager: EnemyManager;
}

export interface RunDirectorCallbacks {
  /** Spark eşiği aşıldı — kart seçim ekranı buna bağlanır. */
  onLevelUp?: (level: number) => void;
  /** Dalga bitti — dükkan ekranı buna bağlanır. */
  onShopOpen?: (wave: number) => void;
  /** Elite dalgası (uygulaması Aşama 3). */
  onEliteWave?: (wave: number) => void;
  /** Boss dalgası (uygulaması Aşama 3). */
  onBossWave?: (wave: number) => void;
  /** Tüm dalgalar tamamlandı. */
  onRunComplete?: () => void;
}

/**
 * Koşu yaşam döngüsü — dalgalar, ekonomi ve yerdeki Flux tek elden yönetilir.
 *
 * `GameScene` bu üç sistemi tek tek tutup birbirine bağlıyordu; sahne dosyası
 * hem oynanış hem HUD hem ses hem koşu akışını taşıdığı için okunaksız
 * büyüyordu. Sahne artık koşu akışını TEK bir nesne üzerinden sürüyor.
 */
export class RunDirector {
  readonly economy: RunEconomy;
  private readonly waves: WaveManager;
  private readonly pickups: FluxPickupManager;
  private readonly enemyManager: EnemyManager;

  constructor(deps: RunDirectorDeps, callbacks: RunDirectorCallbacks = {}) {
    this.enemyManager = deps.enemyManager;

    this.economy = new RunEconomy({
      onLevelUp: (level) => {
        Diagnostics.getInstance()?.recordEvent('sparkLevelUp', { level });
        callbacks.onLevelUp?.(level);
      },
    });

    this.pickups = new FluxPickupManager(deps.scene, deps.border, deps.effects, deps.random, {
      onCollected: (amount) => this.economy.addFlux(amount),
    });

    this.waves = new WaveManager({
      onWaveStart: (wave) => {
        this.enemyManager.setWave(wave);
        Diagnostics.getInstance()?.recordEvent('waveStart', { wave });
      },
      onWaveEnd: (wave) => {
        Diagnostics.getInstance()?.recordEvent('shopOpen', { wave, flux: this.economy.getFlux() });
        callbacks.onShopOpen?.(wave);
      },
      onEliteWave: (wave) => {
        Diagnostics.getInstance()?.recordEvent('eliteWave', { wave });
        callbacks.onEliteWave?.(wave);
      },
      onBossWave: (wave) => {
        Diagnostics.getInstance()?.recordEvent('bossWave', { wave });
        callbacks.onBossWave?.(wave);
      },
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

  update(deltaMs: number, playerPos: Vector2): void {
    this.waves.update(deltaMs);
    this.pickups.update(deltaMs, playerPos);
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

  isRunComplete(): boolean {
    return this.waves.isRunComplete();
  }

  /** Sahnedeki toplanmamış Flux parçası sayısı — diagnostic için. */
  getPickupCount(): number {
    return this.pickups.getActiveCount();
  }

  destroy(): void {
    this.pickups.destroy();
  }
}
