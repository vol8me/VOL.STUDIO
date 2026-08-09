/** SFX olaylarına bağlı olarak müzik/ambiyans otobüsünü geçici kısan sidechain ducking. */

export interface DuckingProfile {
  /** Duck hedef kazancı (0-1). 0.2 = %80 kısma. */
  target: number;
  /** Duck iniş süresi (saniye). */
  attack: number;
  /** Duck hedefinde kalma süresi (saniye). */
  hold: number;
  /** Duck çıkış süresi (saniye). */
  release: number;
}

/** Web Audio gain üzerinden basit sidechain ducking.
 *  Eşzamanlı ducking olaylarında en güçlü (en düşük target) duck uygulanır;
 *  son etkin duck bitene kadar çıkılmaz.
 */
export class SidechainDucker {
  readonly gain: GainNode;
  private activeUntil = 0;
  private currentTarget = 1;
  private releaseTimer?: number;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(destination);
  }

  /** Duck profilini uygula. */
  duck(profile: DuckingProfile): void {
    const now = this.context.currentTime;
    this.currentTarget = Math.min(this.currentTarget, profile.target);

    const attackTimeConst = Math.max(0.001, profile.attack / 3);
    this.gain.gain.setTargetAtTime(this.currentTarget, now, attackTimeConst);

    const end = now + profile.attack + profile.hold + profile.release;
    if (end > this.activeUntil) {
      this.activeUntil = end;
      clearTimeout(this.releaseTimer);
      // Attack + hold bittikten sonra release'e geç.
      this.releaseTimer = window.setTimeout(
        () => this.release(profile.release),
        Math.max(0, (profile.attack + profile.hold) * 1000),
      );
    }
  }

  /** Anında sustain seviyesine geri dön (örn. sahne değişiminde). */
  reset(fadeTime = 0.05): void {
    clearTimeout(this.releaseTimer);
    this.activeUntil = 0;
    this.currentTarget = 1;
    const now = this.context.currentTime;
    this.gain.gain.setTargetAtTime(1, now, Math.max(0.001, fadeTime / 3));
  }

  private release(release: number): void {
    const now = this.context.currentTime;
    this.currentTarget = 1;
    this.activeUntil = 0;
    this.gain.gain.setTargetAtTime(1, now, Math.max(0.001, release / 3));
  }

  dispose(): void {
    clearTimeout(this.releaseTimer);
    this.gain.disconnect();
  }
}
