/** Balonun viewport kenarlarından tuttuğu minimum boşluk (piksel). */
const VIEWPORT_MARGIN = 4;

/** Hedef ile balon arasındaki dikey boşluk (piksel). */
const TARGET_GAP = 8;

/** Fare hedeften balona geçerken balonun kaybolmaması için tanınan süre (ms): balon "hoverable" kalır. */
const HIDE_GRACE_MS = 120;

/**
 * Dokunma/kalem eşdeğeri: hedefe bu kadar basılı tutmak balonu açar (hover ve odak dokunmada yoktur). Eşik, sistem
 * uzun basışından (500 ms) kısadır; kısa dokunuş (tıklama) balona dönüşmez.
 */
const LONG_PRESS_MS = 450;
/** Uzun basış sırasında parmağın bu kadar kayması kaydırma/sürükleme sayılır ve basışı iptal eder. */
const LONG_PRESS_SLOP_PX = 10;
/** Uzun basıştan sonra gelen tıklamanın yutulacağı en uzun pencere (ms); tıklama hiç gelmezse bayrak kalkar. */
const CLICK_SUPPRESS_MS = 500;

export type BubblePlacement = 'top' | 'bottom';

export interface BubbleOptions {
  target: HTMLElement;
  bubble: HTMLElement;
  placement: BubblePlacement;
  delayMs: number;
  container: HTMLElement;
  /** Görünürken balona eklenen sınıf (`vol-tooltip--visible`). */
  visibleClass: string;
}

export interface BubbleBinding {
  /** Balonu gecikmesiz gösterir (dokunma/kol "yardım" eylemi için). */
  show(): void;
  /** Balonu gizler. */
  hide(): void;
  /** Hedefteki ve balondaki dinleyicileri söker; balonu DOM'dan kaldırmaz. */
  destroy(): void;
}

let describedByCounter = 0;

