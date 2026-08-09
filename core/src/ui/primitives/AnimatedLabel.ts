import { UI_TIMING } from '../../constants';

export type AnimatedLabelEffect = 'fade' | 'slide-up' | 'pop' | 'glow';
export type AnimatedLabelContinuousEffect = 'wave' | 'jump' | 'shake' | 'rainbow' | 'gradient';

export interface AnimatedLabelOptions {
  effect?: AnimatedLabelEffect;
  tag?: 'p' | 'span' | 'h1' | 'h2' | 'h3';
}

/**
 * `setContent()` ile metin her değiştiğinde giriş animasyonu oynayan etiket —
 * "YENİ REKOR!" veya "Dalga 4" gibi keyfi metinler için.
 *
 * `setContinuousEffect()` ayrı bir mod sunar: metin harf bazlı `<span>`'lere
 * bölünür ve `stopContinuousEffect()` ile durdurulana kadar kademeli, döngülü
 * bir animasyon (wave/jump/shake/rainbow/gradient) oynar; tek seferlik giriş
 * efektlerinden (fade/pop/glow) bağımsızdır.
 */
export class AnimatedLabel {
  readonly element: HTMLElement;
  private effect: AnimatedLabelEffect;
  private continuousEffect: AnimatedLabelContinuousEffect | null = null;
  private plainContent: string;

  constructor(content: string, options: AnimatedLabelOptions = {}) {
    const { effect = 'fade', tag = 'span' } = options;
    this.effect = effect;
    this.plainContent = content;

    this.element = document.createElement(tag);
    this.element.className = `vol-animated-label vol-animated-label--${effect}`;
    this.element.textContent = content;
  }

  setContent(content: string): void {
    this.plainContent = content;
    if (this.continuousEffect) {
      this.renderGlyphs(this.continuousEffect);
      return;
    }
    this.element.textContent = content;
    this.replay();
  }

  /** Efekti kalıcı olarak değiştirir ve hemen oynatır. */
  setEffect(effect: AnimatedLabelEffect): void {
    this.stopContinuousEffect();
    this.element.classList.remove(`vol-animated-label--${this.effect}`);
    this.effect = effect;
    this.element.textContent = this.plainContent;
    this.replay();
  }

  /** Aynı içerikle animasyonu yeniden oynatır. */
  replay(): void {
    this.element.classList.remove(`vol-animated-label--${this.effect}`);
    // Animasyonu yeniden tetiklemek için reflow zorla.
    void this.element.offsetWidth;
    this.element.classList.add(`vol-animated-label--${this.effect}`);
  }

  /** Metni harflere bölüp sürekli/döngülü efekt başlatır (durdurulana kadar çalışır). */
  setContinuousEffect(effect: AnimatedLabelContinuousEffect): void {
    if (this.continuousEffect) {
      this.element.classList.remove(`vol-animated-label--${this.continuousEffect}`);
    } else {
      this.element.classList.remove(`vol-animated-label--${this.effect}`);
    }
    this.continuousEffect = effect;
    this.renderGlyphs(effect);
  }

  /** Sürekli efekti durdurur ve düz metne döner. */
  stopContinuousEffect(): void {
    if (!this.continuousEffect) return;
    this.element.classList.remove(`vol-animated-label--${this.continuousEffect}`);
    this.continuousEffect = null;
    this.element.textContent = this.plainContent;
  }

  destroy(): void {
    this.stopContinuousEffect();
    this.element.remove();
  }

  private renderGlyphs(effect: AnimatedLabelContinuousEffect): void {
    this.element.textContent = '';
    this.element.classList.add(`vol-animated-label--${effect}`);

    let visibleIndex = 0;
    for (const char of this.plainContent) {
      if (char === ' ') {
        this.element.appendChild(document.createTextNode(' '));
        continue;
      }
      const glyph = document.createElement('span');
      glyph.className = 'vol-animated-label__glyph';
      glyph.textContent = char;
      glyph.style.animationDelay = `${visibleIndex * UI_TIMING.ANIMATED_LABEL_GLYPH_STAGGER}ms`;
      this.element.appendChild(glyph);
      visibleIndex += 1;
    }
  }
}
