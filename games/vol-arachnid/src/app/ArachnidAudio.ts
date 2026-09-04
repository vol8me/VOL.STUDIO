import {
  DisposableScope,
  MusicEngine,
  SoundBank,
  clamp01,
  observeAppVisibility,
} from '@volstudio/core';
import {
  arachnidAmbienceTrack,
  arachnidAudioConfig,
  arachnidSoundAssets,
  type ArachnidSoundEvent,
} from '@/config/audio';

/** Ön yüklemenin en fazla kaç kez deneneceği — sonsuz yeniden yükleme yok. */
const MAX_PREPARE_ATTEMPTS = 3;

type SoundBankPort = Pick<SoundBank, 'register' | 'loadAll' | 'play' | 'setBusVolume' | 'dispose'>;
type AmbiencePort = Pick<MusicEngine, 'loadTrack' | 'play' | 'dispose'>;

export interface ArachnidAudioOptions {
  /** Testte Web Audio yüzeyini enjekte etmek için. */
  context?: AudioContext;
  soundBank?: SoundBankPort;
  ambience?: AmbiencePort;
}

export interface ArachnidAudioPort {
  play(event: ArachnidSoundEvent, intensity?: number): void;
}

/**
 * VOL.ARACHNID'in tek ses yaşam döngüsü.
 *
 * SFX ve ambiyans aynı AudioContext/master limiter'ı paylaşır. Dosyalar açılışta
 * arka planda decode edilir; AudioContext ve ambiyans yalnız ilk gerçek kullanıcı
 * etkileşiminde başlar — Android WebView'ın autoplay kapısı böyle aşılır.
 */
export class ArachnidAudio implements ArachnidAudioPort {
  private readonly context: AudioContext;
  private readonly masterGain: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly soundBank: SoundBankPort;
  private readonly ambience: AmbiencePort;
  private readonly lifecycle = new DisposableScope();
  private readonly unlockScope = new DisposableScope();
  private preparePromise: Promise<void> | null = null;
  /**
   * Ön yükleme kalıcı olarak başarısız oldu mu?
   *
   * Yerel dosyalarda hata genellikle kalıcıdır ama WebView'da değildir: geçici
   * bir decode/ağ hatası tek bir turda görülüp bir daha denenmezse ses o oturum
   * boyunca ölür. Deneme SINIRLI: sonsuz yeniden yükleme, hatanın kendisinden
   * daha kötü bir yük olurdu.
   */
  private prepareAttempts = 0;
  private ambienceReady = false;
  private unlocked = false;
  /** Süren bir başlatma denemesi var mı? Eşzamanlı iki olayı tekler. */
  private unlockPending = false;
  private ambienceStarted = false;
  private destroyed = false;

  constructor(options: ArachnidAudioOptions = {}) {
    this.context = options.context ?? createAudioContext();
    this.masterGain = this.context.createGain();
    this.limiter = this.context.createDynamicsCompressor();

    const { limiter } = arachnidAudioConfig;
    this.limiter.threshold.value = limiter.thresholdDb;
    this.limiter.knee.value = limiter.kneeDb;
    this.limiter.ratio.value = limiter.ratio;
    this.limiter.attack.value = limiter.attackSeconds;
    this.limiter.release.value = limiter.releaseSeconds;
    this.masterGain.gain.value = arachnidAudioConfig.masterVolume;
    this.masterGain.connect(this.limiter);
    this.limiter.connect(this.context.destination);

    this.soundBank =
      options.soundBank ??
      new SoundBank(this.context, this.masterGain, {
        maxVoices: arachnidAudioConfig.maxVoices,
        maxVoicesPerSound: arachnidAudioConfig.maxVoicesPerSound,
        minRetriggerMs: arachnidAudioConfig.minRetriggerMs,
      });
    this.soundBank.setBusVolume(arachnidAudioConfig.sfxVolume);
    for (const [event, urls] of Object.entries(arachnidSoundAssets)) {
      this.soundBank.register(event, urls);
    }

    this.ambience =
      options.ambience ??
      new MusicEngine({
        audioContext: this.context,
        destination: this.masterGain,
        masterVolume: arachnidAudioConfig.ambienceVolume,
        compressor: false,
      });

    this.armUnlock();
    this.lifecycle.addSubscription(
      observeAppVisibility((state) => {
        if (state === 'background') {
          if (this.context.state === 'running') void this.suspend();
          return;
        }
        /*
         * Öne dönüşte KOŞULSUZ yeniden denenir: askıya alma başarısız olabilir
         * ve context 'running' kalır, o zaman duruma bakan bir koşul geçmez ve
         * ambiyans oturum boyunca ölü kalır. `resumeAndStart` yeniden
         * girilebilirdir; zaten çalıyorsa hemen döner.
         */
        if (this.unlocked) void this.resumeAndStart();
      }),
    );
    // Decode açılışı bloke etmez; ilk olay gelmeden buffer'ların hazır olma
    // olasılığını artırır. Her dosyanın hatası kendi katmanında izole edilir.
    void this.prepare();
  }

