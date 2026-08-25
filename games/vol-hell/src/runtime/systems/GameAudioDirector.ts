import type Phaser from 'phaser';
import type { Random } from '@volstudio/core';
import {
  ambientTrackKeys,
  bossTrackId,
  combatTrackId,
  deathTrackKeys,
  musicConfig,
  musicTracks,
  sfxVolumes,
  victoryTrackId,
} from '@/config';
import { gameAudio } from '@/app/services';
import { clampFinite, nonNegativeFinite, safeDeltaMs } from '@/runtime/utils/numeric';

/**
 * Oyun sahnesinin ses yönetimi — ambiyans yükleme, sakin/gergin geçişi,
 * savaş/boss müziği, ölüm ve zafer müziği, sahne kapanışında susturma.
 *
 * Sahne dosyasından ayrıldı: müzik durum makinesi oynanışla ilgisiz ama
 * `GameScene.update()` içinde yer kaplıyor ve her yeni oynanış sistemi
 * eklendiğinde sahneyi daha da okunaksız yapıyordu.
 */
export class GameAudioDirector {
  /** Ambiyans durumu. */
  private ambientState: 'calm' | 'tense' = 'calm';
  /** Müzik durumu. */
  private musicState: 'ambient' | 'combat' | 'boss' | 'death' | 'victory' = 'ambient';
  private ambientTimerMs = 0;
  private combatTimerMs = 0;
  private ambientLoaded = false;
  private musicLoaded = false;
  private bossActive = false;
  /** Ölüm/zafer terminal müziği çaldıktan sonra update'i dondur. */
  private terminal = false;
  /** Eski sahne örneğinin geç tamamlanan yüklemesi yeni koşuna sızmasın. */
  private lifecycleToken = 0;
  private stopped = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly random: Random,
  ) {}

  /**
   * Oyun içi parçaları arka planda yükler ve sakin ambiyansı başlatır.
   * Sahne bu arada kapanırsa ses başlatılmaz.
   */
  start(): void {
    const token = ++this.lifecycleToken;
    this.stopped = false;
    this.ambientState = 'calm';
    this.musicState = 'ambient';
    this.ambientTimerMs = 0;
    this.combatTimerMs = 0;
    this.ambientLoaded = false;
    this.musicLoaded = false;
    this.bossActive = false;
    this.terminal = false;

    void Promise.all([
      ...deathTrackKeys.map((key) => gameAudio.loadMusic(musicTracks[key])),
      ...ambientTrackKeys.map((key) => gameAudio.loadAmbient(musicTracks[key])),
      gameAudio.loadMusic(musicTracks[combatTrackId]),
      gameAudio.loadMusic(musicTracks[bossTrackId]),
      gameAudio.loadMusic(musicTracks[victoryTrackId]),
    ])
      .then(() => {
        // Oyuna hızlıca restart/MainMenu dönüşünde arka plan sesi çalmaya başlamasın.
        if (
          this.stopped ||
          token !== this.lifecycleToken ||
          !this.scene.scene.isActive(this.scene.scene.key)
        ) {
          return;
        }
        this.ambientLoaded = true;
        this.musicLoaded = true;
        gameAudio.stopMusic(musicConfig.ambient.menuStopFadeSec);
        void gameAudio.playAmbient(musicConfig.ambient.calmTrackId, {
          fadeIn: musicConfig.ambient.fadeInSec,
        });
      })
      .catch((error: unknown) => {
        console.warn('[GameAudioDirector] Ambiyans/müzik yüklenemedi:', error);
      });

    void gameAudio.loadAllSfx();
  }

  /** Boss oyunda mı? `true` girildiğinde boss müziğine geçilir. */
  setBossActive(active: boolean): void {
    this.bossActive = active;
  }

  /**
   * Sahadaki düşman sayısına göre ambiyansı sakin/gergin arasında geçirir
   * ve yoğunluğa göre savaş müziğini devreye sokar/çeker.
   * Tehlikeye hızlı, sakinliğe temkinli geçilir — eşikler config'te.
   */
  update(deltaMs: number, enemyCount: number, isPlaying: boolean): void {
    if (!isPlaying || this.terminal || this.stopped) return;
    if (!this.ambientLoaded) return;

    const safeDelta = safeDeltaMs(deltaMs);
    const safeEnemyCount = Math.max(0, Math.floor(nonNegativeFinite(enemyCount)));
    this.updateAmbient(safeDelta, safeEnemyCount);
    this.updateMusic(safeDelta, safeEnemyCount);
  }

  /** Ölüm anı — ambiyans ve müzik susar, ölüm parçası ve ölüm sesi çalar. */
  playDeath(): void {
    if (this.stopped) return;
    this.terminal = true;
    gameAudio.stopAmbient(musicConfig.ambient.terminalStopFadeSec);
    gameAudio.stopMusic(musicConfig.ambient.terminalStopFadeSec);

    const index = Math.floor(clampFinite(this.random.next(), 0, deathTrackKeys.length - 1, 0));
    const deathKey = deathTrackKeys[index] ?? deathTrackKeys[0];
    void gameAudio.playMusic(musicTracks[deathKey].id, { fadeIn: musicConfig.death.fadeInSec });
    void gameAudio.playSfx('death', {
      volume: sfxVolumes.death,
      stopEvents: ['hurt', 'fire'],
    });
  }

  /** Koşu zaferi — ambiyans ve müzik susar, zafer parçası çalar. */
  playVictory(): void {
    if (this.stopped) return;
    this.terminal = true;
    gameAudio.stopAmbient(musicConfig.ambient.terminalStopFadeSec);
    gameAudio.stopMusic(musicConfig.ambient.terminalStopFadeSec);
    void gameAudio.playMusic(victoryTrackId, { fadeIn: musicConfig.victory.fadeInSec });
  }

  /** Sahne kapanışı — tüm ses kanallarını susturur. */
  stopAll(): void {
    this.stopped = true;
    this.lifecycleToken++;
    gameAudio.stopAllSfx();
    gameAudio.stopMusic(1);
    gameAudio.stopAmbient(1);
  }

  private updateAmbient(deltaMs: number, enemyCount: number): void {
    const desired: 'calm' | 'tense' =
      enemyCount >= musicConfig.ambient.tenseEnemyThreshold ? 'tense' : 'calm';

    if (desired === this.ambientState) {
      this.ambientTimerMs = 0;
    } else {
      this.ambientTimerMs += deltaMs;
      const thresholdMs =
        desired === 'calm' ? musicConfig.ambient.calmHoldMs : musicConfig.ambient.tenseHoldMs;
      if (this.ambientTimerMs >= thresholdMs) {
        this.ambientTimerMs = 0;
        this.ambientState = desired;
        const trackId =
          desired === 'tense' ? musicConfig.ambient.tenseTrackId : musicConfig.ambient.calmTrackId;
        void gameAudio.playAmbient(trackId, {
          crossfade: true,
          fadeIn: musicConfig.ambient.fadeInSec,
        });
      }
    }
  }

  private updateMusic(deltaMs: number, enemyCount: number): void {
    if (this.bossActive) {
      if (this.musicState !== 'boss') {
        this.musicState = 'boss';
        this.combatTimerMs = 0;
        void gameAudio.playMusic(bossTrackId, {
          crossfade: true,
          fadeIn: musicConfig.boss.fadeInSec,
        });
      }
      return;
    }

    // Boss bittiğinde savaş/ambiyansa geri dön.
    if (this.musicState === 'boss') {
      this.musicState = 'ambient';
      this.combatTimerMs = 0;
      gameAudio.stopMusic(musicConfig.boss.fadeOutSec);
    }

    const desiredCombat = enemyCount >= musicConfig.combat.enemyThreshold;

    if (desiredCombat) {
      if (this.musicState === 'combat') {
        this.combatTimerMs = 0;
      } else {
        this.combatTimerMs += deltaMs;
        if (this.combatTimerMs >= musicConfig.combat.holdMs) {
          this.musicState = 'combat';
          this.combatTimerMs = 0;
          void gameAudio.playMusic(combatTrackId, {
            crossfade: true,
            fadeIn: musicConfig.combat.fadeInSec,
          });
        }
      }
    } else {
      if (this.musicState !== 'combat') {
        this.combatTimerMs = 0;
      } else {
        this.combatTimerMs += deltaMs;
        if (this.combatTimerMs >= musicConfig.combat.releaseHoldMs) {
          this.musicState = 'ambient';
          this.combatTimerMs = 0;
          gameAudio.stopMusic(musicConfig.combat.fadeOutSec);
        }
      }
    }
  }
}
