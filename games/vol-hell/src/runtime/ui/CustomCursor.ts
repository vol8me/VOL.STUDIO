import { DisposableScope } from '@volstudio/core/lifecycle';

let lastPointerPosition: { x: number; y: number } | null = null;

export interface CustomCursorOptions {
  /** Headless test ve erişilebilirlik durumlarında açıkça devre dışı bırakılabilir. */
  readonly enabled?: boolean;
}

/** VOL.HELL masaüstü/web pointer'ını oyun üstü VOL crosshair'i ile değiştirir. */
export class CustomCursor {
  readonly element: HTMLDivElement;
  private readonly scope = new DisposableScope();
  private readonly document: Document;
  private readonly enabled: boolean;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(parent: HTMLElement, options: CustomCursorOptions = {}) {
    this.document = parent.ownerDocument ?? document;
    this.enabled = options.enabled ?? this.isFinePointer();
    this.element = this.document.createElement('div');
    this.element.className = 'vol-custom-cursor';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML =
      '<i class="vol-custom-cursor__corner vol-custom-cursor__corner--nw"></i>' +
      '<i class="vol-custom-cursor__corner vol-custom-cursor__corner--ne"></i>' +
      '<i class="vol-custom-cursor__corner vol-custom-cursor__corner--sw"></i>' +
      '<i class="vol-custom-cursor__corner vol-custom-cursor__corner--se"></i>' +
      '<i class="vol-custom-cursor__center vol-custom-cursor__center--h"></i>' +
      '<i class="vol-custom-cursor__center vol-custom-cursor__center--v"></i>';
    this.element.hidden = !this.enabled;
    parent.appendChild(this.element);

    if (!this.enabled) return;
    const view = this.document.defaultView;
    const initial = lastPointerPosition ?? {
      x: Math.max(0, (view?.innerWidth ?? 0) / 2),
      y: Math.max(0, (view?.innerHeight ?? 0) / 2),
    };
    this.setPosition(initial.x, initial.y);
    // Pointer yeni ekranda henüz hareket etmese bile cursor etkin olmalıdır.
    this.element.classList.add('vol-custom-cursor--visible');
    this.document.documentElement.classList.add('vol-custom-cursor-enabled');
    this.scope.addListener(this.document, 'pointermove', this.handlePointerMove);
    this.scope.addListener(this.document, 'pointerover', this.handlePointerOver);
    this.scope.addListener(this.document, 'pointerout', this.handlePointerOut);
    this.scope.addListener(this.document, 'pointerleave', this.handlePointerLeave);
    this.scope.addListener(this.document, 'pointerdown', this.handlePointerDown);
    this.scope.addListener(this.document, 'pointerup', this.handlePointerUp);
    this.scope.addListener(this.document, 'pointercancel', this.handlePointerUp);
    this.scope.addListener(this.document, 'click', this.handleConfirm);
    this.scope.addListener(window, 'blur', this.handlePointerLeave);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.dispose();
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    this.document.documentElement.classList.remove('vol-custom-cursor-enabled');
    this.element.remove();
  }

  private readonly handlePointerMove = (event: Event): void => {
    this.setPositionFromEvent(event);
    this.element.classList.add('vol-custom-cursor--visible');
    this.setInteractiveState(event.target);
  };

  private readonly handlePointerOver = (event: Event): void => {
    this.setPositionFromEvent(event);
    this.element.classList.add('vol-custom-cursor--visible');
    this.setInteractiveState(event.target);
  };

  private readonly handlePointerOut = (event: Event): void => {
    this.setInteractiveState((event as PointerEvent).relatedTarget);
  };

  private readonly handlePointerLeave = (): void => {
    this.element.classList.remove(
      'vol-custom-cursor--visible',
      'vol-custom-cursor--pressed',
      'vol-custom-cursor--hover',
    );
  };

  private setPositionFromEvent(event: Event): void {
    const pointer = event as Partial<PointerEvent>;
    if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) return;
    this.setPosition(pointer.clientX!, pointer.clientY!);
  }

  private setPosition(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    lastPointerPosition = { x, y };
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  private readonly handlePointerDown = (): void => {
    this.element.classList.remove('vol-custom-cursor--confirm');
    this.element.classList.add('vol-custom-cursor--pressed');
  };

  private readonly handlePointerUp = (): void => {
    this.element.classList.remove('vol-custom-cursor--pressed');
  };

  private setInteractiveState(target: EventTarget | null): void {
    const element = target instanceof Element ? target : null;
    this.element.classList.toggle(
      'vol-custom-cursor--hover',
      Boolean(
        element?.closest(
          'button, a, input, select, textarea, [role="button"], [data-vol-interactive]',
        ),
      ),
    );
  }

  private readonly handleConfirm = (): void => {
    this.element.classList.add('vol-custom-cursor--confirm');
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => {
      this.confirmTimer = null;
      this.element.classList.remove('vol-custom-cursor--confirm');
    }, 120);
  };

  private isFinePointer(): boolean {
    const matchMedia = this.document.defaultView?.matchMedia;
    if (typeof matchMedia !== 'function') return true;
    return !matchMedia.call(this.document.defaultView, '(pointer: coarse)').matches;
  }
}
