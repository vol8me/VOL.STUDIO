import { DisposableScope, type Disposable } from '../../lifecycle/DisposableScope';
import { createRandom, type Random } from '../../random/random';
import type { UiIntentBus } from '../../ui/feedback/uiIntent';
import { SoundBank } from '../sfx/SoundBank';
import type { DuckingProfile, SidechainDucker } from '../sidechain';
import {
  UI_CRITICAL_EVENTS,
  UI_INTENT_SOUND,
  UI_MAX_VARIANTS,
  UI_MAX_VOICES,
  UI_MICRO_EVENTS,
  UI_MICRO_GAP_MS,
  UI_OUTCOME_SOUND,
  UI_RATE_JITTER,
  UI_SOUND_EVENTS,
  UI_SOUND_SEED,
  uiDuckProfiles,
  type UiSoundAssets,
  type UiSoundEvent,
} from './events';
import {
  DEFAULT_UI_AUDIO_SETTINGS,
  UI_AUDIO_STORAGE_KEY,
  channelGain,
  normalizeUiAudioSettings,
  type UiAudioChannel,
  type UiAudioSettings,
  type UiAudioSettingsStore,
} from './settings';

export type UiSoundKitState = 'inert' | 'locked' | 'ready' | 'suspended' | 'disposed';

export interface UiSoundLoadReport {
  /** En az bir varyantı yüklenen olaylar. */
  readonly loaded: readonly UiSoundEvent[];
  /** Hiç varyantı yüklenemeyen olaylar (sessiz kalır). */
  readonly failed: readonly UiSoundEvent[];
}

/** Kitin ölçüsü: çalan ses sayısı ile başlayan/düşen istek toplamları. */
export interface UiSoundMetrics {
  /** Şu an çalan UI sesi (üst sınır `UI_MAX_VOICES`). */
  readonly active: number;
  /** Gerçekten başlayan sesler. */
  readonly played: number;
  /** Çalınamayan istekler: sessiz, kilitli, gizli, mikro aralığı, bütçe ya da yüklenmemiş. */
  readonly dropped: number;
}

export interface UiSoundKitOptions {
  assets?: UiSoundAssets;
  /** Verilirse kit sahibi DEĞİLDİR ve bağlamı kapatmaz. */
  context?: AudioContext;
  /** Bağlam yoksa ilk kullanıcı jestinde çağrılır; fırlatırsa kit etkisiz (`inert`) kalır. */
  contextFactory?: () => AudioContext;
  destination?: AudioNode;
  settings?: Partial<UiAudioSettings>;
  store?: UiAudioSettingsStore;
  /** UI RNG akışının tohumu: simülasyon RNG'sinden bağımsızdır. */
  seed?: number;
  now?: () => number;
  /**
   * Kritik olayların müzik/ambiyans otobüsünü kısması (isteğe bağlı). Profil verilmezse
   * `uiDuckProfiles()` (−6 dB, 120/80/450 ms). Kit ducker'a SAHİP DEĞİLDİR: yalnız
   * kısar ve iptal/askıya alma/sessizlik/söküm anında `reset()` ile eski seviyeye döndürür.
   */
  duck?: { ducker: SidechainDucker; profiles?: Partial<Record<UiSoundEvent, DuckingProfile>> };
  /** Sayfa gizlenince sesler durur ve bağlam askıya alınır. */
  visibilityTarget?: Document;
  onError?: (error: unknown) => void;
}

/**
 * Anlamsal UI olaylarının sesi. `SoundBank`in destination/gain yolunu ve ses
 * bütçesini tüketir; UI için yeni bir genel mixer ya da müzik motoru KURMAZ.
 *
 * - Toplam en çok 4 eşzamanlı UI sesi; kritik olaylar (hata/uyarı) `normal`
 *   sesleri düşürerek çalar, `normal` ses kritiği düşüremez.
 * - Mikro olaylar (`tick`) 120 ms aralıkla sınırlıdır; kritikler muaftır.
 * - Her olayın en çok 3 varyantı SIRAYLA seçilir ve perde ±%5 değişir; seçim ve
 *   değişim kitin KENDİ tohumlu RNG akışından gelir (simülasyonu etkilemez).
 * - Gecikmeli çalma YOKTUR: bağlam kilitliyse, sayfa gizliyse, sessizse ya da bağlam
 *   yoksa ses atlanır, kuyruğa alınmaz. Geri dönüşte biriken sesler topluca çalmaz.
 * - Ürünün başarı sesi, host'un `reportOutcome` bildirimine bağlıdır.
 */
