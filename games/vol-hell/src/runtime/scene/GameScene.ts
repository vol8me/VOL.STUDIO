import Phaser from 'phaser';
import {
  Bar,
  InputManager,
  Vector2,
  i18next,
  type InputState,
  type LoadingScreen,
} from '@volstudio/core';
import { BaseScene } from './BaseScene';
import { Player } from '@/runtime/entity/Player';
import { Border } from '@/runtime/entity/Border';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { BulletManager } from '@/runtime/entity/BulletManager';

import { playerConfig } from '@/config/player';
import { bulletConfig } from '@/config/bullet';
import { enemyConfig } from '@/config/enemy';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { physicsConfig } from '@/config/physics';
import { ambientTrackKeys, deathTrackKeys, musicConfig, musicTracks, sfxVolumes } from '@/config';
import { gameAudio, audioSettings, gameStats } from '@/app/services';
import type { RunResult } from '@/app/GameStats';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import { ParticlePool } from '@/runtime/systems/ParticlePool';
import { CollisionResolver } from '@/runtime/systems/CollisionResolver';
import { getDifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { Diagnostics } from '@volstudio/core';
import { PauseScreen } from './PauseScreen';
import { DeathScreen } from './DeathScreen';
import { HUDStats } from '@/runtime/ui/HUDStats';

/**
 * Ana oyun sahnesi — bullet-hell iskeleti.
 * Player + InputManager + Border + BulletManager + EnemyManager + HUD içerir.
 */
export class GameScene extends BaseScene {
  private player!: Player;
  private inputManager!: InputManager;
  private border!: Border;
  private bulletManager!: BulletManager;
  private enemyManager!: EnemyManager;
  private healthBar!: Bar;
  private dashBar!: Bar;
  private healthBarContainer!: HTMLElement;
  private dashBarContainer!: HTMLElement;
  private loadingScreen: LoadingScreen | null = null;
  private spatialGrid: SpatialGrid = new SpatialGrid(
    Math.max(enemyConfig.radius, bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
  );
  private particlePool!: ParticlePool;
  private prevHealth = 0;
  private prevDashCharge = 1;
  private diagnostics?: Diagnostics;
  private hudStats!: HUDStats;
  private score = 0;
  private kills = 0;
  private elapsedTimeMs = 0;
  private isDeathInProgress = false;
  private lastEnemyKillShake = 0;
  private lastPlayerDamageShake = 0;
  // Reusable buffer'lar — her frame yeni obje yaratmaz
  private readonly moveDirBuf: Vector2 = Vector2.zero();
  private readonly aimDirBuf: Vector2 = Vector2.zero();
  private collisionResolver!: CollisionResolver;
  private pauseScreen: PauseScreen | null = null;
  private deathScreen: DeathScreen | null = null;
  private isPaused = false;
  private escKey!: Phaser.Input.Keyboard.Key;
  private ambientState: 'calm' | 'tense' = 'calm';
  private ambientStateTimer = 0;
  private isAmbientLoaded = false;

  constructor() {
    super({ key: 'Game' });
  }

  protected override onLanguageChanged(): void {
    this.healthBar.setLabel(i18next.t('volhell:hud.health'));
    this.dashBar.setLabel(i18next.t('volhell:hud.dash'));
  }

  protected createScene(data?: unknown): void {
    // Phaser sahne örneğini yeniden kullanır; alan başlatıcıları restart'ta
    // ÇALIŞMAZ. Sıfırlanması gereken her alan tek bir yerde toplanır ki
    // yeni alan eklendiğinde unutulmasın.
    this.resetSceneState();
    const { loadingScreen } = (data ?? {}) as { loadingScreen?: LoadingScreen };
    this.loadingScreen = loadingScreen ?? null;

    // Müzik ve ambiyans track'lerini önceden yükler.
    for (const key of deathTrackKeys) {
      void gameAudio.loadMusic(musicTracks[key]);
    }
    // Her iki ambiyans track'ini de yükle — calm ve tense.
    void Promise.all(ambientTrackKeys.map((key) => gameAudio.loadAmbient(musicTracks[key])))
      .then(() => {
        // Oyuna hızlıca restart/MainMenu dönüşünde arka plan sesi çalmaya başlamasın.
        if (!this.scene.isActive(this.scene.key)) return;
        this.isAmbientLoaded = true;
        gameAudio.stopMusic(musicConfig.ambient.menuStopFadeSec);
        void gameAudio.playAmbient(musicConfig.ambient.calmTrackId, {
          fadeIn: musicConfig.ambient.fadeInSec,
        });
      })
      .catch((error: unknown) => {
        // Ambiyans yüklenemezse oyun sessiz devam eder; sahne durmaz.
        console.warn('[GameScene] Ambiyans yüklenemedi:', error);
      });

    // SFX'leri arka planda önbelleğe al.
    void gameAudio.loadAllSfx();

    // Border — kameradan küçük alan
    this.border = new Border(this);

    // Partikül havuzu — GameObject yaratmak yerine reuse eder
    this.particlePool = new ParticlePool(this, gameConfig.particlePoolSize);

    // Oyuncu — border merkezinde başlar
    this.player = new Player(
      this,
      this.border.bounds.centerX,
      this.border.bounds.centerY,
      this.particlePool,
    );
    this.player.setBorder(this.border);

    // Input — InputManager hem touch hem PC input'u yönetir
    this.inputManager = new InputManager(this);

    // Mermi ve düşman yöneticileri
    this.bulletManager = new BulletManager(this, this.particlePool);
    this.enemyManager = new EnemyManager(this, this.particlePool);

    this.collisionResolver = new CollisionResolver(
      this.player,
      this.bulletManager,
      this.enemyManager,
      this.spatialGrid,
      this.border,
      {
        onEnemyKilled: (value) => this.onEnemyKilled(value),
        onPlayerDamaged: () => this.onPlayerDamaged(),
      },
    );

    // HUD olculeri config'te tek kaynak; CSS bunlari custom property olarak okur.
    this.ui.element.style.setProperty('--vol-hud-bar-width', `${uiConfig.hud.barWidth}px`);
    this.ui.element.style.setProperty(
      '--vol-hud-dash-offset',
      `${uiConfig.hud.dashBarTopOffset}px`,
    );

    // Can barı
    this.healthBarContainer = document.createElement('div');
    this.healthBarContainer.className = 'vol-hud__slot vol-hud__slot--health';

    this.healthBar = new Bar({
      variant: 'health',
      max: playerConfig.maxHealth,
      value: playerConfig.maxHealth,
      lowThreshold: uiConfig.lowHealthThreshold,
      label: i18next.t('volhell:hud.health'),
    });
    this.healthBarContainer.appendChild(this.healthBar.element);
    this.ui.mount(this.healthBarContainer);
    this.prevHealth = playerConfig.maxHealth;

    // Dash barı
    this.dashBarContainer = document.createElement('div');
    this.dashBarContainer.className = 'vol-hud__slot vol-hud__slot--dash';

    this.dashBar = new Bar({
      variant: 'stamina',
      max: 1,
      value: 1,
      animateMs: uiConfig.hud.dashBar.animateMs,
      label: i18next.t('volhell:hud.dash'),
    });
    this.dashBarContainer.appendChild(this.dashBar.element);
    this.ui.mount(this.dashBarContainer);
    this.prevDashCharge = 1;

    // Skor / öldürme / süre HUD'u
    this.hudStats = new HUDStats(this.ui.element);
    this.resetRun();

    // Pause ekranı — UIRoot içine mount et, böylece box-sizing ve temel UI stilleri uygulanır
    this.pauseScreen = new PauseScreen(this.ui.element, audioSettings, {
      onResume: () => this.resumeGame(),
      onRestart: () => {
        void gameAudio.playSfx('restart', { volume: sfxVolumes.restart });
        this.scene.restart();
      },
      onMainMenu: () => {
        void gameAudio.playSfx('back', { volume: sfxVolumes.back });
        this.scene.start('MainMenu');
      },
    });

    // Ölüm ekranı — UIRoot içine mount et, böylece box-sizing ve temel UI stilleri uygulanır
    this.deathScreen = new DeathScreen(this.ui.element, {
      onRestart: () => {
        void gameAudio.playSfx('restart', { volume: sfxVolumes.restart });
        this.scene.restart();
      },
      onMainMenu: () => {
        void gameAudio.playSfx('back', { volume: sfxVolumes.back });
        this.scene.start('MainMenu');
      },
    });

    // ESC tuşu ile pause
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('[GameScene] Keyboard plugin etkin değil; ESC ile duraklatma kurulamıyor');
    }
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.togglePause());

    // Yükleme tamamlandı — %100 yapıp gizle
    if (this.loadingScreen) {
      this.loadingScreen.update(100);
      this.loadingScreen.hide();
    }

    // Geliştirme/diagnostic overlay — createVolGame'de ?debug/?perf varsa oluşur
    this.diagnostics = Diagnostics.getInstance() ?? undefined;
    this.diagnostics?.setScene(this.scene.key);
    this.diagnostics?.markResume();
  }

  update(_time: number, delta: number): void {
    if (this.isPaused) {
      // beginFrame() ilk isi counts.clear() — duraklamada cagirmak overlay'deki
      // tum sayaclari (dusman, mermi, partikul) tam da incelenmek istenen anda siler.
      return;
    }

    this.diagnostics?.beginFrame();

    const dt = Math.min(delta, gameConfig.maxDeltaMs);
    this.elapsedTimeMs += dt;

    this.diagnostics?.startStage('input');
    this.inputManager.update(dt);
    this.diagnostics?.setInput(this.inputManager.getDebugSnapshot());
    this.diagnostics?.endStage('input');

    // Input state frame basina BIR kez okunur. Iki ayri getState() cagrisi hem
    // gereksiz Vector2 uretiyor hem de iki farkli anlik goruntu yaratiyordu.
    const inputState = this.inputManager.getState(this.player.getPosition());

    this.diagnostics?.startStage('player');
    this.updatePlayer(dt, inputState);
    this.diagnostics?.endStage('player');

    const playerPos = this.player.getPosition();

    this.diagnostics?.startStage('fire');
    this.fire(playerPos, inputState);
    this.diagnostics?.endStage('fire');

    this.diagnostics?.startStage('entities');
    this.updateEntities(dt, playerPos, _time);
    this.diagnostics?.endStage('entities');

    this.diagnostics?.startStage('collision');
    this.collisionResolver.resolve(_time);
    this.diagnostics?.endStage('collision');

    this.diagnostics?.startStage('hud');
    this.updateHUD();
    this.diagnostics?.endStage('hud');

    this.diagnostics?.startStage('death');
    this.checkDeath();
    this.diagnostics?.endStage('death');

    this.diagnostics?.setCount('score', this.score);
    this.diagnostics?.setCount('kills', this.kills);
    this.diagnostics?.setCount('elapsedSeconds', Math.floor(this.elapsedTimeMs / 1000));
    this.diagnostics?.setCount('bullets', this.bulletManager.getBullets().length);
    this.diagnostics?.setCount('enemies', this.enemyManager.getEnemies().length);
    this.diagnostics?.setCount('particles', this.particlePool.getActiveCount());
    this.diagnostics?.setCount('gridCells', this.spatialGrid.getCellCount());

    this.updateAmbientState(dt);

    this.diagnostics?.endFrame();
  }

  private updatePlayer(delta: number, state: InputState): void {
    this.moveDirBuf.set(state.move.x, state.move.y);
    this.aimDirBuf.set(state.aim.x, state.aim.y);

    // Önce input uygula — dash update'ten önce tetiklenmeli (BUG-3 fix)
    this.player.setMoveDirection(this.moveDirBuf);

    if (state.dash && this.player.tryDash(this.aimDirBuf)) {
      void gameAudio.playSfx('dash', { volume: sfxVolumes.dash });
    }

    // Player update — dash dahil tüm hareket bu frame'de uygulanır
    this.player.update(delta);
  }

  private fire(playerPos: Vector2, state: InputState): void {
    if (state.fire && this.aimDirBuf.length() > 0) {
      if (this.bulletManager.tryFire(playerPos, this.aimDirBuf)) {
        void gameAudio.playSfx('fire', { volume: sfxVolumes.fire });
      }
    }
  }

  private updateEntities(delta: number, playerPos: Vector2, time: number): void {
    const difficulty = getDifficultyState(this.elapsedTimeMs);

    // Spatial grid'i bu frame için yeniden kur — enemy update'inden ÖNCE
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());

    // Mermi ve düşman güncelle — güncel pozisyon ve grid ile
    this.bulletManager.update(delta, this.border);
    this.enemyManager.update(delta, playerPos, this.border, time, this.spatialGrid, difficulty);

    // Grid'i enemy hareketinden sonra yeniden kur — çarpışma kontrolü güncel pozisyon kullanır
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());
    this.spatialGrid.trim();
  }

  private updateHUD(): void {
    const currentHealth = this.player.getHealth();
    if (currentHealth !== this.prevHealth) {
      this.healthBar.setValue(currentHealth);
      this.prevHealth = currentHealth;
    }

    const dashCharge = this.player.getDashChargeRatio();
    if (Math.abs(dashCharge - this.prevDashCharge) > uiConfig.hud.dashBar.updateThreshold) {
      this.dashBar.setValue(dashCharge);
      this.prevDashCharge = dashCharge;
    }

    this.hudStats.setScore(this.score);
    this.hudStats.setKills(this.kills);
    this.hudStats.setTime(this.elapsedTimeMs);
  }

  /**
   * Sahne örneği restart'ta yeniden kullanıldığı için alan başlatıcılarına
   * güvenilemez. create() başında çağrılır; HUD'a dokunmaz (henüz kurulmamış olabilir).
   */
  private resetSceneState(): void {
    this.isPaused = false;
    this.isDeathInProgress = false;
    this.isAmbientLoaded = false;
    this.ambientState = 'calm';
    this.ambientStateTimer = 0;
    this.lastEnemyKillShake = 0;
    this.lastPlayerDamageShake = 0;
    this.score = 0;
    this.kills = 0;
    this.elapsedTimeMs = 0;
  }

  /** Koşu sayaçlarını sıfırlar ve HUD'a yansıtır. */
  private resetRun(): void {
    this.resetSceneState();
    this.hudStats?.setScore(0);
    this.hudStats?.setKills(0);
    this.hudStats?.setTime(0);
  }

  private updateAmbientState(delta: number): void {
    if (this.isPaused || this.isDeathInProgress || !this.isAmbientLoaded) return;

    const enemyCount = this.enemyManager.getEnemies().length;
    const desired: 'calm' | 'tense' =
      enemyCount >= musicConfig.ambient.tenseEnemyThreshold ? 'tense' : 'calm';

    if (desired === this.ambientState) {
      this.ambientStateTimer = 0;
      return;
    }

    this.ambientStateTimer += delta;
    // Tehlikeye hızlı, sakinliğe temkinli geçiş — eşikler config'te.
    const thresholdMs =
      desired === 'calm' ? musicConfig.ambient.calmHoldMs : musicConfig.ambient.tenseHoldMs;
    if (this.ambientStateTimer < thresholdMs) return;

    this.ambientStateTimer = 0;
    this.ambientState = desired;
    const trackId =
      desired === 'tense' ? musicConfig.ambient.tenseTrackId : musicConfig.ambient.calmTrackId;
    void gameAudio.playAmbient(trackId, {
      crossfade: true,
      fadeIn: musicConfig.ambient.fadeInSec,
    });
  }

  private onEnemyKilled(scoreValue: number): void {
    this.kills += 1;
    this.score += Math.round(scoreValue);

    if (!audioSettings.isScreenShakeEnabled()) return;

    const now = this.time.now;
    const cooldown = gameConfig.shake.enemyDeath.cooldownMs;
    if (now - this.lastEnemyKillShake >= cooldown) {
      this.lastEnemyKillShake = now;
      const intensityScale = audioSettings.getScreenShakeIntensity();
      this.cameras.main.shake(
        gameConfig.shake.enemyDeath.durationMs,
        gameConfig.shake.enemyDeath.intensity * intensityScale,
      );
    }
  }

  private onPlayerDamaged(): void {
    if (!audioSettings.isScreenShakeEnabled()) return;

    const now = this.time.now;
    const cooldown = gameConfig.shake.playerDamage.cooldownMs;
    if (now - this.lastPlayerDamageShake >= cooldown) {
      this.lastPlayerDamageShake = now;
      const intensityScale = audioSettings.getScreenShakeIntensity();
      this.cameras.main.shake(
        gameConfig.shake.playerDamage.durationMs,
        gameConfig.shake.playerDamage.intensity * intensityScale,
      );
    }
  }

  private checkDeath(): void {
    if (!this.player.isAlive()) {
      void this.onPlayerDeath();
    }
  }

  private async submitRunSafely(): Promise<RunResult> {
    try {
      return await gameStats.submitRun(this.score, this.elapsedTimeMs, this.kills);
    } catch {
      // Depolama başarısız olsa bile oyun donmaz; eski rekorlarla ekran gösterilir.
      return {
        bestScore: gameStats.getBestScore(),
        bestTimeMs: gameStats.getBestTimeMs(),
        bestKills: gameStats.getBestKills(),
        totalKills: gameStats.getTotalKills(),
        isNewBestScore: false,
        isNewBestTime: false,
        isNewBestKills: false,
      };
    }
  }

  private async onPlayerDeath(): Promise<void> {
    // submitRun tamamlanana kadar tekrar çağrılmasın
    if (this.isDeathInProgress || this.deathScreen?.isVisible()) return;
    this.isDeathInProgress = true;

    try {
      this.isPaused = true;
      this.input.activePointer.reset();
      this.scene.pause();
      gameAudio.stopAmbient(musicConfig.ambient.deathStopFadeSec);
      const deathKey = deathTrackKeys[Math.floor(Math.random() * deathTrackKeys.length)];
      const deathTrack = musicTracks[deathKey];
      void gameAudio.playMusic(deathTrack.id, { fadeIn: musicConfig.death.fadeInSec });
      void gameAudio.playSfx('death', {
        volume: sfxVolumes.death,
        stopEvents: ['hurt', 'fire'],
      });

      const result = await this.submitRunSafely();
      this.deathScreen?.show({
        score: this.score,
        bestScore: result.bestScore,
        kills: this.kills,
        bestKills: result.bestKills,
        timeMs: this.elapsedTimeMs,
        bestTimeMs: result.bestTimeMs,
        totalKills: result.totalKills,
      });
    } catch (error) {
      // Beklenmedik bir hata (depolama/çeviri/DOM) ölüm ekranını bozarsa
      // oyun donmaz; ana menüye yönlendirilir ve hata loglanır.
      console.error('[GameScene] Ölüm işlemi başarısız:', error);
      this.scene.start('MainMenu');
    } finally {
      this.isDeathInProgress = false;
    }
  }

  private togglePause(): void {
    // Death screen aktifken pause toggle edilmez — ölü oyuncuyla oyun resume olmaz
    if (this.deathScreen?.isVisible()) return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    // Phaser activePointer'ı temizle — buton tıklaması son frame'de ateş tetiklemesin
    this.input.activePointer.reset();
    this.scene.pause();
    void gameAudio.playSfx('pause', { volume: sfxVolumes.pause });
    this.pauseScreen?.show();
  }

  private resumeGame(): void {
    if (!this.isPaused) return;
    // Death screen aktifken resume yapılamaz
    if (this.deathScreen?.isVisible()) return;
    this.isPaused = false;
    this.diagnostics?.markResume();
    this.scene.resume();
    void gameAudio.playSfx('resume', { volume: sfxVolumes.resume });
    this.pauseScreen?.hide();
  }

  protected override onSceneShutdown(): void {
    // Phaser GameObject'leri (player, bulletManager, enemyManager, border)
    // DisplayList.shutdown() tarafından zaten yok edilir — tekrar destroy etmeye gerek yok.
    // Burada sadece Phaser'ın temizlemediği kaynaklar temizlenir:
    // input listener'lar, DOM elementleri, i18n listener'ları ve timer'lar.
    gameAudio.stopAllSfx();
    gameAudio.stopMusic(1);
    gameAudio.stopAmbient(1);
    if (this.deathScreen) {
      this.deathScreen.destroy();
      this.deathScreen = null;
    }
    if (this.pauseScreen) {
      this.pauseScreen.destroy();
      this.pauseScreen = null;
    }
    if (this.particlePool) {
      this.particlePool.destroy();
    }
    this.inputManager.destroy();
    this.border.destroy();
    this.healthBar.destroy();
    this.dashBar.destroy();
    this.healthBarContainer.remove();
    this.dashBarContainer.remove();
    this.hudStats.destroy();
    this.diagnostics = undefined;
    if (this.loadingScreen) {
      this.loadingScreen.destroy();
      this.loadingScreen = null;
    }
  }
}
