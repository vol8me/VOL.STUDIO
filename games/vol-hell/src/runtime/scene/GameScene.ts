import Phaser from 'phaser';
import { AudioManager, Bar, InputManager, UIRoot, Vector2, i18next, type LoadingScreen } from '@volstudio/core';
import { Player } from '@/runtime/entity/Player';
import { Border } from '@/runtime/entity/Border';
import { EnemyManager } from '@/runtime/entity/EnemyManager';
import { BulletManager } from '@/runtime/entity/BulletManager';
import type { Bullet } from '@/runtime/entity/Bullet';
import { playerConfig } from '@/config/player';
import { bulletConfig } from '@/config/bullet';
import { enemyConfig } from '@/config/enemy';
import { uiConfig } from '@/config/ui';
import { soundKeys, soundLoadList } from '@/config';
import { audioSettings } from '@/app/bootstrap';
import { SpatialGrid } from '@/runtime/systems/SpatialGrid';
import { ParticlePool } from '@/runtime/systems/ParticlePool';
import { PauseScreen } from './PauseScreen';
import { DeathScreen } from './DeathScreen';

/**
 * Ana oyun sahnesi — bullet-hell iskeleti.
 * Player + InputManager + Border + BulletManager + EnemyManager + HUD içerir.
 */
export class GameScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private ui!: UIRoot;
  private border!: Border;
  private bulletManager!: BulletManager;
  private enemyManager!: EnemyManager;
  private healthBar!: Bar;
  private dashBar!: Bar;
  private healthBarContainer!: HTMLElement;
  private dashBarContainer!: HTMLElement;
  private loadingScreen: LoadingScreen | null = null;
  private spatialGrid: SpatialGrid = new SpatialGrid(Math.max(enemyConfig.radius, bulletConfig.radius) * 4);
  private particlePool!: ParticlePool;
  private prevHealth = 0;
  // Reusable buffer'lar — her frame yeni obje yaratmaz
  private readonly moveDirBuf: Vector2 = Vector2.zero();
  private readonly aimDirBuf: Vector2 = Vector2.zero();
  private readonly bulletsToRemoveBuf: Bullet[] = [];
  private pauseScreen: PauseScreen | null = null;
  private deathScreen: DeathScreen | null = null;
  private isPaused = false;
  private escKey!: Phaser.Input.Keyboard.Key;
  private audio!: AudioManager;
  private unsubscribeAudio: (() => void) | null = null;

  constructor() {
    super({ key: 'Game' });
  }

  preload(): void {
    for (const [key, file] of soundLoadList) {
      this.load.audio(key, file);
    }
  }

  create(data: { loadingScreen?: LoadingScreen } = {}): void {
    this.isPaused = false;
    this.loadingScreen = data.loadingScreen ?? null;
    // Border — kameradan küçük alan
    this.border = new Border(this);

    // Partikül havuzu — GameObject yaratmak yerine reuse eder
    this.particlePool = new ParticlePool(this, 48);

    // Oyuncu — border merkezinde başlar
    this.player = new Player(this, this.border.bounds.centerX, this.border.bounds.centerY, this.particlePool);
    this.player.setBorder(this.border);

    // Input — InputManager hem touch hem PC input'u yönetir
    this.inputManager = new InputManager(this);

    // Ses yöneticisi — persist edilen ayarlar anında uygulanır
    this.audio = new AudioManager(this);
    this.audio.setSfxVolume(audioSettings.getSfxVolume());
    this.audio.setMute(audioSettings.isMuted());
    this.unsubscribeAudio = audioSettings.onChange((data) => {
      this.audio.setSfxVolume(data.sfxVolume);
      this.audio.setMute(data.muted);
    });

    // Mermi ve düşman yöneticileri
    this.bulletManager = new BulletManager(this, this.particlePool);
    this.enemyManager = new EnemyManager(this, this.particlePool);

    // HUD — UIRoot canvas ile aynı konteyner'e monte edilir
    const container = this.game.canvas.parentElement ?? document.body;
    this.ui = new UIRoot(container);

    // Can barı
    this.healthBarContainer = document.createElement('div');
    this.healthBarContainer.style.position = 'absolute';
    this.healthBarContainer.style.top = 'var(--vol-space-md)';
    this.healthBarContainer.style.left = 'var(--vol-space-md)';
    this.healthBarContainer.style.width = '200px';

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
    this.dashBarContainer.style.position = 'absolute';
    this.dashBarContainer.style.top = 'calc(var(--vol-space-md) + 36px)';
    this.dashBarContainer.style.left = 'var(--vol-space-md)';
    this.dashBarContainer.style.width = '200px';

    this.dashBar = new Bar({
      variant: 'stamina',
      max: 1,
      value: 1,
      label: i18next.t('volhell:hud.dash'),
    });
    this.dashBarContainer.appendChild(this.dashBar.element);
    this.ui.mount(this.dashBarContainer);

    // Pause ekranı
    this.pauseScreen = new PauseScreen(container, audioSettings, this.audio, {
      onResume: () => this.resumeGame(),
      onRestart: () => {
        this.audio.play(soundKeys.restart, { volume: 0.5 });
        this.scene.restart();
      },
      onMainMenu: () => {
        this.audio.play(soundKeys.pause, { volume: 0.5 });
        this.scene.start('MainMenu');
      },
    });

    // Ölüm ekranı
    this.deathScreen = new DeathScreen(container, {
      onRestart: () => {
        this.audio.play(soundKeys.restart, { volume: 0.5 });
        this.scene.restart();
      },
      onMainMenu: () => {
        this.audio.play(soundKeys.pause, { volume: 0.5 });
        this.scene.start('MainMenu');
      },
    });

    // ESC tuşu ile pause
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on('down', () => this.togglePause());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    // Yükleme tamamlandı — %100 yapıp gizle
    if (this.loadingScreen) {
      this.loadingScreen.update(100);
      this.loadingScreen.hide();
    }
  }

  update(_time: number, delta: number): void {
    if (this.isPaused) return;

    this.inputManager.update(delta);

    const playerPos = this.player.getPosition();
    const state = this.inputManager.getState(playerPos);
    this.moveDirBuf.set(state.move.x, state.move.y);
    this.aimDirBuf.set(state.aim.x, state.aim.y);

    // Önce input uygula — dash update'ten önce tetiklenmeli (BUG-3 fix)
    this.player.setMoveDirection(this.moveDirBuf);

    if (state.dash) {
      if (this.player.tryDash(this.aimDirBuf)) {
        this.audio.play(soundKeys.dash, { volume: 0.5 });
      }
    }

    // Player update — dash dahil tüm hareket bu frame'de uygulanır
    this.player.update(delta);

    // Player hareket ettikten sonra güncel pozisyon al (BUG-2 fix)
    const updatedPos = this.player.getPosition();

    // Ateş — güncel pozisyondan
    if (state.fire) {
      if (this.aimDirBuf.length() > 0) {
        if (this.bulletManager.tryFire(updatedPos, this.aimDirBuf)) {
          this.audio.play(soundKeys.fire, { volume: 0.4 });
        }
      }
    }

    // Spatial grid'i bu frame için yeniden kur — enemy update'inden ÖNCE
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());

    // Mermi ve düşman güncelle — güncel pozisyon ve grid ile
    this.bulletManager.update(delta, this.border);
    this.enemyManager.update(delta, updatedPos, this.border, _time, this.spatialGrid);

    // Grid'i enemy hareketinden sonra yeniden kur — çarpışma kontrolü güncel pozisyon kullanır
    this.spatialGrid.clear();
    this.spatialGrid.insertAll(this.enemyManager.getEnemies());

    // Çarpışma: mermi → düşman (spatial grid ile)
    this.checkBulletEnemyCollisions();

    // Çarpışma: düşman → oyuncu (spatial grid ile)
    this.checkEnemyPlayerCollisions(_time);

    // Player-enemy overlap çözümü — player sıkışmasın (spatial grid ile)
    this.resolvePlayerEnemyOverlap();

    // HUD güncelle — sadece değer değişince animasyon tetiklenir
    const currentHealth = this.player.getHealth();
    if (currentHealth !== this.prevHealth) {
      this.healthBar.setValue(currentHealth);
      this.prevHealth = currentHealth;
    }
    this.dashBar.setValue(this.player.getDashChargeRatio());

    // Ölüm kontrolü — DeathScreen göster, update'i durdur
    if (!this.player.isAlive()) {
      this.onPlayerDeath();
    }
  }

  private onPlayerDeath(): void {
    // Aynı frame'de tekrar çağrılmasın
    if (this.deathScreen?.isVisible()) return;
    this.isPaused = true;
    this.input.activePointer.reset();
    this.scene.pause();
    this.audio.play(soundKeys.death, { volume: 0.7 });
    this.deathScreen?.show();
  }

  /** Mermi-düşman çarpışma kontrolü — spatial grid ile sadece komşu hücreleri kontrol eder. */
  private checkBulletEnemyCollisions(): void {
    const bullets = this.bulletManager.getBullets();
    this.bulletsToRemoveBuf.length = 0;

    for (const bullet of bullets) {
      if (!bullet.isAlive) continue;

      const nearbyEnemies = this.spatialGrid.queryNearby(bullet.x, bullet.y);
      for (const enemy of nearbyEnemies) {
        const dist = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
        if (dist < enemy.radius + bulletConfig.radius) {
          const killed = enemy.takeDamage(bullet.damage);
          this.bulletsToRemoveBuf.push(bullet);
          if (killed) {
            this.audio.play(soundKeys.enemyDeath, { volume: 0.5 });
          }
          break;
        }
      }
    }

    for (const bullet of this.bulletsToRemoveBuf) {
      this.bulletManager.removeBullet(bullet);
    }
  }

  /** Düşman-oyuncu temas kontrolü — spatial grid ile sadece yakındaki düşmanları kontrol eder. */
  private checkEnemyPlayerCollisions(time: number): void {
    const playerPos = this.player.getPosition();
    const nearbyEnemies = this.spatialGrid.queryNearby(playerPos.x, playerPos.y);

    for (const enemy of nearbyEnemies) {
      const dist = Math.hypot(enemy.x - playerPos.x, enemy.y - playerPos.y);
      if (dist < enemy.radius + playerConfig.hitboxRadius) {
        const damage = enemy.tryContactDamage(time);
        if (damage > 0) {
          if (this.player.takeDamage(damage)) {
            this.audio.play(soundKeys.hurt, { volume: 0.6 });
          }
        }
      }
    }
  }

  /**
   * Player-enemy overlap çözümü — player düşmanların içine girmesin.
   * 3 iterasyon: her iterasyonda kalan overlap azalır, titreme önlenir.
   * Player ve düşman karşılıklı itilir, border clamp uygulanır.
   */
  private resolvePlayerEnemyOverlap(): void {
    const iterations = 3;

    for (let iter = 0; iter < iterations; iter++) {
      const playerPos = this.player.getPosition();
      const nearbyEnemies = this.spatialGrid.queryNearby(playerPos.x, playerPos.y);
      let pushX = 0;
      let pushY = 0;
      let hasOverlap = false;

      for (const enemy of nearbyEnemies) {
        const dx = playerPos.x - enemy.x;
        const dy = playerPos.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        const minDist = enemy.radius + playerConfig.hitboxRadius;

        if (dist < minDist && dist > 0) {
          hasOverlap = true;
          const overlap = minDist - dist;
          const pushDist = (overlap * 0.5) / (iterations - iter);
          pushX += (dx / dist) * pushDist;
          pushY += (dy / dist) * pushDist;
          enemy.applyPush(-(dx / dist) * pushDist, -(dy / dist) * pushDist, this.border);
        }
      }

      if (pushX !== 0 || pushY !== 0) {
        this.player.applyPush(pushX, pushY);
      }

      if (!hasOverlap) break;
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
    this.audio.play(soundKeys.pause, { volume: 0.5 });
    this.pauseScreen?.show();
  }

  private resumeGame(): void {
    if (!this.isPaused) return;
    // Death screen aktifken resume yapılamaz
    if (this.deathScreen?.isVisible()) return;
    this.isPaused = false;
    this.scene.resume();
    this.audio.play(soundKeys.resume, { volume: 0.5 });
    this.pauseScreen?.hide();
  }

  private onShutdown(): void {
    // Phaser GameObject'leri (player, bulletManager, enemyManager, border)
    // DisplayList.shutdown() tarafından zaten yok edilir — tekrar destroy etmeye gerek yok.
    // Burada sadece Phaser'ın temizlemediği kaynaklar temizlenir:
    // input listener'lar, DOM elementleri, i18n listener'ları ve timer'lar.
    if (this.unsubscribeAudio) {
      this.unsubscribeAudio();
      this.unsubscribeAudio = null;
    }
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
    this.ui.destroy();
    if (this.loadingScreen) {
      this.loadingScreen.destroy();
      this.loadingScreen = null;
    }
  }
}