/** `aria-describedby` jetonu ekler (mevcut açıklamalar korunur); kaldırma için işlev döner. */
function describe(target: HTMLElement, bubble: HTMLElement): () => void {
  if (!bubble.id) bubble.id = `vol-bubble-${++describedByCounter}`;
  const id = bubble.id;
  const tokens = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  if (!tokens.includes(id)) target.setAttribute('aria-describedby', [...tokens, id].join(' '));
  return () => {
    const rest = (target.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((token) => token && token !== id);
    if (rest.length > 0) target.setAttribute('aria-describedby', rest.join(' '));
    else target.removeAttribute('aria-describedby');
  };
}

/**
 * Tooltip ve RichTooltip'in ortak davranışı (WCAG 1.4.13): hover/odakla açılır, **Escape** işaretçiyi
 * oynatmadan kapatır (ve o tuşu yutar: üstteki katman aynı basışla kapanmaz), fare balonun üstüne
 * geçebilir (balon "hoverable"), konum iki eksende sınırlanır ve dikeyde yer yoksa karşı tarafa
 * çevrilir, kaydırma/yeniden boyutlandırmada yeniden konumlanır. Kol gezinmesi hedefi odakladığı için
 * kol/klavye yolu odak olayıyla çalışır.
 *
 * Dokunma yolu (hover yoktur): hedefe `LONG_PRESS_MS` basılı tutmak balonu açar ve o basışın tıklaması YUTULUR
 * (bilgi bakmak eylemi tetiklemez); balon başka bir yere dokunulana ya da Escape'e kadar kalır. Kısa dokunuş
 * etkilenmez. `show()`/`hide()` bileşenlere açık yardım eylemi (kilitli düğümün nedeni gibi) için verilir.
 */
export function bindBubble(options: BubbleOptions): BubbleBinding {
  const { target, bubble, placement, delayMs, container, visibleClass } = options;
  let showTimeout: ReturnType<typeof setTimeout> | undefined;
  let hideTimeout: ReturnType<typeof setTimeout> | undefined;
  let visible = false;

  const reposition = (): void => {
    const targetRect = target.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const maxLeft = window.innerWidth - bubbleRect.width - VIEWPORT_MARGIN;
    const left = targetRect.left + targetRect.width / 2 - bubbleRect.width / 2;

    const topCandidate = targetRect.top - bubbleRect.height - TARGET_GAP;
    const bottomCandidate = targetRect.bottom + TARGET_GAP;
    const fitsAbove = topCandidate >= VIEWPORT_MARGIN;
    const fitsBelow = bottomCandidate + bubbleRect.height <= window.innerHeight - VIEWPORT_MARGIN;

    let top: number;
    if (placement === 'top') {
      top = fitsAbove || !fitsBelow ? topCandidate : bottomCandidate;
    } else {
      top = fitsBelow || !fitsAbove ? bottomCandidate : topCandidate;
    }

    bubble.style.left = `${Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      Math.max(VIEWPORT_MARGIN, maxLeft),
    )}px`;
    bubble.style.top = `${Math.max(VIEWPORT_MARGIN, top)}px`;
  };

  const onEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !visible) return;
    event.stopPropagation();
    hide();
  };

  /** Balonun ve hedefin DIŞINA dokunmak/basmak balonu kapatır (dokunmada balon tek başına kapanmaz). */
  const onOutsidePointerDown = (event: PointerEvent): void => {
    const node = event.target;
    if (node instanceof Node && (target.contains(node) || bubble.contains(node))) return;
    hide();
  };

  function show(): void {
    clearTimeout(hideTimeout);
    if (!bubble.isConnected) container.appendChild(bubble);
    reposition();
    if (visible) return;
    visible = true;
    bubble.classList.add(visibleClass);
    document.addEventListener('keydown', onEscape, true);
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
  }

  function hide(): void {
    clearTimeout(showTimeout);
    clearTimeout(hideTimeout);
    if (!visible) return;
    visible = false;
    bubble.classList.remove(visibleClass);
    document.removeEventListener('keydown', onEscape, true);
    document.removeEventListener('pointerdown', onOutsidePointerDown, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', reposition);
  }

  const scheduleShow = (): void => {
    clearTimeout(hideTimeout);
    clearTimeout(showTimeout);
    showTimeout = setTimeout(show, delayMs);
  };
  const scheduleHide = (): void => {
    clearTimeout(showTimeout);
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(hide, HIDE_GRACE_MS);
  };
  const cancelHide = (): void => clearTimeout(hideTimeout);

  // Dokunma/kalem uzun basışı (hover ve odak dokunmada güvenilir değildir). Fare buraya girmez.
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressPointer: { id: number; x: number; y: number } | null = null;
  let suppressTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressingClick = false;

  const swallowClick = (event: Event): void => {
    if (!(event.target instanceof Node) || !target.contains(event.target)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    stopSuppressing();
  };
  function stopSuppressing(): void {
    suppressingClick = false;
    clearTimeout(suppressTimer);
    document.removeEventListener('click', swallowClick, true);
  }
  const cancelPress = (): void => {
    clearTimeout(pressTimer);
    pressPointer = null;
  };
  const onPressDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (event.isPrimary === false) return;
    cancelPress();
    pressPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      pressPointer = null;
      show();
      // Bu basışın bırakılışında gelecek tıklama eylemi tetiklemesin.
      suppressingClick = true;
      document.addEventListener('click', swallowClick, true);
      clearTimeout(suppressTimer);
      suppressTimer = setTimeout(stopSuppressing, CLICK_SUPPRESS_MS);
    }, LONG_PRESS_MS);
  };
  const onPressMove = (event: PointerEvent): void => {
    if (!pressPointer || event.pointerId !== pressPointer.id) return;
    const moved = Math.hypot(event.clientX - pressPointer.x, event.clientY - pressPointer.y);
    if (moved > LONG_PRESS_SLOP_PX) cancelPress();
  };
  const onPressEnd = (event: PointerEvent): void => {
    if (pressPointer && event.pointerId === pressPointer.id) cancelPress();
  };
  /** Uzun basışın sistem bağlam menüsü açılmasın (Android Chrome basılı tutmada üretebilir). */
  const onContextMenu = (event: Event): void => {
    if (suppressingClick) event.preventDefault();
  };
  target.addEventListener('pointerdown', onPressDown);
  target.addEventListener('pointermove', onPressMove);
  target.addEventListener('pointerup', onPressEnd);
  target.addEventListener('pointercancel', onPressEnd);
  target.addEventListener('contextmenu', onContextMenu);

  // Balon bağlandığı anda DOM'dadır (görünmez): `aria-describedby` boşa başvurmaz ve ekran okuyucu
  // odak anında açıklamayı okuyabilir; görünmezken `visibility:hidden` olduğu için sayfa içeriği sayılmaz.
  if (!bubble.isConnected) container.appendChild(bubble);
  const undescribe = describe(target, bubble);
  target.addEventListener('mouseenter', scheduleShow);
  target.addEventListener('mouseleave', scheduleHide);
  target.addEventListener('focus', scheduleShow);
  target.addEventListener('blur', hide);
  bubble.addEventListener('mouseenter', cancelHide);
  bubble.addEventListener('mouseleave', scheduleHide);

  return {
    show,
    hide,
    destroy() {
      hide();
      cancelPress();
      stopSuppressing();
      target.removeEventListener('pointerdown', onPressDown);
      target.removeEventListener('pointermove', onPressMove);
      target.removeEventListener('pointerup', onPressEnd);
      target.removeEventListener('pointercancel', onPressEnd);
      target.removeEventListener('contextmenu', onContextMenu);
      undescribe();
      target.removeEventListener('mouseenter', scheduleShow);
      target.removeEventListener('mouseleave', scheduleHide);
      target.removeEventListener('focus', scheduleShow);
      target.removeEventListener('blur', hide);
      bubble.removeEventListener('mouseenter', cancelHide);
      bubble.removeEventListener('mouseleave', scheduleHide);
    },
  };
}
