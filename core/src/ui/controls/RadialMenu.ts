import { UI_SIZE } from '../../constants';

export interface RadialMenuItem {
  id: string;
  label: string;
  icon?: string | Node;
  disabled?: boolean;
}

export interface RadialMenuOptions {
  items: RadialMenuItem[];
  onSelect: (id: string) => void;
  /** Menü halkasının yarıçapı (piksel) — item'lar bu yarıçap üzerinde eşit açıyla dizilir. Varsayılan 96. */
  radius?: number;
  /** Merkezdeki "ölü bölge" yarıçapı — parmak bu alandayken hiçbir item hover/seçili sayılmaz (basılı tutulduğu noktadan çok az hareket eden bir parmağın yanlışlıkla bir item seçmesini engeller). Varsayılan 24. */
  deadzone?: number;
  /** Açılışta gösterilecek merkezi bir ikon/etiket (ör. hangi kategori menüsünün açıldığını hatırlatan bir simge). */
  centerIcon?: string | Node;
}

interface ItemPosition {
  item: RadialMenuItem;
  angle: number;
  x: number;
  y: number;
  element: HTMLButtonElement;
}

/**
 * Basılı tutunca (veya open() ile programatik olarak) açılan, merkez
 * etrafında dairesel dizilmiş seçim menüsü. ContextMenu'nün dikey liste
 * modelinden farkı, item'ların yön bazlı (parmağı hangi açıya sürüklersen o
 * item vurgulanır) seçilmesidir.
 *
 * Tek kullanım deseni desteklenir, kasıtlı olarak: basılı tut → sürükle →
 * bırak. `open(x, y)` bir pointerdown ile çağrılır, bırakıldığında
 * (`pointerup`) hover'daki item seçilir. Deadzone içinde (hiç sürüklemeden)
 * bırakılırsa hiçbir şey seçilmez — kısa bir dokunuş kasıtlı olarak eylem tetiklemez.
 */
export class RadialMenu {
  readonly element: HTMLDivElement;
  private readonly centerEl: HTMLDivElement;
  private readonly items: RadialMenuItem[];
  private readonly onSelectHandler: (id: string) => void;
  private readonly radius: number;
  private readonly deadzone: number;
  private positions: ItemPosition[] = [];
  private hoveredId: string | null = null;
  private isOpen = false;
  /**
   * Menüyü açan parmağın pointerId'si. Bu kontrol olmadan ekrandaki ikinci bir
   * parmağın (joystick, ateş butonu) hareketi hover seçimini sürükleyip yanlış
   * item seçtirebilir. `open()` pointerdown olmadan çağrıldıysa null kalır ve
   * ilk hareket eden parmak sahiplenir.
   */
  private activePointerId: number | null = null;
  private boundPointerMove: (event: PointerEvent) => void;
  private boundPointerUp: (event: PointerEvent) => void;

  constructor(options: RadialMenuOptions) {
    this.items = options.items;
    this.onSelectHandler = options.onSelect;
    this.radius = options.radius ?? UI_SIZE.RADIAL_MENU_DEFAULT_RADIUS;
    this.deadzone = options.deadzone ?? UI_SIZE.RADIAL_MENU_DEFAULT_DEADZONE;

    this.element = document.createElement('div');
    this.element.className = 'vol-radial-menu';
    this.element.inert = true;

    this.centerEl = document.createElement('div');
    this.centerEl.className = 'vol-radial-menu__center';
    if (options.centerIcon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-radial-menu__center-icon';
      if (typeof options.centerIcon === 'string') {
        iconSlot.textContent = options.centerIcon;
      } else {
        iconSlot.appendChild(options.centerIcon);
      }
      this.centerEl.appendChild(iconSlot);
    }
    this.element.appendChild(this.centerEl);

    this.buildItems();

    this.boundPointerMove = (event) => this.handlePointerMove(event);
    this.boundPointerUp = (event) => this.handleRelease(event);
  }

