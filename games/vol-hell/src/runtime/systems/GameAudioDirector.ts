import type Phaser from 'phaser';
import type { Random } from '@volstudio/core';
import { ambientTrackKeys, deathTrackKeys, musicConfig, musicTracks, sfxVolumes } from '@/config';
import { gameAudio } from '@/app/services';

/**
 * Oyun sahnesinin ses yönetimi — ambiyans yükleme, sakin/gergin geçişi,
 * ölüm müziği ve sahne kapanışında susturma.
 *
 * Sahne dosyasından ayrıldı: müzik durum makinesi oynanışla ilgisiz ama
 * `GameScene.update()` içinde yer kaplıyor ve her yeni oynanış sistemi
 * eklendiğinde sahneyi daha da okunaksız yapıyordu.
 */
export class GameAudioDirector {
  private state: 'calm' | 'tense' = 'calm';
  private stateTimerMs = 0;
  private ambientLoaded = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly random: Random,
  ) {}

  /**
   * Ölüm/ambiyans parçalarını arka planda yükler ve hazır olunca sakin
   * ambiyansı başlatır. Sahne bu arada kapanırsa ses başlatılmaz.
   */
  start(): void {
    this.state = 'calm';
    this.stateTimerMs = 0;
    this.ambientLoaded = false;

    for (const key of deathTrackKeys) {
      void gameAudio.loadMusic(musicTracks[key]);
    }

    void Promise.all(ambientTrackKeys.map((key) => gameAudio.loadAmbient(musicTracks[key])))
      .then(() => {
        // Oyuna hızlıca restart/MainMenu dönüşünde arka plan sesi çalmaya başlamasın.
        if (!this.scene.scene.isActive(this.scene.scene.key)) return;
        this.ambientLoaded = true;
        gameAudio.stopMusic(musicConfig.ambient.menuStopFadeSec);
        void gameAudio.playAmbient(musicConfig.ambient.calmTrackId, {
          fadeIn: musicConfig.ambient.fadeInSec,
        });
      })
      .catch((error: unknown) => {
        // Ambiyans yüklenemezse oyun sessiz devam eder; sahne durmaz.
        console.warn('[GameAudioDirector] Ambiyans yüklenemedi:', error);
      });

    void gameAudio.loadAllSfx();
  }

  /**
   * Sahadaki düşman sayısına göre ambiyansı sakin/gergin arasında geçirir.
   * Tehlikeye hızlı, sakinliğe temkinli geçilir — eşikler config'te.
   */
  update(deltaMs: number, enemyCount: number, isPlaying: boolean): void {
    if (!isPlaying || !this.ambientLoaded) return;

    const desired: 'calm' | 'tense' =
      enemyCount >= musicConfig.ambient.tenseEnemyThreshold ? 'tense' : 'calm';

    if (desired === this.state) {
      this.stateTimerMs = 0;
      return;
    }

    this.stateTimerMs += deltaMs;
    const thresholdMs =
      desired === 'calm' ? musicConfig.ambient.calmHoldMs : musicConfig.ambient.tenseHoldMs;
    if (this.stateTimerMs < thresholdMs) return;

    this.stateTimerMs = 0;
    this.state = desired;
    const trackId =
      desired === 'tense' ? musicConfig.ambient.tenseTrackId : musicConfig.ambient.calmTrackId;
    void gameAudio.playAmbient(trackId, {
      crossfade: true,
      fadeIn: musicConfig.ambient.fadeInSec,
    });
  }

  /** Ölüm anı — ambiyans susar, ölüm parçası ve ölüm sesi çalar. */
  playDeath(): void {
    gameAudio.stopAmbient(musicConfig.ambient.deathStopFadeSec);
    // Parça seçimi koşu PRNG'siyle: aynı seed aynı ölüm müziğini verir.
    const deathKey = deathTrackKeys[Math.floor(this.random.next() * deathTrackKeys.length)];
    void gameAudio.playMusic(musicTracks[deathKey].id, { fadeIn: musicConfig.death.fadeInSec });
    void gameAudio.playSfx('death', {
      volume: sfxVolumes.death,
      stopEvents: ['hurt', 'fire'],
    });
  }

  /** Sahne kapanışı — tüm ses kanallarını susturur. */
  stopAll(): void {
    gameAudio.stopAllSfx();
    gameAudio.stopMusic(1);
    gameAudio.stopAmbient(1);
  }
}
