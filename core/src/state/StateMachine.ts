/**
 * Tipli sonlu durum makinesi — oyun fazları (dağıtım/bahis/gösterim,
 * hazırlık/çatışma/ödül, keşif/inşa), entity davranışı, UI akışı.
 *
 * vol-hell'de faz yönetimi boolean bayrakların (`isPaused`, `isFinishing`,
 * `awaitingBlocker`) birleşimiyle yapılıyordu ve geçersiz kombinasyonlar
 * (`isPaused && isFinishing`) tipte İFADE EDİLEBİLİR kalıyordu. Durum makinesi
 * geçersiz durumu temsil edilemez kılar: her an TEK bir durum vardır ve
 * hangi geçişlerin meşru olduğu veriyle bildirilir.
 */

/** Bir durumun yaşam döngüsü kancaları. Hepsi opsiyoneldir. */
export interface StateDefinition<TState extends string> {
  /** Bu duruma girildiğinde — `from` ilk girişte `null`. */
  onEnter?: (from: TState | null) => void;
  /** Bu durumdan çıkılırken. */
  onExit?: (to: TState) => void;
  /** Bu durumdayken her `update()` çağrısında. */
  onUpdate?: (deltaMs: number) => void;
  /**
   * Bu durumdan geçilebilecek durumlar. Verilmezse HER duruma geçilebilir
   * (kısıtsız); boş dizi verilirse durum TERMİNALDİR.
   */
  transitions?: readonly TState[];
}

export interface StateMachineOptions<TState extends string> {
  initial: TState;
  states: Readonly<Record<TState, StateDefinition<TState>>>;
  /**
   * Reddedilen bir geçiş bildirilir. Verilmezse geçiş sessizce yok sayılır —
   * sessizlik, "neden faz değişmedi?" sorusunu ayıklanamaz kılar, bu yüzden
   * geliştirmede bağlanması önerilir.
   */
  onRejected?: (from: TState, to: TState) => void;
}

export class StateMachine<TState extends string> {
  private current: TState;
  private readonly states: Readonly<Record<TState, StateDefinition<TState>>>;
  private readonly onRejected?: (from: TState, to: TState) => void;
  /** onEnter/onExit içinden gelen yeniden giriş, sırayı bozmasın diye. */
  private transitioning = false;

  constructor(options: StateMachineOptions<TState>) {
    this.states = options.states;
    this.onRejected = options.onRejected;
    this.current = options.initial;
    this.states[this.current]?.onEnter?.(null);
  }

  getState(): TState {
    return this.current;
  }

  is(state: TState): boolean {
    return this.current === state;
  }

  /** Hedefe geçiş bu an meşru mu? */
  canTransition(to: TState): boolean {
    if (to === this.current) return false;
    if (!(to in this.states)) return false;
    const allowed = this.states[this.current]?.transitions;
    return allowed === undefined || allowed.includes(to);
  }

  /**
   * Duruma geçer. Geçiş meşru değilse `false` döner ve HİÇBİR kanca çalışmaz.
   *
   * Sıra: `onExit(hedef)` → durum değişir → `onEnter(kaynak)`. Bu sıra
   * bilinçlidir: çıkış kancası hâlâ eski durumun bağlamındayken çalışır,
   * giriş kancası ise `getState()` çağırdığında YENİ durumu görür.
   */
  transition(to: TState): boolean {
    if (this.transitioning) return false;
    if (!this.canTransition(to)) {
      this.onRejected?.(this.current, to);
      return false;
    }

    const from = this.current;
    this.transitioning = true;
    try {
      this.states[from]?.onExit?.(to);
      this.current = to;
      this.states[to]?.onEnter?.(from);
    } catch (error) {
      // onEnter hata fırlatırsa durum yarıda kalmasın: `current` hedefe
      // atanmıştı ama giriş kancası tamamlanmadı. Kaynağa geri dön ki
      // sonraki çağrılar yanlış durumdan devam etmesin.
      this.current = from;
      throw error;
    } finally {
      this.transitioning = false;
    }
    return true;
  }

  /** Aktif durumun `onUpdate` kancasını çağırır. */
  update(deltaMs: number): void {
    this.states[this.current]?.onUpdate?.(deltaMs);
  }
}
