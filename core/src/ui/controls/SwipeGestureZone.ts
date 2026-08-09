import { UI_THRESHOLD } from '../../constants';

export type SwipeZoneDirection = 'up' | 'down' | 'left' | 'right';

export interface SwipeGestureEvent {
  direction: SwipeZoneDirection;
  /** Sürükleme mesafesi (piksel, yalnızca baskın eksende — ör. 'left' için |dx|). */
  distance: number;
  /** Bırakma anındaki hız (piksel/ms, yalnızca baskın eksende). Hızlı bir "flick" ile yavaş bir sürüklemeyi ayırt etmek için. */
  velocity: number;
}

export interface SwipeGestureZoneOptions {
  content?: HTMLElement;
  /** Bir jestin "swipe" sayılması için gereken minimum mesafe (piksel). Varsayılan 40. */
  threshold?: number;
  /** Eşik aşılmasa bile hız bu değeri (piksel/ms) geçerse yine de swipe sayılır — kısa, hızlı bir "flick" için. Varsayılan 0.5. */
  velocityThreshold?: number;
  /** Bir swipe jesti tamamlandığında (bırakıldığında, eşik veya hız koşulu sağlandığında) çağrılır. */
  onSwipe?: (event: SwipeGestureEvent) => void;
  /** Sürükleme devam ederken her karede (henüz eşik aşılmamış olsa da) çağrılır — canlı bir görsel geri bildirim (ör. paralaks, ipucu oku) için. */
  onSwipeMove?: (dx: number, dy: number) => void;
  size?: { width: number; height: number };
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  lastTime: number;
}

/**
 * Yönsüz, saf jest algılama katmanı — kaydırmayı yakalayıp yön + mesafe + hız
 * bilgisi verir. SwipeableCardStack'ten farkı: kart/element taşımaz, kendi
 * içinde görsel state tutmaz, yalnızca bir jest algılayıcıdır.
 *
 * Hem mesafe (`threshold`) hem hız (`velocityThreshold`) eşiği ayrı kontrol
 * edilir — herhangi biri sağlanırsa `onSwipe` tetiklenir (uzun yavaş sürükleme
 * ve kısa hızlı flick'in ikisi de doğal karşılanır).
 *
 * `content` verilmezse zone görünmez bir dokunma alanı olarak kalır; verilirse
 * içerik zone'a yerleştirilir ama JS tarafından hiç hareket ettirilmez.
 */
export class SwipeGestureZone {
  readonly element: HTMLDivElement;
  private readonly thresholdPx: number;
  private readonly velocityThresholdPxMs: number;
  private readonly onSwipeHandler?: (event: SwipeGestureEvent) => void;
  private readonly onSwipeMoveHandler?: (dx: number, dy: number) => void;
  private drag: DragState | null = null;
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerMove: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: SwipeGestureZoneOptions = {}) {
    this.thresholdPx = options.threshold ?? UI_THRESHOLD.SWIPE_DEFAULT;
    this.velocityThresholdPxMs = options.velocityThreshold ?? UI_THRESHOLD.SWIPE_VELOCITY_DEFAULT;
    this.onSwipeHandler = options.onSwipe;
    this.onSwipeMoveHandler = options.onSwipeMove;

    this.element = document.createElement('div');
    this.element.className = 'vol-swipe-zone';
    this.element.style.touchAction = 'none';
    if (options.size) {
      this.element.style.width = `${options.size.width}px`;
      this.element.style.height = `${options.size.height}px`;
    }
    if (options.content) {
      this.element.appendChild(options.content);
    }

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);
    this.element.addEventListener('pointerdown', this.boundPointerDown);
    this.element.addEventListener('pointermove', this.boundPointerMove);
    this.element.addEventListener('pointerup', this.boundPointerUp);
    this.element.addEventListener('pointercancel', this.boundPointerUp);
  }

  destroy(): void {
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointermove', this.boundPointerMove);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private handlePointerDown(event: PointerEvent): void {
    // Aynı anda yalnızca tek bir jest takip edilir — ikinci bir parmak zone'un pointer capture'ını çalmamalı.
    if (this.drag) return;
    this.element.setPointerCapture(event.pointerId);
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      lastX: event.clientX,
      lastY: event.clientY,
      lastTime: performance.now(),
    };
  }

  private handlePointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastTime = performance.now();

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) < UI_THRESHOLD.DRAG_START) return;

    this.onSwipeMoveHandler?.(dx, dy);
  }

  private handlePointerUp(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.element.releasePointerCapture(event.pointerId);
    this.drag = null;

    const dx = drag.lastX - drag.startX;
    const dy = drag.lastY - drag.startY;
    const elapsedMs = Math.max(1, drag.lastTime - drag.startTime);

    // Baskın eksen (yatay/dikey) jesti belirler — çapraz sürükleme her zaman tek bir yöne yorumlanır.
    const isHorizontal = Math.abs(dx) >= Math.abs(dy);
    const distance = isHorizontal ? Math.abs(dx) : Math.abs(dy);
    const velocity = distance / elapsedMs;

    if (distance < this.thresholdPx && velocity < this.velocityThresholdPxMs) return;

    const direction: SwipeZoneDirection = isHorizontal
      ? dx > 0
        ? 'right'
        : 'left'
      : dy > 0
      ? 'down'
      : 'up';
    this.onSwipeHandler?.({ direction, distance, velocity });
  }
}
