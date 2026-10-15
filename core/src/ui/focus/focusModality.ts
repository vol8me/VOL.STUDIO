import { DisposableScope } from '../../lifecycle/DisposableScope';

/** Köke yazılan öznitelik: `ring` halka gösterir, `quiet` göstermez. */
export const FOCUS_MODALITY_ATTR = 'data-vol-focus';

export type FocusModality = 'ring' | 'quiet';

export interface FocusModalityOptions {
  /**
   * Kimse hiçbir şeye dokunmadan önceki kip. Varsayılan `quiet`: programatik `focus()` çağrısı tarayıcıda
   * `:focus-visible` sayılır ve fareyle açılan bir ana menüde ilk düğmeye halka çizerdi. Cihazın tek girdisi
   * kol ya da klavyeyse (Deck, kol bağlı) `ring` verilir.
   */
  initial?: FocusModality;
  /** Kol yoklaması; verilmezse `navigator.getGamepads`. Test için enjekte edilir. */
  getGamepads?: () => ReadonlyArray<{
    buttons: ReadonlyArray<{ pressed: boolean }>;
    axes: ReadonlyArray<number>;
  } | null>;
  root?: HTMLElement;
}

/** Kol çubuğunun bu eşiğin altı ölü bölgedir. */
const STICK_DEADZONE = 0.5;

let active: FocusModalityTracker | null = null;

/**
 * Son anlamlı girdi aygıtına göre odak halkasının gösterilip gösterilmeyeceğini köke yazar. Klavye ve kol
 * `ring`, fare ve dokunma `quiet` yapar. CSS tarafı `:focus-visible` kurallarını bu özniteliğe bağlar:
 * öznitelik hiç yoksa (izleyici başlamadıysa) halka eskisi gibi gösterilir.
 *
 * Kol gezintisinin kendi halkası (`vol-focusnav-current`) bu geçitten etkilenmez; geçit yalnız tarayıcının
 * kendi `:focus-visible` sezgisini yönetir.
 */
export class FocusModalityTracker {
  private readonly scope = new DisposableScope();
  readonly root: HTMLElement;
  private current: FocusModality;

  constructor(private readonly options: FocusModalityOptions = {}) {
    this.root = options.root ?? document.documentElement;
    this.current = options.initial ?? 'quiet';
    this.write();
    const set = (value: FocusModality) => () => this.set(value);
    // Yalnız gezinti tuşları halka açar: bir tuşa basan oyuncu (WASD) fare imleciyle menüde gezmeyi bırakmaz,
    // ama Tab ve oklar kesinlikle klavye gezintisidir.
    this.scope.addListener(document, 'keydown', (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (NAV_KEYS.has(event.key)) this.set('ring');
    });
    this.scope.addListener(document, 'pointerdown', set('quiet'));
    this.scope.addListener(document, 'pointermove', (event: PointerEvent) => {
      // Dokunma ve fare hareketi sessize alır; kolun sanal imleci `pointerType: gamepad` olabilir ve yok sayılır.
      if (event.pointerType === 'mouse' || event.pointerType === 'touch') this.set('quiet');
    });
    const poll = (): void => {
      if (this.padActive()) this.set('ring');
      this.scope.addAnimationFrame(poll);
    };
    this.scope.addAnimationFrame(poll);
  }

  get modality(): FocusModality {
    return this.current;
  }

  /** Kipi elle belirler (örn. başlangıçta Deck algılanınca). */
  set(value: FocusModality): void {
    if (this.current === value) return;
    this.current = value;
    this.write();
  }

  destroy(): void {
    this.scope.dispose();
    this.root.removeAttribute(FOCUS_MODALITY_ATTR);
  }

  private write(): void {
    this.root.setAttribute(FOCUS_MODALITY_ATTR, this.current);
  }

  private padActive(): boolean {
    const read =
      this.options.getGamepads ??
      (() => (typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []));
    let pads: ReturnType<NonNullable<FocusModalityOptions['getGamepads']>>;
    try {
      pads = read();
    } catch {
      return false;
    }
    for (const pad of pads) {
      if (!pad) continue;
      if (pad.buttons.some((button) => button.pressed)) return true;
      if (pad.axes.some((axis) => Math.abs(axis) > STICK_DEADZONE)) return true;
    }
    return false;
  }
}

const NAV_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Enter',
  ' ',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * Belge geneli izleyiciyi başlatır (tek örnek; ikinci çağrı mevcudu döner ve `initial`i değiştirmez).
 * `UIRoot` bunu kendiliğinden çağırır; kol ya da Deck bilgisi olan sahip ilk kareden önce `initial: 'ring'`
 * ile çağırabilir.
 */
export function startFocusModality(options: FocusModalityOptions = {}): FocusModalityTracker {
  if (typeof document === 'undefined') throw new Error('startFocusModality: belge yok');
  if (!active || active.root !== (options.root ?? document.documentElement)) {
    active?.destroy();
    active = new FocusModalityTracker(options);
  }
  return active;
}

/** Test ve kapanış için: belge geneli izleyiciyi söker. */
export function stopFocusModality(): void {
  active?.destroy();
  active = null;
}
