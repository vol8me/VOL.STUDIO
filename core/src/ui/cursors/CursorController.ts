import { DisposableScope, type Disposable } from '../../lifecycle/DisposableScope';
import {
  CURSOR_OUTLINE,
  DEFAULT_CURSOR_PALETTE,
  rtsCursorFor,
  type CursorPalette,
  type CursorTone,
  type RtsContext,
} from './cursorContext';
import { loadCursorData, type CursorData } from './cursorData';
import { cursorCssValue, cursorSvg, cursorVar, reticleSvg, type CursorSize } from './cursorImage';
import { UI_CURSORS, type CursorId, type ReticleId } from './cursorNames';

/** İmleç kipi: arayüz, RTS (bağlamsal imleç) ya da nişangâh (yazılım imleci). */
export type CursorMode = 'ui' | 'rts' | 'shooter';

export interface CursorControllerOptions {
  /** Bağlamsal imlecin/nişangâhın uygulandığı yüzey (arena, oyun tuvali). Varsayılan `documentElement`. */
  target?: HTMLElement;
  mode?: CursorMode;
  size?: CursorSize;
  palette?: Partial<CursorPalette>;
  /** Nişangâh kipinin başlangıç nişangâhı. */
  reticle?: ReticleId;
  /** Nişangâhın piksel boyutu (varsayılan 64). */
  reticleSize?: number;
  /** Önceden yüklenmiş kayıt (test/sunucusuz); verilmezse `assets/cursors` getirilir. */
  data?: CursorData;
  /** Arayüz imleçlerini (düğme, metin, sürükleme, boyutlandırma) kökte CSS değişkenleriyle kurar. Varsayılan açık. */
  chrome?: boolean;
  chromeRoot?: HTMLElement;
  /** Hareket azaltma; verilmezse `prefers-reduced-motion` okunur. */
  reducedMotion?: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** İnce işaretçi (fare, kalem, trackpad) yoksa özel imleç anlamsızdır. */
function hasFinePointer(): boolean {
  if (typeof matchMedia !== 'function') return true;
  return matchMedia('(any-pointer: fine)').matches;
}

/**
 * Oyun imleci sahibi. Üç şeyi tek yerden yönetir:
 *
 * - **Arayüz imleçleri** (düğme eli, metin, sürükle, boyutlandır…) kökte `--vol-cursor-*` CSS
 *   değişkenleri olarak kurulur; bileşen stilleri `var(--vol-cursor-link, pointer)` ile okur.
 * - **Bağlamsal imleç** (`rts`): oyun, imlecin altındaki şeyi bildirir (`setContext`); imleç
 *   şekli ve rengi (dost/düşman/kaynak) hedef yüzeyin `cursor` değeri olur.
 * - **Nişangâh** (`shooter`): yerel imleç gizlenir ve çizilen bir nişangâh işaretçiyi aynı olay
 *   içinde izler (≤1 kare gecikme); büyük, dinamik açılımlı ve parlamalı nişangâh CSS imleciyle yapılamaz.
 *
 * Dokunmatik girdide ve ince işaretçi yokken etkisizdir (`active`). Kayıt yüklenemezse sistem
 * imleci kalır. Kol işaretçisi kendi imlecini çizer: `setVisible(false)` ile bu imleç susturulur.
 */
export class CursorController implements Disposable {
  readonly ready: Promise<void>;

  private readonly scope = new DisposableScope();
  private readonly target: HTMLElement;
  private readonly chromeRoot: HTMLElement;
  private readonly chrome: boolean;
  private readonly reducedMotion: boolean;
  private readonly cache = new Map<string, string>();
  private readonly previousCursor: string;
  private palette: CursorPalette;
  private data: CursorData | null = null;
  private currentMode: CursorMode;
  private currentId: CursorId = 'default';
  private currentTone: CursorTone = 'neutral';
  private size: CursorSize;
  private reticleId: ReticleId;
  private reticleSize: number;
  private reticleScale = 1;
  private reticleElement: HTMLDivElement | null = null;
  private hitTimer: ReturnType<typeof setTimeout> | null = null;
  private visible = true;
  private disposed = false;

