import Phaser from 'phaser';
import {
  InputManager,
  Vector2,
  createRandom,
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
import {
  HELL_ACTIONS,
  HELL_AIM_STICK_ACTION,
  HELL_MOVE_KEYS,
  HELL_PC_BINDINGS,
  type HellAction,
} from '@/config/input';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { physicsConfig } from '@/config/physics';
import { sfxVolumes } from '@/config';
import { BOSS_ENEMY_ID, getMaxEnemyRadius } from '@/config/enemies/catalog';
import { diagnostics, gameAudio, audioSettings } from '@/app/services';
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
import { DeathScreen } from './DeathScreen';
import { GameHud } from '@/runtime/ui/GameHud';
import { PauseController } from '@/runtime/scene/PauseController';
import { RunScoreboard } from '@/runtime/scene/RunScoreboard';
import { RunFinisher } from '@/runtime/scene/RunFinisher';
import { reportSceneTelemetry } from '@/runtime/scene/sceneTelemetry';
import { CardScreens } from '@/runtime/ui/CardScreens';
import { GameKeyboardBindings } from './GameKeyboardBindings';
import { safeDeltaMs } from '@/runtime/utils/numeric';

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
  private inputManager!: InputManager<HellAction>;
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
  private keyboardBindings: GameKeyboardBindings | null = null;

  private runSeed = 0;
  /**
   * Bu frame'in zorluk durumu. Koşu yöneticisi (boss ölçeklemesi, minion
   * doğurma) bunu frame içinde birden çok kez okur; her okumada yeniden
   * hesaplamak yerine frame başında bir kez üretilir.
   */
  private difficulty: DifficultyState = getDifficultyState(0);
  // Reusable buffer'lar — her frame yeni obje yaratmaz
  private readonly moveDirBuf: Vector2 = Vector2.zero();
  private readonly aimDirBuf: Vector2 = Vector2.zero();

  /**
   * Duraklatma ve sayaçlar sahnenin alanı değil ayrı birer nesne: ikisi de saf
   * mantık ve testte Phaser olmadan sürülebiliyor. Bağımlılıklar closure ile
   * verilir — çağrıldıkları anda `this.deathScreen` gibi geç kurulan alanlar
   * çözülsün diye.
   */
  private readonly pauseCtl = new PauseController({
    pauseScene: () => this.scene.pause(),
    resumeScene: () => this.scene.resume(),
    resetPointer: () => this.input.activePointer.reset(),
    isDeathScreenVisible: () => this.deathScreen?.isVisible() === true,
    isCardScreenOpen: () => this.cardScreens?.isOpen() === true,
    onMenuPause: () => {
      void gameAudio.playSfx('pause', { volume: sfxVolumes.pause });
      this.pauseScreen?.show();
    },
    onMenuResume: () => {
      void gameAudio.playSfx('resume', { volume: sfxVolumes.resume });
      this.pauseScreen?.hide();
    },
    onResume: () => diagnostics?.markResume(),
  });

  private readonly scoreboard = new RunScoreboard();

  private readonly finisher = new RunFinisher({
    isSceneActive: () => this.isSceneActive(),
    isSummaryVisible: () => this.deathScreen?.isVisible() === true,
    forcePause: () => this.pauseCtl.forcePause(),
    playOutcomeAudio: (outcome) => {
      if (outcome === 'defeat') this.audio.playDeath();
      else if (outcome === 'victory') this.audio.playVictory();
    },
    submitStats: () => this.scoreboard.submitSafely(),
    showSummary: (outcome, result) => {
      this.deathScreen?.show({
        outcome,
        score: this.scoreboard.getScore(),
        bestScore: result.bestScore,
        kills: this.scoreboard.getKills(),
        bestKills: result.bestKills,
        timeMs: this.scoreboard.getElapsedMs(),
        bestTimeMs: result.bestTimeMs,
        totalKills: result.totalKills,
        wave: this.run.getCurrentWave(),
        flux: this.run.economy.getFlux(),
        level: this.run.economy.getLevel(),
      });
    },
    goToMainMenu: () => this.scene.start('MainMenu'),
  });

  constructor() {
    super({ key: 'Game' });
  }

  protected override onLanguageChanged(): void {
    this.hud?.refreshLabels();
    this.cardScreens?.refreshLabels();
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
    diagnostics?.recordEvent('runSeed', { seed: this.runSeed });

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

    this.inputManager = new InputManager<HellAction>(this, {
      actions: HELL_ACTIONS,
      pcActionBindings: HELL_PC_BINDINGS,
      moveKeys: HELL_MOVE_KEYS,
      aimStickAction: HELL_AIM_STICK_ACTION,
    });
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
        // sırayla sunulur.
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

    // Geliştirme/diagnostic overlay — `?debug`/`?perf` varsa initServices()
    // tarafından oluşturulur, yoksa null'dur (bkz. app/services.ts).
    diagnostics?.setScene(this.scene.key);
    diagnostics?.markResume();
  }

  update(_time: number, delta: number): void {
    if (this.pauseCtl.isPaused) {
      // beginFrame() ilk isi counts.clear() — duraklamada cagirmak overlay'deki
      // tum sayaclari (dusman, mermi, partikul) tam da incelenmek istenen anda siler.
      return;
    }

    diagnostics?.beginFrame();

    const dt = safeDeltaMs(delta, gameConfig.maxDeltaMs);
    this.scoreboard.advance(dt);

    diagnostics?.startStage('input');
    this.inputManager.update(dt);
    diagnostics?.setInput(this.inputManager.getDebugSnapshot());
    diagnostics?.endStage('input');

    // Input state frame basina BIR kez okunur. Iki ayri getState() cagrisi hem
    // gereksiz Vector2 uretiyor hem de iki farkli anlik goruntu yaratiyordu.
    const inputState = this.inputManager.getState(this.player.getPosition());

    diagnostics?.startStage('player');
    this.updatePlayer(dt, inputState);
    diagnostics?.endStage('player');

    const playerPos = this.player.getPosition();

    diagnostics?.startStage('fire');
    this.fire(playerPos, inputState);
    diagnostics?.endStage('fire');

    diagnostics?.startStage('abilities');
    this.updateAbilities(dt, playerPos);
    diagnostics?.endStage('abilities');

    diagnostics?.startStage('entities');
    this.updateEntities(dt, playerPos, _time);
    diagnostics?.endStage('entities');

    diagnostics?.startStage('collision');
    this.collisionResolver.resolve(_time);
    diagnostics?.endStage('collision');

    diagnostics?.startStage('hud');
    this.updateHUD(dt);
    diagnostics?.endStage('hud');

    diagnostics?.startStage('death');
    this.checkDeath();
    diagnostics?.endStage('death');

    this.reportDiagnostics();
    const blocker = this.run.getBlocker();
    this.audio.setBossActive(blocker?.definition.id === BOSS_ENEMY_ID);
    this.audio.update(dt, this.enemyManager.getEnemies().length, !this.finisher.isFinishing);

    diagnostics?.endFrame();
  }

  // --- Kurulum --------------------------------------------------------------

  private createHud(): void {
    this.hud = new GameHud(this.ui.element, this.player, this.run.economy);
    this.resetRun();
  }

  private createScreens(): void {
    this.cardScreens = new CardScreens(this.ui.element, this.cards, this.run.economy, {
      onOpen: () => this.pauseCtl.pauseForScreen(),
      onClose: () => this.pauseCtl.resumeAfterScreen(),
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
      onResume: () => this.pauseCtl.resumeFromMenu(),
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

    this.keyboardBindings?.destroy();
    this.keyboardBindings = new GameKeyboardBindings(keyboard, {
      pauseKeyCode: Phaser.Input.Keyboard.KeyCodes.ESC,
      abilityKeys: SLOT_KEYS,
      onPause: () => this.pauseCtl.toggle(),
      isAbilityBlocked: () => this.pauseCtl.isPaused || this.cardScreens.isOpen(),
      onAbility: (slot) => this.abilities.tryActivate(slot),
    });
  }

  // --- Döngü ---------------------------------------------------------------

  private updatePlayer(delta: number, state: InputState<HellAction>): void {
    this.moveDirBuf.set(state.move.x, state.move.y);
    this.aimDirBuf.set(state.aim.x, state.aim.y);

    // Önce input uygula — dash update'ten önce tetiklenmeli (BUG-3 fix)
    this.player.setMoveDirection(this.moveDirBuf);

    if (state.actions.dash && this.player.tryDash(this.aimDirBuf)) {
      void gameAudio.playSfx('dash', { volume: sfxVolumes.dash });
    }

    // Player update — dash dahil tüm hareket bu frame'de uygulanır
    this.player.update(delta);
  }

  private fire(playerPos: Vector2, state: InputState<HellAction>): void {
    if (state.actions.fire && this.aimDirBuf.length() > 0) {
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
    this.difficulty = getDifficultyState(this.scoreboard.getElapsedMs());
    const difficulty = this.difficulty;

    // Spatial grid'i bu frame için yeniden kur — enemy update'inden ÖNCE.
    // Tam rebuild bilinçli: VOL.HELL ölçeğinde (birkaç yüz düşman) maliyeti
    // ölçülemez ve hangi entity'nin nerede hareket ettiğini takip etmeyi
    // gerektirmez. Artımlı yol (insert/remove/update) sınıfta hazır ve test
    // edilmiş durumda; binlerce entity taşıyan bir tüketici onu kullanır.
    this.spatialGrid.rebuild(this.enemyManager.getEnemies());

    // Koşu yöneticisi Elite/Boss'u sürdüğü için grid HAZIR olmalı: özel
    // düşmanlar da separation hesabı yapar.
    this.run.update(delta, playerPos, this.spatialGrid);

    this.bulletManager.update(delta, this.border);
    this.enemyManager.update(delta, playerPos, this.border, time, this.spatialGrid, difficulty, {
      // Kule sahadayken yakınındaki düşmanlar onu hedef alır.
      turret: this.abilities.getTurret(),
    });

    // Grid'i enemy hareketinden sonra yeniden kur — çarpışma kontrolü güncel pozisyon kullanır
    this.spatialGrid.rebuild(this.enemyManager.getEnemies());
  }

  private updateHUD(deltaMs: number): void {
    const blocker = this.run.getBlocker();
    this.hud.refresh({
      player: this.player,
      economy: this.run.economy,
      abilities: this.abilities,
      score: this.scoreboard.getScore(),
      kills: this.scoreboard.getKills(),
      elapsedTimeMs: this.scoreboard.getElapsedMs(),
      pendingLevelUps: this.cardScreens.getPendingLevelUpCount(),
      deltaMs,
      wave: this.run.getCurrentWave(),
      waveRemainingMs: this.run.getWaveRemainingMs(),
      awaitingBlocker: this.run.isAwaitingBlocker(),
      blockerHealthRatio: blocker?.getHealthRatio() ?? null,
    });
  }

  private reportDiagnostics(): void {
    if (!diagnostics) return;
    reportSceneTelemetry(diagnostics, {
      score: this.scoreboard.getScore(),
      kills: this.scoreboard.getKills(),
      elapsedMs: this.scoreboard.getElapsedMs(),
      bullets: this.bulletManager.getBullets().length,
      enemies: this.enemyManager.getEnemies().length,
      particles: this.effects.getActiveParticleCount(),
      gridCells: this.spatialGrid.getCellCount(),
      wave: this.run.getCurrentWave(),
      waveRemainingMs: this.run.getWaveRemainingMs(),
      flux: this.run.economy.getFlux(),
      fluxPickups: this.run.getPickupCount(),
      spark: this.run.economy.getSpark(),
      sparkLevel: this.run.economy.getLevel(),
      cards: this.cards.getOwned().length,
      fireZones: this.abilities.getActiveZoneCount(),
    });
  }

  /**
   * Sahne örneği restart'ta yeniden kullanıldığı için alan başlatıcılarına
   * güvenilemez. create() başında çağrılır; HUD'a dokunmaz (henüz kurulmamış olabilir).
   */
  private resetSceneState(): void {
    this.pauseCtl.reset();
    this.scoreboard.reset();
    this.finisher.reset();
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
    this.scoreboard.addKill(enemy.scoreValue);
    this.run.onEnemyKilled(enemy);
    void gameAudio.playSfx('enemyDeath', {
      volume: sfxVolumes.enemyDeath,
      stopEvents: ['enemyHit'],
    });
  }

  // --- Duraklatma / ekranlar ------------------------------------------------

  private checkDeath(): void {
    if (!this.player.isAlive()) {
      void this.onPlayerDeath();
    }
  }

  private onPlayerDeath(): void {
    void this.finisher.finish('defeat');
  }

  /**
   * Boss devrildi, 20 dalga tamamlandı — koşu ZAFERLE bitti.
   * Aynı özet ekranı zafer kılığında açılır.
   */
  private onRunComplete(): void {
    void this.finisher.finish('victory');
  }

  /**
   * Koşuyu bitirir ve özet ekranını açar — zafer ve yenilgi için ORTAK yol.
   *
   * İki çıkış da aynı işi yapıyordu (duraklat, skoru gönder, özet göster);
   * ayrı iki kopya tutmak ikisinin zamanla ayrışmasını davet ederdi.
   */
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
    // Sahne restart'ta aynı örneği kullandığı için sahip olduğumuz bütün
    // yöneticileri burada kapatıyoruz. DisplayList'in genel temizliği,
    // yöneticilerin tuttuğu dizileri, async telegraph'ları ve key closure'larını
    // garanti etmez.
    this.keyboardBindings?.destroy();
    this.keyboardBindings = null;
    this.audio?.stopAll();
    if (this.deathScreen) {
      this.deathScreen.destroy();
      this.deathScreen = null;
    }
    if (this.pauseScreen) {
      this.pauseScreen.destroy();
      this.pauseScreen = null;
    }
    this.run?.destroy();
    this.telegraphs?.destroy();
    this.abilities?.destroy();
    this.bulletManager?.destroy();
    this.enemyManager?.destroy();
    this.player?.destroy();
    this.effects?.destroy();
    this.inputManager?.destroy();
    this.border?.destroy();
    this.hud?.destroy();
    this.cardScreens?.destroy();
    if (this.loadingScreen) {
      this.loadingScreen.destroy();
      this.loadingScreen = null;
    }
  }
}
