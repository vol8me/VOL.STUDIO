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
  private releaseStartAt = 0;
  private currentTarget = 1;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(destination);
  }

  /**
   * Duck profilini uygular. Hem duck hem release AudioContext zaman cizelgesine
   * zamanlanir — onceki tasarim release'i `setTimeout` ile tetikliyordu ve iki
   * ayri saat kullanmak sekme arka plana alindiginda kirilyordu: setTimeout
   * throttle edilir, ustelik GameAudio context'i suspend ettigi icin
   * `currentTime` tamamen durur. Sonuc: sekmeye donuldugunde muzik kisik kalirdi.
   */
  duck(profile: DuckingProfile): void {
    const now = this.context.currentTime;
    // Release aşamasında yeni duck gelirse gain zaten 1'e gidiyordur; yeni
    // target'a çek. Hold/attack aşamasındaysa en güçlü (en düşük) duck uygulanır.
    // Önceki tasarım release planlandığı an `currentTarget = 1` yapıyordu — bu,
    // hold devam ederken gelen ikinci duck'ın min(1, target) = target ile
    // önceki duck'ı zayıflatmasına yol açıyordu.
    const inReleasePhase = this.activeUntil > 0 && now >= this.releaseStartAt;
    this.currentTarget = inReleasePhase
      ? profile.target
      : Math.min(this.currentTarget, profile.target);

    const attackTimeConst = Math.max(0.001, profile.attack / 3);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(this.currentTarget, now, attackTimeConst);

    const releaseStart = now + profile.attack + profile.hold;
    const end = releaseStart + profile.release;

    if (end > this.activeUntil) {
      this.activeUntil = end;
      this.releaseStartAt = releaseStart;
      // Release de audio saatinde: sekma arka plandayken context durursa
      // ducking de donar ve geri donuldugunde kaldigi yerden dogru cozulur.
      // `currentTarget` burada 1'e set EDILMEZ — release başladığında gain
      // timeline tarafından 1'e çekilir; JS state olan currentTarget, hold
      // aşamasında gelen yeni duck'lar için etkin hedefi korumalıdır.
      this.gain.gain.setTargetAtTime(1, releaseStart, Math.max(0.001, profile.release / 3));
    }
  }

  /** Anında sustain seviyesine geri dön (örn. sahne değişiminde). */
  reset(fadeTime = 0.05): void {
    this.activeUntil = 0;
    this.releaseStartAt = 0;
    this.currentTarget = 1;
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(1, now, Math.max(0.001, fadeTime / 3));
  }

  dispose(): void {
    this.reset(0);
    this.gain.disconnect();
  }
}