  constructor(options: CursorControllerOptions = {}) {
    this.target = options.target ?? document.documentElement;
    this.chromeRoot = options.chromeRoot ?? document.documentElement;
    this.chrome = options.chrome ?? true;
    this.currentMode = options.mode ?? 'ui';
    this.size = options.size ?? 32;
    this.reticleId = options.reticle ?? 'ringDot';
    this.reticleSize = options.reticleSize ?? 64;
    this.reducedMotion = options.reducedMotion ?? prefersReducedMotion();
    this.palette = { ...DEFAULT_CURSOR_PALETTE, ...options.palette };
    this.previousCursor = this.target.style.cursor;

    this.scope.addListener(this.target, 'pointermove', (event) => this.onPointerMove(event));
    this.scope.addListener(this.target, 'pointerleave', () => this.hideReticle());
    this.scope.addListener(this.target, 'pointerdown', (event) => this.onPointerMove(event));

    this.ready = (options.data ? Promise.resolve(options.data) : loadCursorData()).then((data) => {
      if (this.disposed || !data) return;
      this.data = data;
      this.refresh();
    });
  }

  get mode(): CursorMode {
    return this.currentMode;
  }

  /** Özel imleç gerçekten uygulanabilir mi: kayıt yüklü, ince işaretçi var, kapalı değil. */
  get active(): boolean {
    return !this.disposed && this.data !== null && hasFinePointer();
  }

  /** Arayüz imleçleri, bağlamsal imleç ve nişangâhı geçerli durumdan yeniden kurar. */
  refresh(): void {
    if (!this.active) {
      this.target.style.cursor = this.previousCursor;
      this.clearChrome();
      this.removeReticle();
      return;
    }
    this.applyChrome();
    this.apply();
  }

  setMode(mode: CursorMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.currentId = mode === 'rts' ? 'select' : 'default';
    this.currentTone = 'neutral';
    this.refresh();
  }

  /** Hedef yüzeyin imlecini seçer (ton gövde rengini belirler). Nişangâh kipinde nişangâh baskındır. */
  setCursor(id: CursorId, tone: CursorTone = 'neutral'): void {
    this.currentId = id;
    this.currentTone = tone;
    this.apply();
  }

  /** RTS bağlamından imleç + ton; yalnız `rts` kipinde etkilidir (diğer kiplerde yok sayılır). */
  setContext(context: RtsContext): void {
    if (this.currentMode !== 'rts') return;
    const choice = rtsCursorFor(context);
    this.setCursor(choice.id, choice.tone);
  }

  setReticle(id: ReticleId): void {
    this.reticleId = id;
    this.renderReticle();
  }

  /** Nişangâh açılımı (ölçek 0.5–3): oyun, atış yayılımını bu değerle bildirir. */
  setReticleScale(scale: number): void {
    this.reticleScale = Math.min(3, Math.max(0.5, Number.isFinite(scale) ? scale : 1));
    this.layoutReticle();
  }

  /** Atış/vurgu için kısa büyüme; hareket azaltılmışta animasyonsuz ve durağan kalır. */
  pulseReticle(): void {
    const element = this.reticleElement;
    if (!element || this.reducedMotion || typeof element.animate !== 'function') return;
    element.animate([{ scale: '1' }, { scale: '1.3' }, { scale: '1' }], {
      duration: 140,
      easing: 'ease-out',
    });
  }

  /** Vuruş işareti: nişangâh rengi kısa süre ton rengine döner. */
  markHit(tone: CursorTone = 'hostile'): void {
    const element = this.reticleElement;
    if (!element) return;
    element.style.color = this.palette[tone];
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => {
      element.style.color = this.palette.neutral;
      this.hitTimer = null;
    }, 120);
  }

  /** Kol işaretçisi ya da tam ekran video gibi durumlarda özel imleci gizler/gösterir. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!visible) this.hideReticle();
    this.apply();
  }

  setSize(size: CursorSize): void {
    this.size = size;
    this.cache.clear();
    this.refresh();
  }

  /** Skin değişiminde (vurgu rengi) paleti yeniler. */
  setPalette(palette: Partial<CursorPalette>): void {
    this.palette = { ...this.palette, ...palette };
    this.cache.clear();
    this.refresh();
  }