  /** Menüyü verilen ekran koordinatında açar. `pointerId` verilirse yalnızca o parmağın hareketi seçimi sürükler. */
  open(x: number, y: number, pointerId?: number): void {
    this.isOpen = true;
    this.activePointerId = pointerId ?? null;
    this.hoveredId = null;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
    this.element.inert = false;
    this.element.classList.add('vol-radial-menu--visible');
    this.updateHoverVisuals();

    document.addEventListener('pointermove', this.boundPointerMove);
    document.addEventListener('pointerup', this.boundPointerUp);
    // pointercancel olmadan, sistem parmağı iptal ettiğinde (ör. Android geri jesti) menü açık asılı kalırdı.
    document.addEventListener('pointercancel', this.boundPointerUp);
  }

  /** Menüyü kapatır; hover edilen item varsa onSelect ile bildirir, yoksa sessizce kapanır. */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.activePointerId = null;
    this.element.classList.remove('vol-radial-menu--visible');
    this.element.inert = true;
    document.removeEventListener('pointermove', this.boundPointerMove);
    document.removeEventListener('pointerup', this.boundPointerUp);
    document.removeEventListener('pointercancel', this.boundPointerUp);

    if (this.hoveredId) {
      const item = this.items.find((i) => i.id === this.hoveredId);
      if (item && !item.disabled) this.onSelectHandler(item.id);
    }
    this.hoveredId = null;
    this.updateHoverVisuals();
  }

  destroy(): void {
    document.removeEventListener('pointermove', this.boundPointerMove);
    document.removeEventListener('pointerup', this.boundPointerUp);
    document.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.remove();
  }

  private buildItems(): void {
    const count = this.items.length;
    const angleStep = (2 * Math.PI) / count;

    this.positions = this.items.map((item, index) => {
      // -90° (yukarı, saat 12 yönü) referans noktasından başlanır — saat yönünde dizilim beklentisine uyar.
      const angle = -Math.PI / 2 + index * angleStep;
      const x = Math.cos(angle) * this.radius;
      const y = Math.sin(angle) * this.radius;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-radial-menu__item';
      button.style.transform = `translate(${x}px, ${y}px)`;
      button.disabled = Boolean(item.disabled);

      if (item.icon) {
        const iconSlot = document.createElement('span');
        iconSlot.className = 'vol-radial-menu__item-icon';
        if (typeof item.icon === 'string') {
          iconSlot.textContent = item.icon;
        } else {
          iconSlot.appendChild(item.icon.cloneNode(true));
        }
        button.appendChild(iconSlot);
      }

      const label = document.createElement('span');
      label.className = 'vol-radial-menu__item-label';
      label.textContent = item.label;
      button.appendChild(label);

      this.element.appendChild(button);
      return { item, angle, x, y, element: button };
    });
  }

  /** Parmağın/farenin merkeze göre açısını hesaplayıp en yakın item'ı hover durumuna getirir (deadzone içindeyse hiçbiri). */
  private handlePointerMove(event: PointerEvent): void {
    if (!this.isOpen) return;
    if (this.activePointerId === null) {
      // Programatik açılışta menüyü ilk hareket eden parmak sahiplenir; sonrakiler yok sayılır.
      this.activePointerId = event.pointerId;
    } else if (event.pointerId !== this.activePointerId) {
      return;
    }

    const rect = this.element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);

    if (distance < this.deadzone) {
      this.hoveredId = null;
      this.updateHoverVisuals();
      return;
    }

    const pointerAngle = Math.atan2(dy, dx);
    let closest: ItemPosition | null = null;
    let closestDiff = Infinity;

    for (const pos of this.positions) {
      if (pos.item.disabled) continue;
      let diff = Math.abs(pointerAngle - pos.angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < closestDiff) {
        closestDiff = diff;
        closest = pos;
      }
    }

    this.hoveredId = closest?.item.id ?? null;
    this.updateHoverVisuals();
  }

  private handleRelease(event: PointerEvent): void {
    // Menüyü açan parmaktan başkası bırakıldığında (ör. diğer elle basılan ateş butonu) menü etkilenmemeli.
    if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
    this.close();
  }

  private updateHoverVisuals(): void {
    for (const pos of this.positions) {
      pos.element.classList.toggle(
        'vol-radial-menu__item--hovered',
        pos.item.id === this.hoveredId,
      );
    }
  }
}