  play(event: ArachnidSoundEvent, intensity = 1): void {
    if (this.destroyed) return;
    const mix = arachnidAudioConfig.events[event];
    try {
      this.soundBank.play(event, {
        gain: mix.gain * clamp01(Number.isFinite(intensity) ? intensity : 0),
        rateJitter: mix.rateJitter,
      });
    } catch (error) {
      // Tek bir WebAudio node hatası oyun döngüsünü durdurmamalı.
      console.warn(`[ArachnidAudio] "${event}" sesi çalınamadı:`, error);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unlockScope.dispose();
    this.lifecycle.dispose();
    this.soundBank.dispose();
    this.ambience.dispose();
    this.masterGain.disconnect();
    this.limiter.disconnect();
    if (this.context.state !== 'closed') {
      void this.context.close().catch((error: unknown) => {
        console.warn('[ArachnidAudio] AudioContext kapatılamadı:', error);
      });
    }
  }

  /**
   * İlk gerçek kullanıcı hareketinde AudioContext'i açar.
   *
   * İki ayrı soru, iki ayrı bayrak:
   *
   * - `unlocked` — kullanıcı hareketi OLDU mu? Bir kez doğru olur ve geri
   *   alınmaz; öne dönüş yolu bunu okuyup yeniden denemeye karar verir.
   * - `unlockPending` — süren bir başlatma var mı? Aynı karede gelen
   *   `pointerdown` ve `keydown` ikinci bir denemeyi başlatmamalı.
   *
   * Dinleyiciler başlatma BAŞARILI olana kadar bırakılmaz: ilk deneme
   * patlarsa (autoplay kapısı, geçici decode hatası) ikinci bir kullanıcı
   * hareketi yeniden denemelidir.
   */
  private armUnlock(): void {
    const unlock = (): void => {
      if (this.destroyed || this.unlockPending) return;
      this.unlockPending = true;
      // Kullanıcı hareketi OLDU; bu geri alınmaz. Öne dönüş yolu bunu okur.
      this.unlocked = true;
      void this.resumeAndStart().then((started) => {
        this.unlockPending = false;
        // Dinleyiciler ancak ses gerçekten başladığında bırakılır.
        if (started || this.destroyed) this.unlockScope.dispose();
      });
    };
    for (const event of ['pointerdown', 'touchstart', 'keydown'] as const) {
      this.unlockScope.addListener(window, event, unlock, { passive: true });
    }
  }

  /**
   * SFX ve ambiyansı ön yükler.
   *
   * Söz (promise) BİR KEZ kurulup sonsuza dek paylaşılmıyor: eskiden hata
   * yakalanıp `resolve` ediliyordu, yani başarısız bir yükleme "tamamlandı"
   * sayılıyor ve bir daha hiç denenmiyordu. Şimdi başarısız bir tur sözü
   * bırakır; bir sonraki çağrı — genelde uygulama öne geldiğinde —
   * `MAX_PREPARE_ATTEMPTS` sınırına kadar yeniden dener.
   */
  private prepare(): Promise<void> {
    if (this.preparePromise) return this.preparePromise;
    if (this.prepareAttempts >= MAX_PREPARE_ATTEMPTS) return Promise.resolve();

    this.prepareAttempts += 1;
    const attempt = Promise.all([
      this.soundBank.loadAll().then(
        () => true,
        (error: unknown) => {
          console.warn('[ArachnidAudio] SFX ön-yüklemesi tamamlanamadı:', error);
          return false;
        },
      ),
      this.ambience.loadTrack(arachnidAmbienceTrack).then(
        (loaded) => {
          this.ambienceReady = loaded;
          return loaded;
        },
        (error: unknown) => {
          console.warn('[ArachnidAudio] Ambiyans yüklenemedi:', error);
          return false;
        },
      ),
    ]).then(([sfxOk, ambienceOk]) => {
      // Bir parça bile eksikse söz BIRAKILIR; sonraki çağrı yeniden dener.
      if (!sfxOk || !ambienceOk) this.preparePromise = null;
    });

    this.preparePromise = attempt;
    return attempt;
  }

  /**
   * Context'i açar ve ambiyansı başlatır. Ses BAŞLADIYSA (ya da zaten
   * çalıyorsa) `true` döner.
   *
   * Her `await`ten sonra `destroyed` yeniden okunur: yıkım bir bekleme
   * noktasında araya girebilir ve kapanmış bir context üzerinde çalmak
   * anlamsızdır. Yalnız başta bakmak yetmiyordu.
   */
  private async resumeAndStart(): Promise<boolean> {
    try {
      if (this.destroyed) return false;
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.destroyed) return false;

      await this.prepare();
      if (this.destroyed) return false;
      if (this.ambienceStarted) return true;
      if (!this.ambienceReady) return false;

      await this.ambience.play(arachnidAmbienceTrack.id, { fadeIn: 1.2 });
      if (this.destroyed) return false;
      this.ambienceStarted = true;
      return true;
    } catch (error) {
      // Ses hiçbir zaman oyunu durduracak bir hata yüzeyi değildir; sonraki
      // kullanıcı hareketi ya da foreground olayı yeniden deneyebilir.
      console.warn('[ArachnidAudio] Ses başlatılamadı:', error);
      return false;
    }
  }

  private async suspend(): Promise<void> {
    try {
      await this.context.suspend();
    } catch (error) {
      console.warn('[ArachnidAudio] AudioContext askıya alınamadı:', error);
    }
  }
}

function createAudioContext(): AudioContext {
  const Context =
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) throw new Error('Web Audio API desteklenmiyor.');
  return new Context();
}

/** Web Audio olmayan bir ortam oyunu değil, yalnız ses katmanını kaybeder. */
export function createArachnidAudio(): ArachnidAudio | null {
  try {
    return new ArachnidAudio();
  } catch (error) {
    console.warn('[ArachnidAudio] Ses altyapısı kurulamadı:', error);
    return null;
  }
}
