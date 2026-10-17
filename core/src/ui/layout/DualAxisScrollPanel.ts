import { UI_SIZE, UI_THRESHOLD } from '../../constants';
import { i18next } from '../../i18n/I18n';

export interface DualAxisScrollPanelOptions {
  /** Görünür alan genişliği/yüksekliği (piksel). Belirtilmezse parent'a esner. */
  width?: number;
  height?: number;
  /** Erişilebilir ad; verilmezse çevrilmiş varsayılan ("Kaydırılabilir alan"). */
  label?: string;
}

/** `aria-keyshortcuts` değeri: ok tuşları adım adım, Page/Home/End sayfa ve uç (Shift ile yatay). */
const SCROLL_SHORTCUTS = 'ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Home End';
/** `WheelEvent.deltaMode` satır birimi (px). */
const WHEEL_LINE_PX = 16;

/**
 * İki eksende serbestçe kaydırılabilen geniş içerik alanı (envanter
 * ızgarası, harita gibi kullanımlar için). ScrollView'dan farkı: fare
 * sürükleme ve dokunmatik pan'ı birlikte destekler.
 *
 * `overflow: hidden` olduğundan tarayıcı tekerlek ve klavye kaydırmasını kendisi yapmaz; sürükleme tek yol olamaz,
 * bu yüzden aynı kaydırma tekerlekle ve odaktayken klavyeyle de sürülür. Tuş yalnız yüzeyin KENDİSİ odaktayken işlenir
 * (içerideki denetim ok tuşlarını kendi işi için kullanır); kaydırılacak yer kalmadıysa olay iptal edilmez ve ata
 * kaydırıcıya geçer.
 */
export class DualAxisScrollPanel {
  readonly element: HTMLDivElement;
  private readonly content: HTMLDivElement;
  /** Basıldı ama eşik aşılmadı: tıklama alt öğeye gider. Eşik aşılınca sürükleme başlar. */
  private isPressed = false;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;
  private activePointerId: number | null = null;
  private readonly labelIsI18n: boolean;
  private readonly onLanguageChanged: () => void;

  constructor(options: DualAxisScrollPanelOptions = {}) {
    const { width, height } = options;

    this.element = document.createElement('div');
    this.element.className = 'vol-dual-scroll';
    if (width) this.element.style.width = `${width}px`;
    if (height) this.element.style.height = `${height}px`;
    // Klavye/AT erişimi: odaklanabilir, adlı grup; kaydırma tuşları `aria-keyshortcuts`ta bildirilir.
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-keyshortcuts', SCROLL_SHORTCUTS);
    this.labelIsI18n = options.label === undefined;
    this.element.setAttribute(
      'aria-label',
      options.label ?? i18next.t('core:dualAxisScroll.label'),
    );
    this.onLanguageChanged = () => {
      if (this.labelIsI18n) {
        this.element.setAttribute('aria-label', i18next.t('core:dualAxisScroll.label'));
      }
    };
    i18next.on('languageChanged', this.onLanguageChanged);

    this.content = document.createElement('div');
    this.content.className = 'vol-dual-scroll__content';
    this.element.appendChild(this.content);

    this.element.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.element.addEventListener('pointermove', (event) => this.onPointerMove(event));
    this.element.addEventListener('pointerup', (event) => this.onPointerUp(event));
    this.element.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    this.element.addEventListener('keydown', (event) => this.onKeyDown(event));
    // Pasif değil: kaydırma gerçekten olduysa sayfanın aynı tekerlekle kaymasını engellemek gerekir.
    this.element.addEventListener('wheel', (event) => this.onWheel(event), { passive: false });
  }

  add(node: { element: HTMLElement }): this {
    this.content.appendChild(node.element);
    return this;
  }

  clear(): void {
    this.content.replaceChildren();
  }

  setContentSize(width: number, height: number): void {
    this.content.style.width = `${width}px`;
    this.content.style.height = `${height}px`;
  }

  destroy(): void {
    i18next.off('languageChanged', this.onLanguageChanged);
    this.element.remove();
  }

