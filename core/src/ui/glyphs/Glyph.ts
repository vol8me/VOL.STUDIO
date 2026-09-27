import type { GlyphFamily, GlyphName } from './glyphMap';
import { glyphUrl } from './glyphMap';

export interface GlyphOptions {
  /** Mantıksal slot (`faceDown`, `start`…). */
  name: GlyphName;
  /** Aile verilmezse boş kalır; `setFamily` ile sonra beslenir. */
  family?: GlyphFamily;
  /** `keyboard` ailesindeki `key` slotu için tuş adı (örn. `'w'`, `'enter'`). */
  key?: string;
  /**
   * Eşlemesi olmayan slotta gösterilen yedek metin ve `aria-label` temeli.
   * Verilmezse slot adı kullanılır.
   */
  label?: string;
  /**
   * Glif kökü (sona `/` almaz). `publicDir` konvansiyonunda
   * `assets/glyphs`'tir; farklı sunan tüketici kendi kökünü verir.
   */
  baseUrl?: string;
}

/**
 * Tek girdi glifi. `<img>` destekli; aile/slot eşlemesi ya da dosyası
 * yoksa metin çipi gösterir — sessizce kaybolan ipucu yoktur.
 *
 * Kip/aile değişimi canlıdır: `setFamily` çağrısı `<img>`'yi yeniler,
 * `family === null` ise (örn. dokunmatik kip) öğe `hidden` olur.
 */
export class Glyph {
  readonly element: HTMLSpanElement;
  private readonly image: HTMLImageElement;
  private readonly text: HTMLSpanElement;
  private name: GlyphName;
  private key?: string;
  private family?: GlyphFamily | null;
  private readonly baseUrl: string;
  private readonly fallbackLabel: string;

  constructor(options: GlyphOptions) {
    this.name = options.name;
    this.key = options.key;
    this.family = options.family ?? null;
    this.baseUrl = options.baseUrl ?? 'assets/glyphs';
    this.fallbackLabel = options.label ?? options.name;

    this.element = document.createElement('span');
    this.element.className = 'vol-glyph';

    this.image = document.createElement('img');
    this.image.className = 'vol-glyph__img';
    this.image.draggable = false;

    this.text = document.createElement('span');
    this.text.className = 'vol-glyph__text';

    this.element.appendChild(this.image);
    this.element.appendChild(this.text);
    this.render();
  }

  setFamily(family: GlyphFamily | null): void {
    if (this.family === family) return;
    this.family = family;
    this.render();
  }

  setName(name: GlyphName, key?: string): void {
    if (this.name === name && this.key === key) return;
    this.name = name;
    this.key = key;
    this.render();
  }

  private render(): void {
    if (this.family === null || this.family === undefined) {
      this.element.hidden = true;
      return;
    }
    this.element.hidden = false;
    const url = glyphUrl(this.name, this.family, this.key, this.baseUrl);
    if (url === undefined) {
      this.image.hidden = true;
      this.image.removeAttribute('src');
      this.text.hidden = false;
      this.text.textContent = this.fallbackLabel;
      this.element.setAttribute('aria-label', this.fallbackLabel);
      return;
    }
    this.image.src = url;
    this.image.alt = this.fallbackLabel;
    this.image.hidden = false;
    this.text.hidden = true;
    this.element.setAttribute('aria-label', this.fallbackLabel);
  }

  destroy(): void {
    this.element.remove();
  }
}
