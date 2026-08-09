import { UI_TIMING } from '../../constants';

export type FloatingTextVariant = 'default' | 'damage' | 'heal' | 'critical';

export interface FloatingTextOptions {
  variant?: FloatingTextVariant;
  /** Toplam yaşam süresi (ms) — bu sürenin sonunda fade-out başlar. */
  durationMs?: number;
  /** Yukarı kayma mesafesi (px). */
  riseDistance?: number;
  /** Üst üste binmeyi önlemek için rastgele yatay ofset (px, ±). Varsayılan 18; `critical` varsayılan olarak jitter almaz. */
  jitter?: number;
}

export interface FloatingTextManagerOptions {
  /** 'fixed' (varsayılan): viewport'a göre konumlanır. 'absolute': verilen `parent`'a göre (parent'ın position:relative/absolute olması gerekir). */
  anchor?: 'fixed' | 'absolute';
}

interface ActiveText {
  element: HTMLDivElement;
  timeoutIds: number[];
  rafId: number;
}

/** Verilen x/y konumunda beliren, yukarı kayarak solan geçici metin (hasar/heal/kritik vuruş). Toast'tan farkı sabit köşede değil, verilen noktada belirmesi. */
export class FloatingTextManager {
  private readonly container: HTMLDivElement;
  private readonly active: ActiveText[] = [];

  constructor(parent: HTMLElement, options: FloatingTextManagerOptions = {}) {
    const { anchor = 'fixed' } = options;
    this.container = document.createElement('div');
    this.container.className = `vol-floating-text-container vol-floating-text-container--${anchor}`;
    parent.appendChild(this.container);
  }

  spawn(x: number, y: number, text: string, options: FloatingTextOptions = {}): void {
    const { variant = 'default', durationMs = 900, riseDistance = 40 } = options;
    const jitter = options.jitter ?? (variant === 'critical' ? 0 : 18);
    const offsetX = jitter > 0 ? (Math.random() * 2 - 1) * jitter : 0;

    const el = document.createElement('div');
    el.className = `vol-floating-text vol-floating-text--${variant}`;
    el.style.left = `${x + offsetX}px`;
    el.style.top = `${y}px`;
    el.style.setProperty('--vol-floating-text-rise', `-${riseDistance}px`);
    el.textContent = text;

    this.container.appendChild(el);

    const entry: ActiveText = { element: el, timeoutIds: [], rafId: 0 };
    this.active.push(entry);

    entry.rafId = requestAnimationFrame(() => {
      entry.rafId = requestAnimationFrame(() => el.classList.add('vol-floating-text--visible'));
    });

    const fadeTimeoutId = window.setTimeout(() => {
      el.classList.add('vol-floating-text--fading');
      const removeTimeoutId = window.setTimeout(() => {
        el.remove();
        const index = this.active.indexOf(entry);
        if (index !== -1) this.active.splice(index, 1);
      }, UI_TIMING.FLOATING_TEXT_FADE_OUT);
      entry.timeoutIds.push(removeTimeoutId);
    }, durationMs);
    entry.timeoutIds.push(fadeTimeoutId);
  }

  destroy(): void {
    for (const entry of this.active) {
      cancelAnimationFrame(entry.rafId);
      for (const id of entry.timeoutIds) {
        window.clearTimeout(id);
      }
    }
    this.active.length = 0;
    this.container.remove();
  }
}
