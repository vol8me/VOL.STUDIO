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
   * zamanlanır — önceki tasarım release'i `setTimeout` ile tetikliyordu ve iki
   * ayri saat kullanmak sekme arka plana alındığında kirilyordu: setTimeout
   * throttle edilir, üstelik GameAudio context'i suspend ettiği için
   * `currentTime` tamamen durur. Sonuc: sekmeye dönüldüğünde muzik kisik kalırdı.
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

    // `cancelScheduledValues` yukarıda ÖNCEKİ release'i (varsa) HER ZAMAN
    // iptal eder; bu yüzden bir release HER ÇAĞRIDA yeniden planlanmalıdır.
    // Yalnız `end > activeUntil` iken planlamak YETMEZ: daha kısa/erken biten
    // bir duck, hold aşamasındaki daha uzun bir duck'ın üstüne bindiğinde şart
    // sağlanmaz, ama önceki release zaten iptal edilmiştir — gain sonsuza dek
    // duck hedefinde takılı kalır. İki adaydan (önceki kazanan pencere ve bu
    // çağrının penceresi) en GEÇ bitenin release'i planlanır.
    const previousReleaseStart = this.releaseStartAt;
    const previousEnd = this.activeUntil;
    const releaseWins = end >= previousEnd;
    const winningEnd = releaseWins ? end : previousEnd;
    const winningReleaseStart = releaseWins ? releaseStart : previousReleaseStart;

    this.activeUntil = winningEnd;
    this.releaseStartAt = winningReleaseStart;
    // Release de audio saatinde: sekma arka plandayken context durursa
    // ducking de donar ve geri dönüldüğünde kaldığı yerden dogru çözülür.
    // `currentTarget` burada 1'e set EDILMEZ — release başladığında gain
    // timeline tarafından 1'e çekilir; JS state olan currentTarget, hold
    // aşamasında gelen yeni duck'lar için etkin hedefi korumalıdır.
    this.gain.gain.setTargetAtTime(
      1,
      winningReleaseStart,
      Math.max(0.001, (winningEnd - winningReleaseStart) / 3),
    );
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
