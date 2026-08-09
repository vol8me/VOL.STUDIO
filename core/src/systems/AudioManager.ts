import type Phaser from 'phaser';

/**
 * Eksik ses asset'i oyunu asla düşürmemelidir: bilinmeyen
 * key sessizce geçilir, bir kez konsola uyarı basılır.
 * volume parametresi sfxVolume ile çarpılarak son ses seviyesi belirlenir.
 */
export class AudioManager {
  private readonly warnedMissingKeys = new Set<string>();
  private sfxVolume = 1;

  constructor(private readonly scene: Phaser.Scene) {}

  /** SFX ses seviyesi (0-1). play() ile çalınan sesler bu değerle ölçeklenir. */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  play(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (!this.scene.sound.get(key) && !this.scene.cache.audio.exists(key)) {
      if (!this.warnedMissingKeys.has(key)) {
        this.warnedMissingKeys.add(key);
        console.warn(`[AudioManager] Ses bulunamadı, çalınmıyor: "${key}"`);
      }
      return;
    }

    const merged = config
      ? { ...config, volume: (config.volume ?? 1) * this.sfxVolume }
      : { volume: this.sfxVolume };

    this.scene.sound.play(key, merged);
  }

  setMute(muted: boolean): void {
    this.scene.sound.mute = muted;
  }

  stopAll(): void {
    this.scene.sound.stopAll();
  }
}