  /** Bir imlecin CSS `cursor` değeri (galeri/önizleme için); kayıt yoksa `null`. */
  cssValue(id: CursorId, tone: CursorTone = 'neutral'): string | null {
    return this.cssFor(id, tone);
  }

  /** Bir imlecin önizleme SVG metni (`size` piksel); kayıt yoksa `null`. */
  previewSvg(id: CursorId, tone: CursorTone = 'neutral', size = 48): string | null {
    const entry = this.data?.cursors[id];
    if (!this.data || !entry) return null;
    return cursorSvg(entry, this.data.cursorSize, size, {
      body: this.palette[tone],
      outline: CURSOR_OUTLINE,
    });
  }

  /** Bir nişangâhın önizleme SVG metni (`currentColor` ile boyanır); kayıt yoksa `null`. */
  reticleMarkup(id: ReticleId): string | null {
    const entry = this.data?.reticles[id];
    return this.data && entry ? reticleSvg(entry, this.data.reticleSize) : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.hitTimer) clearTimeout(this.hitTimer);
    this.scope.dispose();
    this.target.style.cursor = this.previousCursor;
    this.clearChrome();
    this.removeReticle();
  }

  private cssFor(id: CursorId, tone: CursorTone): string | null {
    const data = this.data;
    const entry = data?.cursors[id];
    if (!data || !entry) return null;
    const key = `${id}|${tone}|${this.size}`;
    let css = this.cache.get(key);
    if (!css) {
      css = cursorCssValue(id, entry, data.cursorSize, this.size, {
        body: this.palette[tone],
        outline: CURSOR_OUTLINE,
      });
      this.cache.set(key, css);
    }
    return css;
  }

  private applyChrome(): void {
    if (!this.chrome) return;
    for (const id of UI_CURSORS) {
      const css = this.cssFor(id, 'neutral');
      if (css) this.chromeRoot.style.setProperty(cursorVar(id), css);
    }
  }

  private clearChrome(): void {
    for (const id of UI_CURSORS) this.chromeRoot.style.removeProperty(cursorVar(id));
  }

  private apply(): void {
    if (!this.active) return;
    if (this.currentMode === 'shooter') {
      this.target.style.cursor = this.visible ? 'none' : this.previousCursor;
      if (this.visible) this.renderReticle();
      return;
    }
    this.removeReticle();
    const css = this.visible ? this.cssFor(this.currentId, this.currentTone) : null;
    this.target.style.cursor = css ?? this.previousCursor;
  }

  private renderReticle(): void {
    const data = this.data;
    if (!data || this.currentMode !== 'shooter' || !this.visible) return;
    const entry = data.reticles[this.reticleId];
    if (!entry) return;
    if (!this.reticleElement) {
      const element = document.createElement('div');
      element.className = 'vol-reticle';
      element.hidden = true;
      element.style.color = this.palette.neutral;
      document.body.appendChild(element);
      this.reticleElement = element;
    }
    this.reticleElement.innerHTML = reticleSvg(entry, data.reticleSize);
    this.layoutReticle();
  }

  private layoutReticle(): void {
    const element = this.reticleElement;
    if (!element) return;
    const px = Math.round(this.reticleSize * this.reticleScale);
    element.style.width = `${px}px`;
    element.style.height = `${px}px`;
    const svg = element.firstElementChild;
    if (svg) {
      svg.setAttribute('width', String(px));
      svg.setAttribute('height', String(px));
    }
  }

  private onPointerMove(event: Event): void {
    const element = this.reticleElement;
    if (!element || this.currentMode !== 'shooter' || !this.visible) return;
    const pointer = event as PointerEvent;
    if (pointer.pointerType === 'touch') {
      element.hidden = true;
      return;
    }
    // Aynı olay içinde konumlanır: bir sonraki kare bu konumla çizilir (≤1 kare gecikme).
    element.style.transform = `translate3d(${pointer.clientX}px, ${pointer.clientY}px, 0) translate(-50%, -50%)`;
    element.hidden = false;
  }

  private hideReticle(): void {
    if (this.reticleElement) this.reticleElement.hidden = true;
  }

  private removeReticle(): void {
    this.reticleElement?.remove();
    this.reticleElement = null;
  }
}
