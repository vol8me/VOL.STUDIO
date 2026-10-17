import { DisposableScope, type Disposable } from '../../lifecycle/DisposableScope';
import { MOTION_BUDGET, MOTION_SAFETY_MARGIN_MS } from './presets';

/** Öncelik: kritik/odak > kullanıcının eylemi > dekor. */
export type MotionPriority = 'critical' | 'user' | 'decor';

/**
 * Hareketin amacı: `decor` hareket azaltmada 0 süreye iner; `semantic` anlamı
 * opacity/etiket/ring ile taşır (süre korunur, taşıma hareketi bileşende
 * kapatılır); `functional` işlevsel zamanlayıcıdır ve HİÇ değişmez.
 */
export type MotionKind = 'decor' | 'semantic' | 'functional';

export interface MotionGroupRequest {
  priority: MotionPriority;
  kind?: MotionKind;
  /** Planlanan süre (ms); `effectiveMs` ile hareket politikasına göre ayarlanır. */
  durationMs: number;
  /**
   * Hareket bitince, iptal edilince, kesilince, askıya alınınca ya da kaynak
   * kapanınca TAM BİR KEZ çağrılır: bileşen son durumu burada uygular.
   */
  onFinal?: () => void;
}

export interface MotionGrant {
  /** Hareket azaltma/bütçe sonrası uygulanacak süre (ms); 0 ise hareket yok. */
  readonly durationMs: number;
  readonly active: boolean;
  /** Hareketi bitirir ve `onFinal`ı çağırır; ikinci çağrı etkisizdir. */
  finish(): void;
}

export interface MotionParticleGrant {
  /** Verilen parçacık hakkı (isteğin altında olabilir: burst'te dekor kısılır). */
  readonly count: number;
  release(): void;
}

export interface MotionUsage {
  readonly groups: number;
  readonly particles: number;
  readonly blur: number;
}

export interface MotionControllerOptions {
  /** Hareket azaltma tercihi; verilmezse `prefers-reduced-motion` okunur. */
  reducedMotion?: () => boolean;
  /** Sayfa gizlenince/askıya alınınca tüm hareketler son duruma gider. */
  visibilityTarget?: Document;
  budget?: { groups: number; particles: number; blur: number };
  /** `onFinal` hatası: bir geri çağrının fırlatması kalan temizliği engellemez. */
  onError?: (error: unknown) => void;
}

interface GroupEntry {
  readonly priority: MotionPriority;
  readonly sequence: number;
  readonly onFinal?: () => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  active: boolean;
}

const RANK: Record<MotionPriority, number> = { critical: 3, user: 2, decor: 1 };

/**
 * UI kökü başına hareket bütçesi ve yaşam döngüsü sahibi. Bileşenler bir geçiş
 * grubu için `requestGroup` ile hak ister; verilen hak hem süreyi (hareket
 * azaltma dahil) hem de temizliği garanti eder:
 *
 * - En çok 3 eşzamanlı semantik grup, toplam 64 dekor parçacığı, 1 etkin blur.
 *   Sınır dolunca öncelik sırası uygulanır: kritik/odak > kullanıcı eylemi >
 *   dekor; dekor reddedilir ya da önce kesilir (son durumuna gönderilir).
 *   `null` dönüş "hareket yok": bileşen son durumu hemen uygular, blur reddinde
 *   düz scrim kullanır.
 * - Hak her koşulda temizlenir: bitiş, iptal, kesinti, askıya alma, `dispose` ve
 *   animasyon olayı hiç gelmese bile süre + emniyet payı sonunda `onFinal`.
 * - Hareket azaltmada dekor süresi 0'dır ve hak SENKRON biter; işlevsel süre
 *   (basılı tutma, şarj, oyun sayacı) asla değiştirilmez.
 */
export class MotionController implements Disposable {
  private readonly budget: { groups: number; particles: number; blur: number };
  private readonly groups = new Set<GroupEntry>();
  private particles = 0;
  private blur = 0;
  private sequence = 0;
  private override: boolean | null = null;
  private disposed = false;
  private readonly scope = new DisposableScope();

  constructor(private readonly options: MotionControllerOptions = {}) {
    this.budget = options.budget ?? MOTION_BUDGET;
    const target = options.visibilityTarget;
    if (target) {
      this.scope.addListener(target, 'visibilitychange', () => {
        if (target.visibilityState === 'hidden') this.suspend();
      });
    }
  }