  /** Kaydırır ve konum gerçekten değiştiyse `true` döner (kenarda sıkışan eksen sayılmaz). */
  private panBy(dx: number, dy: number): boolean {
    const left = this.element.scrollLeft;
    const top = this.element.scrollTop;
    this.element.scrollLeft = left + dx;
    this.element.scrollTop = top + dy;
    return this.element.scrollLeft !== left || this.element.scrollTop !== top;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.target !== this.element || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = UI_SIZE.SCROLL_KEY_STEP_PX;
    // Shift: Page/Home/End yatay eksende çalışır (tekerlekte de Shift yataydır).
    const horizontal = event.shiftKey;
    const page = (horizontal ? this.element.clientWidth : this.element.clientHeight) - step;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      case 'PageUp':
      case 'PageDown': {
        const amount = Math.max(step, page) * (event.key === 'PageUp' ? -1 : 1);
        if (horizontal) dx = amount;
        else dy = amount;
        break;
      }
      case 'Home':
      case 'End': {
        const toEnd = event.key === 'End';
        // Uca atlamak: kaydırma boyutu kadar adım tarayıcıda uca kenetlenir. Aşırı büyük değer (örn. MAX_SAFE_INTEGER)
        // WebKit'te tamsayı taşmasıyla yanlış konuma düşer.
        const size = horizontal ? this.element.scrollWidth : this.element.scrollHeight;
        const far = toEnd ? size : -size;
        if (horizontal) dx = far;
        else dy = far;
        break;
      }
      default:
        return;
    }
    if (this.panBy(dx, dy)) event.preventDefault();
  }

  private onWheel(event: WheelEvent): void {
    // Ctrl+tekerlek tarayıcının yakınlaştırmasıdır; iptal edilmiş olay başkasına aittir.
    if (event.ctrlKey || event.defaultPrevented) return;
    const unit =
      event.deltaMode === 1
        ? WHEEL_LINE_PX
        : event.deltaMode === 2
          ? Math.max(1, this.element.clientHeight)
          : 1;
    let dx = event.deltaX * unit;
    let dy = event.deltaY * unit;
    // Shift+tekerlek yataydır (yalnız dikey tekerleği olan fare için tek yatay yol).
    if (event.shiftKey && dx === 0) {
      dx = dy;
      dy = 0;
    }
    if (this.panBy(dx, dy)) event.preventDefault();
  }

  private onPointerDown(event: PointerEvent): void {
    // Yalnız birincil işaretçi ve ana düğme; ikinci parmak/sağ tık pan başlatmaz.
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.isPressed = true;
    this.isDragging = false;
    this.activePointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.scrollStartX = this.element.scrollLeft;
    this.scrollStartY = this.element.scrollTop;
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.isPressed || event.pointerId !== this.activePointerId) {
      return;
    }
    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;
    if (!this.isDragging) {
      if (Math.hypot(dx, dy) < UI_THRESHOLD.DRAG_START_PX) return;
      // Yakalama yalnız eşik aşılınca: alt düğmenin basış/tıklaması çalınmaz.
      this.isDragging = true;
      this.element.setPointerCapture(event.pointerId);
      this.element.classList.add('vol-dual-scroll--dragging');
    }
    this.element.scrollLeft = this.scrollStartX - dx;
    this.element.scrollTop = this.scrollStartY - dy;
  }

  private onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    const wasDragging = this.isDragging;
    this.isPressed = false;
    this.isDragging = false;
    this.activePointerId = null;
    if (!wasDragging) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.element.classList.remove('vol-dual-scroll--dragging');
    if (event.type === 'pointerup') this.swallowNextClick();
  }

  /** Sürüklemeyi bitiren bırakma, altındaki düğmeye tıklama sayılmaz (iptal edilen sürükleme sessiz). */
  private swallowNextClick(): void {
    const swallow = (click: Event): void => {
      click.stopPropagation();
      click.preventDefault();
    };
    this.element.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => this.element.removeEventListener('click', swallow, true), 0);
  }
}
