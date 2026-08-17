import Phaser from 'phaser';
import {
  InputManager,
  Vector2,
  createRandom,
  Diagnostics,
  type InputState,
  type LoadingScreen,
  type Random,
} from '@volstudio/core';
import { BaseScene } from './BaseScene';
import { Player } from '@/runtime/entity/Player';
import { Border } from '@/runtime/entity/Border';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { BulletManager } from '@/runtime/entity/BulletManager';
import type { Enemy } from '@/runtime/entity/Enemy';

import { bulletConfig } from '@/config/bullet';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { physicsConfig } from '@/config/physics';
import { sfxVolumes } from '@/config';
import { BOSS_ENEMY_ID, getMaxEnemyRadius } from '@/config/enemies/catalog';
import { gameAudio, audioSettings, gameStats } from '@/app/services';
import type { RunResult } from '@/app/GameStats';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import { EffectManager } from '@/runtime/systems/EffectManager';
import { TelegraphManager } from '@/runtime/systems/TelegraphManager';
import { CollisionResolver } from '@/runtime/systems/CollisionResolver';
import { getDifficultyState, type DifficultyState } from '@/runtime/systems/DifficultyCalculator';
import { RunDirector } from '@/runtime/systems/RunDirector';
import { GameAudioDirector } from '@/runtime/systems/GameAudioDirector';
import { CardInventoryManager } from '@/runtime/systems/CardInventoryManager';
import { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import { ABILITY_SLOTS, type AbilitySlot } from '@/runtime/ability/types';
import { PauseScreen } from './PauseScreen';
import { DeathScreen, type RunOutcome } from './DeathScreen';
import { GameHud } from '@/runtime/ui/GameHud';
import { CardScreens } from '@/runtime/ui/CardScreens';

/** Q ve E — ability slotlarının klavye karşılığı. */
const SLOT_KEYS: Record<AbilitySlot, number> = {
  primary: Phaser.Input.Keyboard.KeyCodes.Q,
  secondary: Phaser.Input.Keyboard.KeyCodes.E,
};

/**
 * Ana oyun sahnesi — oynanış döngüsünü ve HUD'u bir arada tutar.
 *
 * Koşu akışı (`RunDirector`), ses (`GameAudioDirector`), ability katmanı
 * (`AbilityRuntime`) ve kart ekranları (`CardScreens`) ayrı sınıflarda yaşar;
 * sahne bunları kurar, her frame sürer ve aralarındaki bağlantıyı yapar.
 */
export class GameScene extends BaseScene {
  private player!: Player;
  private inputManager!: InputManager;
  private border!: Border;
  private bulletManager!: BulletManager;
  private enemyManager!: EnemyManager;
  private collisionResolver!: CollisionResolver;
  private effects!: EffectManager;
  private telegraphs!: TelegraphManager;
  private run!: RunDirector;
  private audio!: GameAudioDirector;
  private abilities!: AbilityRuntime;
  private cards!: CardInventoryManager;
  private runRandom!: Random;

  private hud!: GameHud;
  private cardScreens!: CardScreens;
  private loadingScreen: LoadingScreen | null = null;
  private pauseScreen: PauseScreen | null = null;
  private deathScreen: DeathScreen | null = null;

  // Hücre boyutu katalogdaki EN BÜYÜK düşmana göre: küçük hücrede iri düşman
  // komşu taramasından kaçabilir.
  private spatialGrid: SpatialGrid = new SpatialGrid(
    Math.max(getMaxEnemyRadius(), bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
  );
  private diagnostics?: Diagnostics;
  private escKey!: Phaser.Input.Keyboard.Key;

  private runSeed = 0;
  private score = 0;
  private kills = 0;
  private elapsedTimeMs = 0;
  private isPaused = false;
  private isDeathInProgress = false;
  private isRunFinished = false;
  /**
   * Bu frame'in zorluk durumu. Koşu yöneticisi (boss ölçeklemesi, minion
   * doğurma) bunu frame içinde birden çok kez okur; her okumada yeniden
   * hesaplamak yerine frame başında bir kez üretilir.
   */
  private difficulty: DifficultyState = getDifficultyState(0);
  // Reusable buffer'lar — her frame yeni obje yaratmaz
  private readonly moveDirBuf: Vector2 = Vector2.zero();
  private readonly aimDirBuf: Vector2 = Vector2.zero();

  constructor() {
    super({ key: 'Game' });
  }

  protected override onLanguageChanged(): void {
    this.hud.refreshLabels();
    this.cardScreens.refreshLabels();
  }

  protected createScene(data?: unknown): void {
    // Phaser sahne örneğini yeniden kullanır; alan başlatıcıları restart'ta
    // ÇALIŞMAZ. Sıfırlanması gereken her alan tek bir yerde toplanır ki
    // yeni alan eklendiğinde unutulmasın.
    this.resetSceneState();
    const { loadingScreen } = (data ?? {}) as { loadingScreen?: LoadingScreen };
    this.loadingScreen = loadingScreen ?? null;

    // Koşu PRNG'si — spawn, kart çekimi ve davranışlardaki tüm rastgelelik
    // buradan gelir. Seed kaydedilir: bir koşu aynı seed ile tekrar oynatılabilir.
    this.runSeed = Date.now() & 0x7fffffff;
    this.runRandom = createRandom(this.runSeed);
    Diagnostics.getInstance()?.recordEvent('runSeed', { seed: this.runSeed });

    this.audio = new GameAudioDirector(this, this.runRandom);
    this.audio.start();

    this.border = new Border(this);
    this.effects = new EffectManager(this, {
      getShakeScale: () =>
        audioSettings.isScreenShakeEnabled() ? audioSettings.getScreenShakeIntensity() : null,
    });
    this.telegraphs = new TelegraphManager(this);

    this.player = new Player(
      this,
      this.border.bounds.centerX,
      this.border.bounds.centerY,
      this.effects,
    );
    this.player.setBorder(this.border);

    this.inputManager = new InputManager(this);
    this.bulletManager = new BulletManager(this, this.effects, this.player.getStats());
    this.enemyManager = new EnemyManager(this, this.effects, this.runRandom, {
      // Ödül ölümün kendisine bağlı: mermi, kule, zincir ve ateş alanı
      // ölümleri aynı kapıdan geçer.
      onEnemyDeath: (enemy) => this.onEnemyKilled(enemy),
    });

    this.abilities = new AbilityRuntime({
      scene: this,
      effects: this.effects,
      border: this.border,
      random: this.runRandom,
      bullets: this.bulletManager,
      playerStats: this.player.getStats(),
    });

    this.run = new RunDirector(
      {
        scene: this,
        border: this.border,
        effects: this.effects,
        telegraphs: this.telegraphs,
        random: this.runRandom,
        enemyManager: this.enemyManager,
        bulletManager: this.bulletManager,
        playerStats: this.player.getStats(),
        damagePlayer: (amount) => this.applyBossDamage(amount),
        getPlayerPosition: () => this.player.getPosition(),
        getDifficulty: () => this.difficulty,
        onFluxCollected: () => {
          void gameAudio.playSfx('fluxPickup', { volume: sfxVolumes.fluxPickup });
        },
      },
      {
        // Seviye atlaması dövüşü kesmez: hak biriktirilir, dalga sonunda
        // sırayla sunulur (Brotato akışı).
        onLevelUp: (level) => {
          void gameAudio.playSfx('levelUp', { volume: sfxVolumes.levelUp });
          this.cardScreens.queueLevelUp(level);
        },
        onShopOpen: (wave) => {
          void gameAudio.playSfx('waveClear', { volume: sfxVolumes.waveClear });
          this.cardScreens.openIntermission(wave);
        },
        onWaveStart: (wave) => {
          void gameAudio.playSfx('waveStart', { volume: sfxVolumes.waveStart });
          this.hud.announceWave(wave);
        },
        onRunComplete: () => void this.onRunComplete(),
      },
    );

    this.cards = new CardInventoryManager({
      random: this.runRandom,
      playerStats: this.player.getStats(),
      abilities: this.abilities,
      economy: this.run.economy,
      conditions: {
        hasActiveTurret: () => this.abilities.getTurret() !== null,
        isLowHealth: () => this.player.getHealthRatio() < uiConfig.lowHealthThreshold,
        areBothSlotsFilled: () =>
          ABILITY_SLOTS.every((slot) => this.abilities.getAbility(slot) !== null),
      },
    });

    this.collisionResolver = new CollisionResolver(
      this.player,
      this.bulletManager,
      this.enemyManager,
      this.spatialGrid,
      this.border,
      {
        // Ödül `Enemy.onDeath` üzerinden gelir (kaynak fark etmez); burada
        // yalnızca mermi vuruşuna özgü SES kalır.
        getTurret: () => this.abilities.getTurret(),
      },
    );

    this.createHud();
    this.createScreens();
    this.bindKeys();
    this.run.start();

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

    this.diagnostics?.startStage('abilities');
    this.updateAbilities(dt, playerPos);
    this.diagnostics?.endStage('abilities');

    this.diagnostics?.startStage('entities');
    this.updateEntities(dt, playerPos, _time);
    this.diagnostics?.endStage('entities');

    this.diagnostics?.startStage('collision');
    this.collisionResolver.resolve(_time);
    this.diagnostics?.endStage('collision');

    this.diagnostics?.startStage('hud');
    this.updateHUD(dt);
    this.diagnostics?.endStage('hud');

    this.diagnostics?.startStage('death');
    this.checkDeath();
    this.diagnostics?.endStage('death');

    this.reportDiagnostics();
    const blocker = this.run.getBlocker();
    this.audio.setBossActive(blocker?.definition.id === BOSS_ENEMY_ID);
    this.audio.update(dt, this.enemyManager.getEnemies().length, !this.isDeathInProgress);

    this.diagnostics?.endFrame();
  }

  // --- Kurulum --------------------------------------------------------------

  private createHud(): void {
    this.hud = new GameHud(this.ui.element, this.player, this.run.economy);
    this.resetRun();
  }

  private createScreens(): void {
    this.cardScreens = new CardScreens(this.ui.element, this.cards, this.run.economy, {
      onOpen: () => this.pauseForScreen(),
      onClose: () => this.resumeAfterScreen(),
      onCardTaken: (source) => {
        this.effects.play('cardPicked', this.player.getX(), this.player.getPosition().y);
        const sound = source === 'shop' ? 'cardBuy' : 'cardPick';
        void gameAudio.playSfx(sound, { volume: sfxVolumes[sound] });
      },
      onReroll: () => void gameAudio.playSfx('reroll', { volume: sfxVolumes.reroll }),
      onLockToggle: () => void gameAudio.playSfx('lock', { volume: sfxVolumes.lock }),
      onDeny: () => void gameAudio.playSfx('deny', { volume: sfxVolumes.deny }),
    });

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
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('[GameScene] Keyboard plugin etkin değil; ESC ile duraklatma kurulamıyor');
    }

    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.togglePause());

    for (const slot of ABILITY_SLOTS) {
      const key = keyboard.addKey(SLOT_KEYS[slot]);
      key.on('down', () => {
        // Duraklamada ve kart ekranı açıkken yetenek tetiklenmez; Phaser
        // sahne duraklayınca input'u zaten kapatır ama bu bağ açık dursun.
        if (this.isPaused || this.cardScreens.isOpen()) return;
        // Boş slotta tuş sessizce hiçbir şey yapmaz — AbilityRuntime karar verir.
        this.abilities.tryActivate(slot);
      });
    }
  }

  // --- Döngü ---------------------------------------------------------------

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

  private updateAbilities(delta: number, playerPos: Vector2): void {
    this.abilities.update(delta, playerPos, this.aimDirBuf, this.enemyManager.getEnemies());
  }

  private updateEntities(delta: number, playerPos: Vector2, time: number): void {
    // Frame başına bir kez: koşu yöneticisi (boss ölçeklemesi, minion doğurma)
    // bunu geri çağrılar üzerinden okur.
    this.difficulty = getDifficultyState(this.elapsedTimeMs);
    const difficulty = this.difficulty;

    // Spatial grid'i bu frame için yeniden kur — enemy update'inden ÖNCE
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());

    // Koşu yöneticisi Elite/Boss'u sürdüğü için grid HAZIR olmalı: özel
    // düşmanlar da separation hesabı yapar.
    this.run.update(delta, playerPos, this.spatialGrid);

    this.bulletManager.update(delta, this.border);
    this.enemyManager.update(delta, playerPos, this.border, time, this.spatialGrid, difficulty, {
      // Kule sahadayken yakınındaki düşmanlar onu hedef alır.
      turret: this.abilities.getTurret(),
    });

    // Grid'i enemy hareketinden sonra yeniden kur — çarpışma kontrolü güncel pozisyon kullanır
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());
    this.spatialGrid.trim();
  }

  private updateHUD(deltaMs: number): void {
    const blocker = this.run.getBlocker();
    this.hud.refresh({
      player: this.player,
      economy: this.run.economy,
      abilities: this.abilities,
      score: this.score,
      kills: this.kills,
      elapsedTimeMs: this.elapsedTimeMs,
      pendingLevelUps: this.cardScreens.getPendingLevelUpCount(),
      deltaMs,
      wave: this.run.getCurrentWave(),
      waveRemainingMs: this.run.getWaveRemainingMs(),
      awaitingBlocker: this.run.isAwaitingBlocker(),
      blockerHealthRatio: blocker?.getHealthRatio() ?? null,
    });
  }

  private reportDiagnostics(): void {
    if (!this.diagnostics) return;

    this.diagnostics.setCount('score', this.score);
    this.diagnostics.setCount('kills', this.kills);
    this.diagnostics.setCount('elapsedSeconds', Math.floor(this.elapsedTimeMs / 1000));
    this.diagnostics.setCount('bullets', this.bulletManager.getBullets().length);
    this.diagnostics.setCount('enemies', this.enemyManager.getEnemies().length);
    this.diagnostics.setCount('particles', this.effects.getActiveParticleCount());
    this.diagnostics.setCount('gridCells', this.spatialGrid.getCellCount());
    this.diagnostics.setCount('wave', this.run.getCurrentWave());
    this.diagnostics.setCount(
      'waveRemainingSeconds',
      Math.ceil(this.run.getWaveRemainingMs() / 1000),
    );
    this.diagnostics.setCount('flux', this.run.economy.getFlux());
    this.diagnostics.setCount('fluxPickups', this.run.getPickupCount());
    this.diagnostics.setCount('spark', this.run.economy.getSpark());
    this.diagnostics.setCount('sparkLevel', this.run.economy.getLevel());
    this.diagnostics.setCount('cards', this.cards.getOwned().length);
    this.diagnostics.setCount('fireZones', this.abilities.getActiveZoneCount());
  }

  /**
   * Sahne örneği restart'ta yeniden kullanıldığı için alan başlatıcılarına
   * güvenilemez. create() başında çağrılır; HUD'a dokunmaz (henüz kurulmamış olabilir).
   */
  private resetSceneState(): void {
    this.isPaused = false;
    this.isDeathInProgress = false;
    this.isRunFinished = false;
    this.score = 0;
    this.kills = 0;
    this.elapsedTimeMs = 0;
    this.difficulty = getDifficultyState(0);
  }

  /** Koşu sayaçlarını sıfırlar ve HUD'a yansıtır. */
  private resetRun(): void {
    this.resetSceneState();
    this.hud.reset();
  }

  /**
   * Düşman ölümü — skor sahnenin, Spark/Flux koşu yöneticisinin işi.
   * Sarsıntı ve partikül ölüm efektiyle birlikte tetiklenir.
   */
  private onEnemyKilled(enemy: Enemy): void {
    this.kills += 1;
    this.score += Math.round(enemy.scoreValue);
    this.run.onEnemyKilled(enemy);
    void gameAudio.playSfx('enemyDeath', {
      volume: sfxVolumes.enemyDeath,
      stopEvents: ['enemyHit'],
    });
  }

  // --- Duraklatma / ekranlar ------------------------------------------------

  /** Kart ekranı açıldı — oyun durur ama duraklatma menüsü açılmaz. */
  private pauseForScreen(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    this.input.activePointer.reset();
    this.scene.pause();
  }

  private resumeAfterScreen(): void {
    if (!this.isPaused) return;
    // Ölüm ekranı açıldıysa kart ekranı kapanışı oyunu devam ettirmemeli.
    if (this.deathScreen?.isVisible()) return;
    this.isPaused = false;
    this.diagnostics?.markResume();
    this.scene.resume();
  }

  private togglePause(): void {
    // Death/kart ekranı aktifken pause toggle edilmez.
    if (this.deathScreen?.isVisible() || this.cardScreens.isOpen()) return;
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
    if (this.deathScreen?.isVisible()) return;
    this.isPaused = false;
    this.diagnostics?.markResume();
    this.scene.resume();
    void gameAudio.playSfx('resume', { volume: sfxVolumes.resume });
    this.pauseScreen?.hide();
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

  private onPlayerDeath(): void {
    void this.finishRun('defeat');
  }

  /**
   * Boss devrildi, 20 dalga tamamlandı — koşu ZAFERLE bitti.
   * Aynı özet ekranı zafer kılığında açılır (B3).
   */
  private onRunComplete(): void {
    void this.finishRun('victory');
  }

  /**
   * Koşuyu bitirir ve özet ekranını açar — zafer ve yenilgi için ORTAK yol.
   *
   * İki çıkış da aynı işi yapıyordu (duraklat, skoru gönder, özet göster);
   * ayrı iki kopya tutmak ikisinin zamanla ayrışmasını davet ederdi.
   */
  private async finishRun(outcome: RunOutcome): Promise<void> {
    // submitRun tamamlanana kadar tekrar çağrılmasın; zafer ve yenilgi
    // aynı frame'de tetiklenirse (boss'un son vuruşu oyuncuyu öldürürse)
    // yalnızca ilki geçer.
    if (this.isDeathInProgress || this.isRunFinished || this.deathScreen?.isVisible()) return;
    // Sahne zaten kapanmış veya başka bir sahneye geçilmişse hiçbir şey yapma;
    // `await submitRunSafely()` sırasında restart/MainMenu geçişi gerçekleşebilir.
    if (!this.isSceneActive()) return;
    this.isDeathInProgress = true;
    this.isRunFinished = true;

    try {
      if (this.isSceneActive()) {
        this.isPaused = true;
        this.input.activePointer.reset();
        this.scene.pause();
      }
      if (outcome === 'defeat') {
        this.audio.playDeath();
      } else if (outcome === 'victory') {
        this.audio.playVictory();
      }

      const result = await this.submitRunSafely();
      if (this.isSceneActive()) {
        this.deathScreen?.show({
          outcome,
          score: this.score,
          bestScore: result.bestScore,
          kills: this.kills,
          bestKills: result.bestKills,
          timeMs: this.elapsedTimeMs,
          bestTimeMs: result.bestTimeMs,
          totalKills: result.totalKills,
          wave: this.run.getCurrentWave(),
          flux: this.run.economy.getFlux(),
          level: this.run.economy.getLevel(),
        });
      }
    } catch (error) {
      // Beklenmedik bir hata (depolama/çeviri/DOM) özet ekranını bozarsa
      // oyun donmaz; ana menüye yönlendirilir ve hata loglanır.
      console.error('[GameScene] Koşu sonu işlemi başarısız:', error);
      if (this.isSceneActive()) {
        this.scene.start('MainMenu');
      }
    } finally {
      this.isDeathInProgress = false;
    }
  }

  private isSceneActive(): boolean {
    if (!this.scene) return false;
    const key = this.scene.key;
    if (!key) return false;
    return this.scene.isActive(key);
  }

  /**
   * Boss saldırısının oyuncuya verdiği hasar.
   * Temas hasarından ayrı bir kapı: boss saldırıları kendi zamanlamasını
   * taşır, oyuncunun i-frame'lerine (dash) yine de tabidir.
   */
  private applyBossDamage(amount: number): void {
    if (this.player.takeDamage(amount)) {
      void gameAudio.playSfx('hurt', { volume: sfxVolumes.hurt });
    }
  }

  protected override onSceneShutdown(): void {
    // Phaser GameObject'leri (player, bulletManager, enemyManager, border)
    // DisplayList.shutdown() tarafından zaten yok edilir — tekrar destroy etmeye gerek yok.
    // Burada sadece Phaser'ın temizlemediği kaynaklar temizlenir:
    // input listener'lar, DOM elementleri, i18n listener'ları ve timer'lar.
    this.audio?.stopAll();
    if (this.deathScreen) {
      this.deathScreen.destroy();
      this.deathScreen = null;
    }
    if (this.pauseScreen) {
      this.pauseScreen.destroy();
      this.pauseScreen = null;
    }
    this.cardScreens?.destroy();
    this.abilities?.destroy();
    this.effects?.destroy();
    this.telegraphs?.destroy();
    this.run?.destroy();
    this.inputManager.destroy();
    this.border.destroy();
    this.hud.destroy();
    this.diagnostics = undefined;
    if (this.loadingScreen) {
      this.loadingScreen.destroy();
      this.loadingScreen = null;
    }
  }
}
