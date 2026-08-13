import { UI_THRESHOLD } from '../../constants';

export interface PullToRefreshOptions {
  /** Aşağı çekilecek içerik — bu element PullToRefresh'in içine taşınır (envanter/liderlik tablosu gibi kaydırılabilir bir içerik olması beklenir). */
  content: HTMLElement;
  /** Yenileme tetiklendiğinde çağrılır; Promise dönerse gösterge, Promise çözülene kadar dönmeye devam eder (ör. sunucudan veri çekme). */
  onRefresh: () => void | Promise<void>;
  /** Bırakıldığında yenilemeyi tetikleyecek çekme mesafesi (piksel). Varsayılan 64. */
  threshold?: number;
  /** Göstergenin gösterileceği metin. Verilmezse yalnızca dönen ok/spinner gösterilir. */
  label?: string;
}

type Phase = 'idle' | 'pulling' | 'ready' | 'refreshing';

/** Listeyi aşağı çekip bırakınca yenileme tetikler. Yalnızca içerik en üstteyken çekmeyi yakalar. */
export class PullToRefresh {
  readonly element: HTMLDivElement;
  private readonly scrollArea: HTMLDivElement;
  private readonly indicator: HTMLDivElement;
  private readonly indicatorIcon: HTMLDivElement;
  private readonly threshold: number;
  private readonly onRefreshHandler: () => void | Promise<void>;
  private phase: Phase = 'idle';
  private pullStartY = 0;
  private pullDistance = 0;
  private activePointerId: number | null = null;
  private boundPointerDown: (event: PointerEvent) => void;
  private boundPointerMove: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: PullToRefreshOptions) {
    this.threshold = options.threshold ?? UI_THRESHOLD.PULL_REFRESH_DEFAULT;
    this.onRefreshHandler = options.onRefresh;

    this.element = document.createElement('div');
    this.element.className = 'vol-pull-refresh';

    this.indicator = document.createElement('div');
    this.indicator.className = 'vol-pull-refresh__indicator';

    this.indicatorIcon = document.createElement('div');
    this.indicatorIcon.className = 'vol-pull-refresh__icon';
    this.indicatorIcon.appendChild(this.buildArrowIcon());
    this.indicator.appendChild(this.indicatorIcon);

    if (options.label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'vol-pull-refresh__label';
      labelEl.textContent = options.label;
      this.indicator.appendChild(labelEl);
    }

    this.element.appendChild(this.indicator);

    this.scrollArea = document.createElement('div');
    this.scrollArea.className = 'vol-pull-refresh__scroll-area';
    this.scrollArea.appendChild(options.content);
    this.element.appendChild(this.scrollArea);

    this.boundPointerDown = (event) => this.handlePointerDown(event);
    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handlePointerUp(event);

    this.scrollArea.addEventListener('pointerdown', this.boundPointerDown);
    this.scrollArea.addEventListener('pointermove', this.boundPointerMove);
    this.scrollArea.addEventListener('pointerup', this.boundPointerUp);
    this.scrollArea.addEventListener('pointercancel', this.boundPointerUp);
  }

  /** Yenilemeyi programatik olarak tetikler (ör. bir menü öğesinden "Yenile"). */
  async refresh(): Promise<void> {
    this.setPhase('refreshing');
    this.setPullDistance(this.threshold);
    try {
      await this.onRefreshHandler();
    } catch (error) {
      // Yenileme handler'ı reddederse gösterge idle'a dönsün;
      // unhandled rejection yerine loglanır.
      console.error('[PullToRefresh] Yenileme başarısız:', error);
    } finally {
      this.reset();
    }
  }

  destroy(): void {
    this.scrollArea.removeEventListener('pointerdown', this.boundPointerDown);
    this.scrollArea.removeEventListener('pointermove', this.boundPointerMove);
    this.scrollArea.removeEventListener('pointerup', this.boundPointerUp);
    this.scrollArea.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.phase === 'refreshing') return;
    // Yalnızca içerik en üstteyken çekme başlayabilir, aksi halde normal scroll'la karışır.
    if (this.scrollArea.scrollTop > 0) return;
    this.pullStartY = event.clientY;
    this.activePointerId = event.pointerId;
    // Capture olmadan, gösterge büyüdükçe scrollArea ekranda aşağı kayar ve pointerup
    // artık element üzerinde gerçekleşmeyebilir (büyük çekmelerde "ready" fazında takılı kalırdı).
    this.scrollArea.setPointerCapture(event.pointerId);
    // "settling" geçişi kapatılır, aksi halde height bir önceki bırakışın geçiş süresi kadar gecikmeli tepki verir.
    this.indicator.classList.remove('vol-pull-refresh__indicator--settling');
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    if (this.phase === 'refreshing') return;
    if (this.scrollArea.scrollTop > 0) {
      this.reset();
      return;
    }

    const delta = event.clientY - this.pullStartY;
    if (delta <= 0) {
      this.setPullDistance(0);
      this.setPhase('idle');
      return;
    }

    event.preventDefault();
    // Direnç eğrisi (kare kök): çekme arttıkça büyüme yavaşlar, native pull-to-refresh hissi verir.
    const resisted = Math.sqrt(delta) * UI_THRESHOLD.PULL_RESISTANCE_FACTOR;
    this.setPullDistance(resisted);
    this.setPhase(resisted >= this.threshold ? 'ready' : 'pulling');
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) return;
    this.scrollArea.releasePointerCapture(event.pointerId);
    this.activePointerId = null;

    if (this.phase === 'ready') {
      void this.commitRefresh();
    } else {
      this.reset();
    }
  }

  private async commitRefresh(): Promise<void> {
    this.setPhase('refreshing');
    this.setPullDistance(this.threshold);
    try {
      await this.onRefreshHandler();
    } catch (error) {
      console.error('[PullToRefresh] Yenileme başarısız:', error);
    } finally {
      this.reset();
    }
  }

  private reset(): void {
    this.indicator.classList.add('vol-pull-refresh__indicator--settling');
    this.setPullDistance(0);
    this.setPhase('idle');
  }

  private setPullDistance(distance: number): void {
    this.pullDistance = distance;
    this.indicator.style.setProperty('--vol-pull-distance', `${distance}px`);
    this.indicator.style.opacity = distance > 0 ? '1' : '0';
    this.indicatorIcon.style.transform = `rotate(${
      Math.min(distance / this.threshold, 1) * 180
    }deg)`;
  }

  private setPhase(phase: Phase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.element.classList.toggle('vol-pull-refresh--ready', phase === 'ready');
    this.element.classList.toggle('vol-pull-refresh--refreshing', phase === 'refreshing');
    if (phase === 'refreshing') {
      this.indicatorIcon.style.transform = '';
    }
  }

  private buildArrowIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M12 4v12 M6 10l6 6 6-6');
    svg.appendChild(path);
    return svg;
  }
}