export class UiSoundKit implements Disposable {
  private readonly scope = new DisposableScope();
  private readonly random: Random;
  private readonly attached = new WeakMap<UiIntentBus, Disposable>();
  private readonly cursors = new Map<UiSoundEvent, number>();
  private context: AudioContext | null;
  private ownsContext = false;
  private bank: SoundBank | null = null;
  private current: UiAudioSettings;
  private inert = false;
  private disposed = false;
  private hidden = false;
  private unlocking = false;
  private lastMicroAt = -Infinity;
  private played = 0;
  private dropped = 0;
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly options: UiSoundKitOptions = {}) {
    this.random = createRandom(options.seed ?? UI_SOUND_SEED);
    this.current = normalizeUiAudioSettings(options.settings, DEFAULT_UI_AUDIO_SETTINGS);
    this.context = options.context ?? null;
    const target = options.visibilityTarget;
    if (target) {
      this.hidden = target.visibilityState === 'hidden';
      this.scope.addListener(target, 'visibilitychange', () => {
        if (target.visibilityState === 'hidden') this.suspend();
        else this.resume();
      });
    }
  }

  get state(): UiSoundKitState {
    if (this.disposed) return 'disposed';
    if (this.inert) return 'inert';
    if (this.hidden) return 'suspended';
    return this.context?.state === 'running' ? 'ready' : 'locked';
  }

  get settings(): UiAudioSettings {
    return this.current;
  }

  get metrics(): UiSoundMetrics {
    return { active: this.bank?.activeVoices ?? 0, played: this.played, dropped: this.dropped };
  }

  /** Bekleyen kalıcılık yazmalarının bitişi. */
  get whenSaved(): Promise<void> {
    return this.pending;
  }

  /** Kanal kazancı (sessizlik ve ana seviye dahil); ürün kendi otobüslerine uygular. */
  channelGain(channel: UiAudioChannel): number {
    return channelGain(this.current, channel);
  }

  /**
   * Bir niyet veriyoluna abone olur: niyetler ve host sonuçları sese dönüşür. Aynı
   * veriyoluna ikinci `attach` ikinci abonelik açmaz (paylaşılan kökte ses çoğalmaz).
   */
  attach(bus: UiIntentBus): Disposable {
    const existing = this.attached.get(bus);
    if (existing) return existing;
    const subscription = bus.subscribe(
      {
        onIntent: (intent) => {
          // Niyet kullanıcı jestidir: ilk niyette bağlam açılır ve açma sürerken
          // bu tek ses çalınabilir; bundan sonrası bağlam çalışırken çalar.
          void this.unlock();
          this.play(UI_INTENT_SOUND[intent.kind]);
        },
        onOutcome: (_intent, outcome) => {
          this.play(UI_OUTCOME_SOUND[outcome]);
        },
      },
      { onError: (error) => this.options.onError?.(error) },
    );
    const handle: Disposable = {
      dispose: () => {
        subscription.dispose();
        this.attached.delete(bus);
      },
    };
    this.attached.set(bus, handle);
    this.scope.add(handle);
    return handle;
  }

  /** Bağlamı (gerekirse oluşturup) kullanıcı jestiyle çalışır hâle getirir. */
  async unlock(): Promise<void> {
    if (this.disposed || this.inert || this.hidden) return;
    const context = this.ensureContext();
    if (!context || context.state === 'running') return;
    this.unlocking = true;
    try {
      await context.resume();
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.unlocking = false;
    }
  }

  /** Kayıtlı sesleri yükler; yükleme hatası olayı sessiz bırakır, kiti çökertmez. */
  async preload(): Promise<UiSoundLoadReport> {
    const bank = this.ensureBank();
    if (!bank) return { loaded: [], failed: [] };
    try {
      await bank.loadAll();
    } catch (error) {
      this.options.onError?.(error);
    }
    const loaded: UiSoundEvent[] = [];
    const failed: UiSoundEvent[] = [];
    for (const event of UI_SOUND_EVENTS) {
      const urls = this.options.assets?.[event];
      if (!urls || urls.length === 0) continue;
      const ok = urls
        .slice(0, UI_MAX_VARIANTS)
        .some((_, index) => bank.isLoaded(this.soundId(event, index)));
      (ok ? loaded : failed).push(event);
    }
    return { loaded, failed };
  }

  /** Bir olayın sesini çalar; gerçekten başladıysa `true`. Hiçbir koşulda sıraya almaz. */
  play(event: UiSoundEvent): boolean {
    const started = this.tryPlay(event);
    if (started) this.played += 1;
    else this.dropped += 1;
    return started;
  }

  private tryPlay(event: UiSoundEvent): boolean {
    if (this.disposed || this.inert || this.hidden || this.current.muted) return false;
    const urls = this.options.assets?.[event];
    if (!urls || urls.length === 0) return false;
    const bank = this.ensureBank();
    const context = this.context;
    if (!bank || !context) return false;
    // Bağlam kilitliyse yalnız jestin kendisi için `unlock` sürerken çalınabilir.
    if (context.state !== 'running' && !this.unlocking) return false;

    const critical = UI_CRITICAL_EVENTS.includes(event);
    const micro = UI_MICRO_EVENTS.includes(event);
    const now = this.now();
    if (micro && !critical && now - this.lastMicroAt < UI_MICRO_GAP_MS) return false;

    const variants = Math.min(urls.length, UI_MAX_VARIANTS);
    const start = this.cursors.get(event) ?? Math.floor(this.random.next() * variants);
    for (let step = 0; step < variants; step++) {
      const index = (start + step) % variants;
      const id = this.soundId(event, index);
      if (!bank.isLoaded(id)) continue;
      let started = false;
      try {
        started = bank.play(id, {
          rateJitter: UI_RATE_JITTER,
          priority: critical ? 'critical' : 'normal',
        });
      } catch (error) {
        this.options.onError?.(error);
        return false;
      }
      if (!started) return false;
      this.cursors.set(event, (index + 1) % variants);
      if (micro) this.lastMicroAt = now;
      const duck = this.options.duck;
      const profile = duck ? (duck.profiles ?? uiDuckProfiles())[event] : undefined;
      if (duck && profile) duck.ducker.duck(profile);
      return true;
    }
    return false;
  }

  /** Ayar değiştirir (geçersiz değer varsayılana iner), UI otobüsüne uygular ve kalıcılaştırır. */
  setSettings(patch: Partial<UiAudioSettings>): UiAudioSettings {
    if (this.disposed) return this.current;
    this.current = normalizeUiAudioSettings({ ...this.current, ...patch }, this.current);
    this.applyBusGain();
    if (this.current.muted) this.stopAll();
    const store = this.options.store;
    if (store) {
      const value = this.current;
      this.pending = this.pending
        .then(() => store.save(UI_AUDIO_STORAGE_KEY, value))
        .catch((error: unknown) => this.options.onError?.(error));
    }
    return this.current;
  }

  /** Kalıcı ayarı okur; okuma hatası bildirilir ve mevcut ayar korunur. */
  async restore(): Promise<UiAudioSettings> {
    const store = this.options.store;
    if (!store || this.disposed) return this.current;
    try {
      const saved = await store.load<unknown>(UI_AUDIO_STORAGE_KEY, undefined);
      if (!this.disposed) {
        this.current = normalizeUiAudioSettings(saved, this.current);
        this.applyBusGain();
      }
    } catch (error) {
      this.options.onError?.(error);
    }
    return this.current;
  }

  /** Çalan bütün UI seslerini keser (iptal, sahne geçişi). */
  stopAll(): void {
    this.bank?.stopAll();
    // Kesilen kritik ses yüzünden otobüs kısık kalmasın.
    this.options.duck?.ducker.reset();
  }

  /** Gizlenme/arka plan: sesler kesilir ve bağlam askıya alınır; kuyruk tutulmaz. */
  suspend(): void {
    if (this.disposed) return;
    this.hidden = true;
    this.stopAll();
    void this.context?.suspend?.().catch((error: unknown) => this.options.onError?.(error));
  }

  /** Geri dönüş: bağlam sürdürülür; askıdayken gelen hiçbir ses çalınmaz. */
  resume(): void {
    if (this.disposed) return;
    this.hidden = false;
    // Bağlam yalnız daha önce açılmışsa sürdürülür; ilk açılış kullanıcı jesti ister.
    if (this.context && !this.inert) {
      void this.context.resume().catch((error: unknown) => this.options.onError?.(error));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scope.dispose();
    this.options.duck?.ducker.reset();
    this.bank?.dispose();
    this.bank = null;
    if (this.ownsContext) void this.context?.close?.().catch(() => undefined);
    this.context = null;
  }

  private now(): number {
    return this.options.now ? this.options.now() : performance.now();
  }

  private soundId(event: UiSoundEvent, index: number): string {
    return `${event}:${index}`;
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.inert || this.disposed) return this.context;
    try {
      const factory =
        this.options.contextFactory ??
        (typeof AudioContext === 'function' ? () => new AudioContext() : null);
      if (!factory) {
        this.inert = true;
        return null;
      }
      this.context = factory();
      this.ownsContext = true;
    } catch (error) {
      this.inert = true;
      this.options.onError?.(error);
      return null;
    }
    return this.context;
  }

  private ensureBank(): SoundBank | null {
    if (this.bank) return this.bank;
    const context = this.ensureContext();
    if (!context) return null;
    try {
      const bank = new SoundBank(context, this.options.destination ?? context.destination, {
        maxVoices: UI_MAX_VOICES,
        maxVoicesPerSound: 2,
        random: this.random,
      });
      for (const event of UI_SOUND_EVENTS) {
        const urls = this.options.assets?.[event];
        if (!urls || urls.length === 0) continue;
        urls.slice(0, UI_MAX_VARIANTS).forEach((url, index) => {
          bank.register(this.soundId(event, index), [url]);
        });
      }
      this.bank = bank;
      this.applyBusGain();
    } catch (error) {
      this.inert = true;
      this.options.onError?.(error);
      return null;
    }
    return this.bank;
  }

  private applyBusGain(): void {
    this.bank?.setBusVolume(channelGain(this.current, 'ui'));
  }
}
