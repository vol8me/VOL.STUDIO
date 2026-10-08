/** Kol A tuşu odaktaki basılı-tutma denetimine basış ve bırakışı bu olaylarla iletir (kenar tetikli `click` yetmez). */
export const FOCUS_PRESS_EVENT = 'vol:focuspress';
export const FOCUS_RELEASE_EVENT = 'vol:focusrelease';

/** Basılı-tutma denetimini kol gezinmesine tanıtan işaret: kontrolcü A'yı `click` yerine basış/bırakış yapar. */
export const HOLD_MARKER = 'volHold';

/** Space/Enter — `<button>`ın native aktivasyon tuşları. */
export function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar';
}

export interface HoldInputHandlers {
  /** Basış başlar (klavye ya da kol); devre dışı/meşgul denetim yok sayar. */
  down(): void;
  /** Bırakış (klavye ya da kol). */
  up(): void;
  /** Odak kaybı ya da sökümde: basış iptal edilir (bırakış değil). */
  cancel(): void;
  /** Başka kaynak (işaretçi) basılıysa klavye/kol girdisi karışmaz. */
  isBusy(): boolean;
}

/**
 * Basılı-tutma denetimlerinin ortak klavye ve kol bağı. Space/Enter ve kol A aynı basış/bırakış
 * çiftini üretir (`<button>`ın native `click`i bastırılır: tek basış tek eylem). Dönen işlev bağları söker.
 */
export function bindHoldInput(element: HTMLElement, handlers: HoldInputHandlers): () => void {
  element.dataset[HOLD_MARKER] = '';
  let held = false;

  const press = (): void => {
    if (held || handlers.isBusy()) return;
    if (element instanceof HTMLButtonElement && element.disabled) return;
    held = true;
    handlers.down();
  };
  const release = (): void => {
    if (!held) return;
    held = false;
    handlers.up();
  };
  const abort = (): void => {
    if (!held) return;
    held = false;
    handlers.cancel();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isActivationKey(event)) return;
    // Space sayfayı kaydırır, Enter form gönderir; ikisi de bastırılır.
    event.preventDefault();
    // Tarayıcı basılı tutarken keydown'ı tekrarlar; her tekrar yeni bir basış sayılmaz.
    if (event.repeat) return;
    press();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    if (!isActivationKey(event)) return;
    event.preventDefault();
    release();
  };
  const onClick = (event: MouseEvent): void => {
    // Space/Enter native `click` de üretir; sözleşme basış/bırakış olduğu için yutulur.
    event.preventDefault();
  };

  element.addEventListener('keydown', onKeyDown);
  element.addEventListener('keyup', onKeyUp);
  element.addEventListener('click', onClick);
  element.addEventListener('blur', abort);
  element.addEventListener(FOCUS_PRESS_EVENT, press);
  element.addEventListener(FOCUS_RELEASE_EVENT, release);

  return () => {
    abort();
    element.removeEventListener('keydown', onKeyDown);
    element.removeEventListener('keyup', onKeyUp);
    element.removeEventListener('click', onClick);
    element.removeEventListener('blur', abort);
    element.removeEventListener(FOCUS_PRESS_EVENT, press);
    element.removeEventListener(FOCUS_RELEASE_EVENT, release);
  };
}
