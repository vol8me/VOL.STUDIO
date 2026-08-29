import Phaser from 'phaser';
import {
  DisposableScope,
  InputManager,
  Vector2,
  createRandom,
  shouldUseTouchControls,
  vibrate,
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
  HELL_AIM_STICK_ACTIVATES_ON_TOUCH,
  HELL_MOVE_KEYS,
  HELL_PC_BINDINGS,
  type HellAction,
} from '@/config/input';
import { uiConfig } from '@/config/ui';
import { gameConfig } from '@/config/game';
import { physicsConfig } from '@/config/physics';
import { sfxVolumes } from '@/config';
import { BOSS_ENEMY_ID, getMaxEnemyRadius } from '@/config/enemies/catalog';
import { diagnostics, gameAudio, audioSettings, videoSettings } from '@/app/services';
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
import { PauseController } from '@/runtime/scene/PauseController';
import { RunScoreboard } from '@/runtime/scene/RunScoreboard';
import { isScenePresent, RunFinisher } from '@/runtime/scene/RunFinisher';
import { reportSceneTelemetry } from '@/runtime/scene/sceneTelemetry';
import { GameMobileControls } from './GameMobileControls';
import { GameKeyboardBindings } from './GameKeyboardBindings';
import { GameScreenStack } from './GameScreenStack';
import { safeDeltaMs } from '@/runtime/utils/numeric';
import { releasePointerLatch } from '@/runtime/input/pointerLatch';
import { SimulationClock } from '@/runtime/simulation/SimulationClock';
import { PlayerAimIndicator } from '@/runtime/ui/PlayerAimIndicator';
import { PlayerDirectionIndicator } from '@/runtime/ui/PlayerDirectionIndicator';
import { writeFireDirection } from '@/runtime/utils/direction';

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

  private screens: GameScreenStack | null = null;
  private loadingScreen: LoadingScreen | null = null;
  /** Bir koşu çevriminde kurulan tüm runtime kaynaklarının tek sahibi. */
  private runtimeScope: DisposableScope | null = null;

  // Hücre boyutu katalogdaki EN BÜYÜK düşmana göre: küçük hücrede iri düşman
  // komşu taramasından kaçabilir.
  private spatialGrid: SpatialGrid = new SpatialGrid(
    Math.max(getMaxEnemyRadius(), bulletConfig.radius) * physicsConfig.spatialGridCellMultiplier,
  );
  private keyboardBindings: GameKeyboardBindings | null = null;
  private readonly mobileControls = new GameMobileControls();
  private directionIndicator!: PlayerDirectionIndicator;
  private aimIndicator!: PlayerAimIndicator;

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
  private readonly fireDirBuf: Vector2 = Vector2.zero();
  /**
   * Düşük FPS'te simülasyon zamanını render zamanından ayıran adım saati.
   * Politika (catch-up, artık dilim, üst sınır) `SimulationClock`ta yaşar ve
   * Phaser olmadan test edilir.
   */
  private readonly clock = new SimulationClock({
    fixedStepMs: gameConfig.fixedStepMs,
    maxStepsPerFrame: gameConfig.maxSimulationStepsPerFrame,
  });

  /**
   * Duraklatma ve sayaçlar sahnenin alanı değil ayrı birer nesne: ikisi de saf
   * mantık ve testte Phaser olmadan sürülebiliyor. Bağımlılıklar closure ile
   * verilir — çağrıldıkları anda `this.screens` gibi geç kurulan alanlar
   * çözülsün diye.
   */
  private readonly pauseCtl = new PauseController({
    pauseScene: () => this.scene.pause(),
    resumeScene: () => this.scene.resume(),
    resetPointer: () => this.releasePointerLatch(),
    isDeathScreenVisible: () => this.screens?.death.isVisible() === true,
    isCardScreenOpen: () => this.screens?.cards.isOpen() === true,
    onMenuPause: () => {
      void gameAudio.playSfx('pause', { volume: sfxVolumes.pause });
      this.screens?.pause.show();
    },
    onMenuResume: () => {
      void gameAudio.playSfx('resume', { volume: sfxVolumes.resume });
      this.screens?.pause.hide();
    },
    onResume: () => diagnostics?.markResume(),
  });

  private readonly scoreboard = new RunScoreboard();

  private readonly finisher = new RunFinisher({
    isSceneActive: () => {
      const key = this.scene?.key;
      return Boolean(key && isScenePresent(this.scene, key));
    },
    isSummaryVisible: () => this.screens?.death.isVisible() === true,
    forcePause: () => this.pauseCtl.forcePause(),
    playOutcomeAudio: (outcome) => {
      if (outcome === 'defeat') this.audio.playDeath();
      else if (outcome === 'victory') this.audio.playVictory();
    },
    submitStats: () => this.scoreboard.submitSafely(),
    showSummary: (outcome, result) => {
      this.screens?.death.show({
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
    this.screens?.refreshLabels();
    this.mobileControls.refreshLabels();
  }

  protected createScene(data?: unknown): void {
    // Beklenmedik biçimde SHUTDOWN alamayan önceki çevrim varsa yeni kaynak
    // kurmadan kapat; aksi hâlde listener ve Phaser nesneleri üst üste biner.
    this.runtimeScope?.dispose();
    const runtimeScope = new DisposableScope();
    this.runtimeScope = runtimeScope;

    // Phaser sahne örneğini yeniden kullanır; alan başlatıcıları restart'ta
    // ÇALIŞMAZ. Sıfırlanması gereken her alan tek bir yerde toplanır ki
    // yeni alan eklendiğinde unutulmasın.
    this.resetSceneState();
    const { loadingScreen } = (data ?? {}) as { loadingScreen?: LoadingScreen };
    this.loadingScreen = loadingScreen ?? null;
    if (this.loadingScreen) runtimeScope.addDestroyable(this.loadingScreen);

    // Koşu PRNG'si — spawn, kart çekimi ve davranışlardaki tüm rastgelelik
    // buradan gelir. Seed kaydedilir: bir koşu aynı seed ile tekrar oynatılabilir.
    this.runSeed = Date.now() & 0x7fffffff;
    this.runRandom = createRandom(this.runSeed);
    diagnostics?.recordEvent('runSeed', { seed: this.runSeed });

    this.audio = new GameAudioDirector(this, this.runRandom);
    runtimeScope.add({ dispose: () => this.audio.stopAll() });
    this.audio.start();

    this.border = runtimeScope.addDestroyable(new Border(this));
    this.effects = runtimeScope.addDestroyable(
      new EffectManager(this, {
        getShakeScale: () =>
          audioSettings.isScreenShakeEnabled() ? audioSettings.getScreenShakeIntensity() : null,
        getParticleScale: () => videoSettings.getParticleScale(),
      }),
    );
    this.telegraphs = runtimeScope.addDestroyable(new TelegraphManager(this));

    this.player = runtimeScope.addDestroyable(
      new Player(this, this.border.bounds.centerX, this.border.bounds.centerY, this.effects),
    );
    this.player.setBorder(this.border);
    this.directionIndicator = runtimeScope.addDestroyable(new PlayerDirectionIndicator(this));
    this.aimIndicator = runtimeScope.addDestroyable(new PlayerAimIndicator(this));

    this.inputManager = runtimeScope.addDestroyable(
      new InputManager<HellAction>(this, {
        actions: HELL_ACTIONS,
        pcActionBindings: HELL_PC_BINDINGS,
        moveKeys: HELL_MOVE_KEYS,
        aimStickAction: HELL_AIM_STICK_ACTION,
        aimStickActivatesOnTouch: HELL_AIM_STICK_ACTIVATES_ON_TOUCH,
        actionSource: this.mobileControls.actionSource,
      }),
    );
    this.bulletManager = runtimeScope.addDestroyable(
      new BulletManager(this, this.effects, this.player.getStats()),
    );
    this.enemyManager = runtimeScope.addDestroyable(
      new EnemyManager(this, this.effects, this.runRandom, {
        // Ödül ölümün kendisine bağlı: mermi, kule, zincir ve ateş alanı
        // ölümleri aynı kapıdan geçer.
        onEnemyDeath: (enemy) => this.onEnemyKilled(enemy),
      }),
    );

    this.abilities = runtimeScope.addDestroyable(
      new AbilityRuntime({
        scene: this,
        effects: this.effects,
        border: this.border,
        random: this.runRandom,
        visualSeed: (this.runSeed ^ 0x51_7a_11) | 0,
        bullets: this.bulletManager,
        playerStats: this.player.getStats(),
      }),
    );

    this.run = runtimeScope.addDestroyable(
      new RunDirector(
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
          clearTransientState: () => this.clearTransientState(),
        },
        {
          // Seviye atlaması dövüşü kesmez: hak biriktirilir, dalga sonunda
          // sırayla sunulur.
          onLevelUp: (level) => {
            void gameAudio.playSfx('levelUp', { volume: sfxVolumes.levelUp });
            this.screens?.cards.queueLevelUp(level);
          },
          onShopOpen: (wave) => {
            void gameAudio.playSfx('waveClear', { volume: sfxVolumes.waveClear });
            this.screens?.cards.openIntermission(wave);
          },
          onWaveStart: (wave) => {
            this.resetForWave();
            void gameAudio.playSfx('waveStart', { volume: sfxVolumes.waveStart });
            this.screens?.hud.announceWave(wave);
          },
          onRunComplete: () => void this.onRunComplete(),
        },
      ),
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

    this.screens = runtimeScope.addDestroyable(
      new GameScreenStack({
        parent: this.ui.element,
        player: this.player,
        effects: this.effects,
        cards: this.cards,
        abilities: this.abilities,
        economy: this.run.economy,
        audioSettings,
        videoSettings,
        onPauseForCard: () => this.pauseCtl.pauseForScreen(),
        onResumeAfterCard: () => this.pauseCtl.resumeAfterScreen(),
        onResumeFromMenu: () => this.pauseCtl.resumeFromMenu(),
        onRestart: () => this.scene.restart(),
        onMainMenu: () => this.scene.start('MainMenu'),
      }),
    );
    this.mobileControls.mount({
      parent: this.ui.element,
      onAbility: (slot) => this.abilities.tryActivate(slot),
      onPauseToggle: () => this.pauseCtl.toggle(),
      isPaused: () => this.pauseCtl.isPaused,
      isAbilityBlocked: () => this.pauseCtl.isPaused || this.screens?.cards.isOpen() === true,
      isCardScreenOpen: () => this.screens?.cards.isOpen() === true,
      isDeathScreenVisible: () => this.screens?.death.isVisible() === true,
      isRunEnding: () => this.finisher.isFinishing || this.finisher.isFinished,
    });
    runtimeScope.addDestroyable(this.mobileControls);
    this.bindKeys(runtimeScope);
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

    const realDelta = safeDeltaMs(delta);

    diagnostics?.startStage('input');
    this.inputManager.update(realDelta);
    diagnostics?.setInput(this.inputManager.getDebugSnapshot());
    diagnostics?.endStage('input');

    // Input state frame basina BIR kez okunur. Iki ayri getState() cagrisi hem
    // gereksiz Vector2 uretiyor hem de iki farkli anlik goruntu yaratiyordu.
    const inputState = this.inputManager.getState(this.player.getPosition());

    this.clock.advance(realDelta, (stepMs) => this.advanceSimulation(stepMs, inputState));

    diagnostics?.startStage('hud');
    this.updateHUD(realDelta);
    diagnostics?.endStage('hud');

    this.reportDiagnostics();
    const blocker = this.run.getBlocker();
    this.audio.setBossActive(blocker?.definition.id === BOSS_ENEMY_ID);
    this.audio.update(realDelta, this.enemyManager.getEnemies().length, !this.finisher.isFinishing);

    diagnostics?.endFrame();
  }

  private advanceSimulation(dt: number, inputState: InputState<HellAction>): void {
    this.scoreboard.advance(dt);
    const simulationTimeMs = this.clock.getSimulationTimeMs();

    diagnostics?.startStage('player');
    this.updatePlayer(dt, inputState);
    diagnostics?.endStage('player');

    const playerPos = this.player.getPosition();
    this.directionIndicator.update(
      dt,
      playerPos.x,
      playerPos.y,
      this.moveDirBuf.x,
      this.moveDirBuf.y,
    );
    this.aimIndicator.update(dt, playerPos.x, playerPos.y);

    diagnostics?.startStage('fire');
    this.fire(playerPos, inputState);
    diagnostics?.endStage('fire');

    diagnostics?.startStage('abilities');
    this.updateAbilities(dt, playerPos);
    diagnostics?.endStage('abilities');

    diagnostics?.startStage('entities');
    this.updateEntities(dt, playerPos, simulationTimeMs);
    diagnostics?.endStage('entities');

    diagnostics?.startStage('collision');
    this.collisionResolver.resolve(simulationTimeMs);
    diagnostics?.endStage('collision');

    diagnostics?.startStage('death');
    this.checkDeath();
    diagnostics?.endStage('death');
  }

  private bindKeys(runtimeScope: DisposableScope): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('[GameScene] Keyboard plugin etkin değil; ESC ile duraklatma kurulamıyor');
    }

    this.keyboardBindings = runtimeScope.addDestroyable(
      new GameKeyboardBindings(keyboard, {
        pauseKeyCode: Phaser.Input.Keyboard.KeyCodes.ESC,
        abilityKeys: SLOT_KEYS,
        onPause: () => this.pauseCtl.toggle(),
        isAbilityBlocked: () => this.pauseCtl.isPaused || this.screens?.cards.isOpen() === true,
        onAbility: (slot) => this.abilities.tryActivate(slot),
      }),
    );
  }

  // --- Döngü ---------------------------------------------------------------

  private updatePlayer(delta: number, state: InputState<HellAction>): void {
    this.moveDirBuf.set(state.move.x, state.move.y);
    this.aimDirBuf.set(state.aim.x, state.aim.y);

    // Önce input uygula — dash update'ten önce tetiklenmeli (BUG-3 fix)
    this.player.setMoveDirection(this.moveDirBuf);

    if (state.actions.dash && this.player.tryDash(this.aimDirBuf)) {
      void gameAudio.playSfx('dash', { volume: sfxVolumes.dash });
      vibrate('select');
    }

    // Player update — dash dahil tüm hareket bu frame'de uygulanır
    this.player.update(delta);
  }

  private fire(playerPos: Vector2, state: InputState<HellAction>): void {
    if (!state.actions.fire) return;
    if (
      writeFireDirection(
        this.fireDirBuf,
        playerPos.x,
        playerPos.y,
        this.aimDirBuf.x,
        this.aimDirBuf.y,
        this.enemyManager.getEnemies(),
      )
    ) {
      if (this.bulletManager.tryFire(playerPos, this.fireDirBuf)) {
        this.aimIndicator.show(playerPos.x, playerPos.y, this.fireDirBuf.x, this.fireDirBuf.y);
        void gameAudio.playSfx('fire', { volume: sfxVolumes.fire });
        // Ateş salkım hâlinde gelir; `vibrate` deseni kendi içinde kısıtlar
        // (bkz. MIN_INTERVAL_MS), yani sürekli bir uğultuya dönüşmez.
        vibrate('tap');
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

    // Adım başına TEK tam rebuild + tek artımlı tazeleme.
    //
    // Önce iki kez TAM rebuild vardı: biri düşman hareketinden önce
    // (separation için), biri sonra (çarpışma güncel konum okusun diye).
    // İkinci rebuild indeksi boşaltıp her düşmanı yeniden ekliyordu — hareket
    // etmemişler dahil. Küme aynı kaldığı için ikinci geçiş artık
    // `refresh()`: `SpatialIndex.update()` hücre değişmediğinde hiçbir iş
    // yapmaz, yani maliyet O(N)'den O(hücre değiştiren düşman)'a iner.
    // Çarpışmanın gördüğü konumlar birebir aynı kalır.
    //
    // Tam rebuild (artımlı insert/remove yerine) ilk geçişte bilinçli:
    // düşman kümesi doğum/geri dönüşümle DEĞİŞEBİLİR ve listeden tamamen
    // düşen bir varlık yalnız rebuild ile indeksten kalkar.
    this.spatialGrid.rebuild(this.enemyManager.getEnemies());

    // Koşu yöneticisi Elite/Boss'u sürdüğü için grid HAZIR olmalı: özel
    // düşmanlar da separation hesabı yapar.
    this.run.update(delta, playerPos, this.spatialGrid);

    this.bulletManager.update(delta, this.border);
    this.enemyManager.update(delta, playerPos, this.border, time, this.spatialGrid, difficulty, {
      // Kule sahadayken yakınındaki düşmanlar onu hedef alır.
      turret: this.abilities.getTurret(),
    });

    // Hareketten sonra konumları tazele — çarpışma güncel konumu okur.
    this.spatialGrid.refresh(this.enemyManager.getEnemies());
  }

  private updateHUD(deltaMs: number): void {
    const blocker = this.run.getBlocker();
    this.screens?.hud.refresh({
      player: this.player,
      economy: this.run.economy,
      abilities: this.abilities,
      score: this.scoreboard.getScore(),
      kills: this.scoreboard.getKills(),
      elapsedTimeMs: this.scoreboard.getElapsedMs(),
      deltaMs,
      wave: this.run.getCurrentWave(),
      waveRemainingMs: this.run.getWaveRemainingMs(),
      awaitingBlocker: this.run.isAwaitingBlocker(),
      blockerHealthRatio: blocker?.getHealthRatio() ?? null,
    });
    // Ekran üstü yetenek düğmeleri de cooldown/boş slot durumunu gösterir;
    // yoksa oyuncu basıp neden hiçbir şey olmadığını anlayamaz.
    this.mobileControls.refresh(this.abilities);
  }

  /**
   * Dalga sınırı sözleşmesi: geçici oyun varlıkları ve fiziksel input aynı
   * anda temizlenir; slot/kart ilerlemesi korunur.
   *
   * `clearTransientState()` burada TEKRAR çağrılmaz: dalga bitişinde
   * `RunDirector` zaten çağırdı ve aradaki tek etkileşim yüzeyi (kart/dükkan
   * ekranı) yeni geçici varlık üretmez. Çift çağrı input latch'ini iki kez
   * bırakıp masaüstünde tuş tepkisini gereksiz yere geciktiriyordu.
   */
  private resetForWave(): void {
    this.player.resetForWave();
    this.directionIndicator.reset();
    this.aimIndicator.reset();
  }

  /** Kule, ability efektleri ve fiziksel input için dalga arası ortak kapı. */
  private clearTransientState(): void {
    this.abilities.clearTransientState();
    this.effects.clearActive();
    this.inputManager.reset();
    this.mobileControls.resetInput();
    this.releasePointerLatch();
  }

  /**
   * Pointer'ın basılı durumunu bırakır; masaüstünde nişan konumunu korur.
   * Duraklatma ve dalga sınırı aynı kapıyı kullanır (bkz. `releasePointerLatch`).
   */
  private releasePointerLatch(): void {
    releasePointerLatch(this.input.activePointer, { preserveAim: !shouldUseTouchControls() });
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
    this.clock.reset();
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
   * Boss saldırısının oyuncuya verdiği hasar.
   * Temas hasarından ayrı bir kapı: boss saldırıları kendi zamanlamasını
   * taşır, oyuncunun i-frame'lerine (dash) yine de tabidir.
   */
  private applyBossDamage(amount: number): void {
    if (this.player.takeDamage(amount)) {
      void gameAudio.playSfx('hurt', { volume: sfxVolumes.hurt });
      vibrate('warning');
    }
  }

  protected override onSceneShutdown(): void {
    // Sahne restart'ta aynı örneği kullandığı için sahip olduğumuz bütün
    // yöneticileri burada kapatıyoruz. DisplayList'in genel temizliği,
    // yöneticilerin tuttuğu dizileri, async telegraph'ları ve key closure'larını
    // garanti etmez.
    this.runtimeScope?.dispose();
    this.runtimeScope = null;
    this.keyboardBindings = null;
    this.screens = null;
    this.loadingScreen = null;
  }
}
