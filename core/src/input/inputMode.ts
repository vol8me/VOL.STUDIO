/**
 * Girdi kipi politikası — hangi sağlayıcının "son sözü" söylediğini kararlaştırır.
 *
 * **Kural:** son ANLAMLI girdi kazanır. Her sağlayıcının boşta→etkin KENAR
 * zamanı tutulur; kip, etkin sağlayıcılar arasında kenarı en taze olana
 * geçer. Sürekli basılı tutulan girdi kenar yenilemez — yeni hareket
 * başlatan kazanır. **Histerezis:** kenar zamanları eşitse görevli kazanır;
 * aynı fiziksel hareketin iki kanala sızması kipi gidip getirmez.
 * **Yapışkanlık:** kimse etkin değilken kip son kazananda kalır — kip bir
 * GÖRÜNTÜ sözleşmesidir (glif, odak halkası); `InputState` bundan bağımsız
 * olarak etkin sağlayıcılardan birleştirilir, biri ötekini kilitlemez.
 *
 * Saat enjekte edilebilir: kenar karşılaştırması monoton zaman ister, duvar
 * saati sıçraması (uyku dönüşü) kipi kilitlememeli.
 */
export interface InputModePolicyOptions {
  /**
   * Başlangıç kipi. Cihazın tek girdi biçimi belli olduğunda (gamescope'ta
   * kol) ilk kareden itibaren doğru glif/odak gösterilir; ilk gerçek girdi
   * geldiğinde normal kurallar devralır.
   */
  initial?: string;
  /** Monoton saat; varsayılan `performance.now`. */
  now?: () => number;
}

interface ProviderActivity {
  /** Bu kare anlamlı girdi üretiyor mu. */
  active: boolean;
  /** Etkinliğin başladığı (boşta→etkin kenarı) an; hiç olmadıysa -Infinity. */
  lastEdgeAt: number;
}

export class InputModeArbiter {
  private readonly records = new Map<string, ProviderActivity>();
  private readonly nowFn: () => number;
  private current: string | undefined;

  constructor(options: InputModePolicyOptions = {}) {
    this.nowFn =
      options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.current = options.initial;
  }

  /** Geçerli girdi kipi — sağlayıcı kimliği ya da `undefined`. */
  get mode(): string | undefined {
    return this.current;
  }

  /**
   * Her kare `InputManager.update` çağırır. `entries` sağlayıcı sırasını
   * taşır; eşit kenar zamanlarında önce gözlemlenen kazanır — eski
   * "dokunmatik önce" kuralı buraya liste sırası olarak taşınır.
   */
  observe(entries: ReadonlyArray<{ id: string; active: boolean }>): void {
    const now = this.nowFn();
    for (const { id, active } of entries) {
      const record = this.records.get(id) ?? { active: false, lastEdgeAt: -Infinity };
      if (active && !record.active) {
        record.lastEdgeAt = now;
      }
      record.active = active;
      this.records.set(id, record);
    }

    const holder = this.current ? this.records.get(this.current) : undefined;
    let challenger: { id: string; edgeAt: number } | undefined;
    for (const { id } of entries) {
      const record = this.records.get(id);
      if (!record?.active) continue;
      if (!challenger || record.lastEdgeAt > challenger.edgeAt) {
        challenger = { id, edgeAt: record.lastEdgeAt };
      }
    }
    if (!challenger || challenger.id === this.current) return;

    // Histerezis: görevlinin kenarı daha taze ya da eşitse (aynı karede
    // etkinleştiler) kip değişmez; yalnız kesinlikle daha yeni bir kenar
    // ya da boşta kalmış bir görevli geçişe izin verir.
    if (holder?.active && challenger.edgeAt <= holder.lastEdgeAt) return;

    this.current = challenger.id;
  }

  /**
   * Durum birleştirimi için tercih sırası: önce kip sahibi, sonra geri kalan
   * etkin sağlayıcılar (gözlem sırasıyla). `InputManager` hareket ve nişanı
   * bu sırayla DOLU olanı seçer; eylemler kipten bağımsız olarak birleşir.
   */
  priorityOrder(ids: readonly string[]): string[] {
    if (this.current && ids.includes(this.current)) {
      return [this.current, ...ids.filter((id) => id !== this.current)];
    }
    return [...ids];
  }
}

/**
 * Oturumdan başlangıç kipi: kol öncelikli oturum (gamescope, Big Picture) kol
 * kipiyle başlar; bilinmeyende `undefined`, hakem ilk girdiyle kurar.
 */
export function inputModeForSession(sessionKind: string): string | undefined {
  return sessionKind === 'gamescope' || sessionKind === 'bigpicture' ? 'gamepad' : undefined;
}