  get reducedMotion(): boolean {
    if (this.override !== null) return this.override;
    if (this.options.reducedMotion) return this.options.reducedMotion();
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  /** `null` sistem tercihine döner. */
  setReducedMotion(value: boolean | null): void {
    this.override = value;
  }

  get usage(): MotionUsage {
    return { groups: this.groups.size, particles: this.particles, blur: this.blur };
  }

  /**
   * Hareket politikasına göre etkin süre. `functional` her zaman aynen döner;
   * `decor` hareket azaltmada 0; `semantic` süresini korur.
   */
  effectiveMs(ms: number, kind: MotionKind = 'decor'): number {
    if (kind === 'functional') return ms;
    if (kind === 'decor' && this.reducedMotion) return 0;
    return ms;
  }

  /** Geçiş grubu hakkı iste; `null` = hareket yok, son durumu hemen uygula. */
  requestGroup(request: MotionGroupRequest): MotionGrant | null {
    if (this.disposed) {
      this.settle(request.onFinal);
      return null;
    }
    const kind = request.kind ?? 'decor';
    const durationMs = this.effectiveMs(request.durationMs, kind);
    if (durationMs <= 0) {
      // Sıfır süre: hareket yok, temizlik senkron.
      this.settle(request.onFinal);
      return { durationMs: 0, active: false, finish: () => undefined };
    }

    if (this.groups.size >= this.budget.groups && !this.makeRoom(request.priority)) {
      this.settle(request.onFinal);
      return null;
    }

    const entry: GroupEntry = {
      priority: request.priority,
      sequence: (this.sequence += 1),
      onFinal: request.onFinal,
      timer: undefined,
      active: true,
    };
    this.groups.add(entry);
    // Animasyon olayı gelmese de temizlik tamamlanır.
    entry.timer = setTimeout(() => this.end(entry), durationMs + MOTION_SAFETY_MARGIN_MS);
    return {
      durationMs,
      get active() {
        return entry.active;
      },
      finish: () => this.end(entry),
    };
  }

  /** Dekor parçacığı hakkı: toplam sınırı aşan kısım verilmez (burst'te dekor düşer). */
  requestParticles(count: number): MotionParticleGrant | null {
    if (this.disposed || this.reducedMotion) return null;
    const granted = Math.max(
      0,
      Math.min(Math.floor(count), this.budget.particles - this.particles),
    );
    if (granted === 0) return null;
    this.particles += granted;
    let released = false;
    return {
      count: granted,
      release: () => {
        if (released) return;
        released = true;
        this.particles -= granted;
      },
    };
  }

  /** Etkin blur yüzeyi hakkı; sınır doluysa `null`: bileşen düz scrim yedeğini kullanır. */
  requestBlur(): Disposable | null {
    if (this.disposed || this.blur >= this.budget.blur) return null;
    this.blur += 1;
    let released = false;
    return {
      dispose: () => {
        if (released) return;
        released = true;
        this.blur -= 1;
      },
    };
  }

  /** Kesinti (dil/tema değişimi, iptal): bütün gruplar son durumuna gider. */
  cancelAll(): void {
    for (const entry of [...this.groups]) this.end(entry);
  }

  /** Gizlenme/askıya alma: bütün hareketler son duruma gider. */
  suspend(): void {
    this.cancelAll();
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelAll();
    this.disposed = true;
    this.scope.dispose();
  }

  /** Yer açar: daha düşük öncelikli en eski grubu sonlandırır. Yer yoksa `false`. */
  private makeRoom(priority: MotionPriority): boolean {
    let victim: GroupEntry | undefined;
    for (const entry of this.groups) {
      if (RANK[entry.priority] > RANK[priority]) continue;
      // Eşit önceliklide yalnız kritik kendinden eski kritiği kesebilir.
      if (RANK[entry.priority] === RANK[priority] && priority !== 'critical') continue;
      if (
        !victim ||
        RANK[entry.priority] < RANK[victim.priority] ||
        (RANK[entry.priority] === RANK[victim.priority] && entry.sequence < victim.sequence)
      )
        victim = entry;
    }
    if (!victim) return false;
    this.end(victim);
    return true;
  }

  private end(entry: GroupEntry): void {
    if (!entry.active) return;
    entry.active = false;
    if (entry.timer !== undefined) clearTimeout(entry.timer);
    this.groups.delete(entry);
    this.settle(entry.onFinal);
  }

  private settle(onFinal: (() => void) | undefined): void {
    if (!onFinal) return;
    try {
      onFinal();
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}
