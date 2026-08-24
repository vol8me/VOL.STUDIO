import type { CursorAsset, CursorColorTokens, CursorId, CursorTheme } from './types';
import { CursorRegistry } from './CursorRegistry';
import { VOL_CURSOR_COLORS } from './volTheme';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * `CursorAsset` içeriğinden SVG XML string'i üretir.
 */
export function buildSvgString(
  asset: CursorAsset,
  colors: CursorColorTokens = VOL_CURSOR_COLORS,
): string {
  const paths = asset.layers
    .map((l) => {
      const color =
        l.role === 'outline'
          ? colors.outline
          : l.role === 'body'
          ? colors.body
          : l.role === 'accent'
          ? colors.accent
          : l.role === 'danger'
          ? colors.danger
          : colors.disabled;

      const fill = l.fill ? `fill="${color}"` : 'fill="none"';
      const stroke = l.stroke
        ? `stroke="${color}" stroke-width="${l.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
        : '';
      return `<path d="${l.d}" ${fill} ${stroke}/>`;
    })
    .join('');

  return `<svg xmlns="${SVG_NAMESPACE}" viewBox="0 0 ${asset.viewBox} ${asset.viewBox}" width="${asset.viewBox}" height="${asset.viewBox}">${paths}</svg>`;
}

/**
 * SVG string'ini CSS `cursor: url(...)` için data URI'ye çevirir.
 */
export function buildCursorDataUri(asset: CursorAsset, colors?: CursorColorTokens): string {
  const svg = buildSvgString(asset, colors);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Bir DOM elementinin `cursor` stilini verilen cursor ile değiştirir.
 */
export function applyCssCursor(
  element: HTMLElement,
  asset: CursorAsset,
  size = 24,
  colors?: CursorColorTokens,
): void {
  const scale = size / asset.viewBox;
  const x = Math.round(asset.hotspotX * scale);
  const y = Math.round(asset.hotspotY * scale);
  const dataUri = buildCursorDataUri(asset, colors);
  element.style.cursor = `url("${dataUri}") ${x} ${y}, ${asset.fallback}`;
}

/**
 * Mouse ile gezen SVG cursor overlay'i.
 *
 * `attachOverlay(root)` ile oluşturulur; `set(id)` ile cursor,
 * `setSize(size)` ile boyut değiştirilir.
 */
export class DomCursorRenderer {
  private readonly registry: CursorRegistry;
  private readonly overlay: SVGSVGElement;
  private readonly root: HTMLElement;
  private size = 24;
  private colors: CursorColorTokens;
  private currentAsset: CursorAsset | null = null;
  private boundOnPointerMove: (event: PointerEvent) => void;

  constructor(root: HTMLElement, theme?: CursorTheme) {
    this.root = root;
    this.registry = new CursorRegistry();
    this.colors = theme?.colors ?? { ...VOL_CURSOR_COLORS };
    if (theme) {
      this.registry.registerTheme(theme);
    }

    this.overlay = document.createElementNS(SVG_NAMESPACE, 'svg');
    this.overlay.setAttribute('class', 'vol-cursor-overlay');
    this.overlay.setAttribute('pointer-events', 'none');
    this.overlay.style.position = 'fixed';
    this.overlay.style.left = '-9999px';
    this.overlay.style.top = '-9999px';
    this.overlay.style.zIndex = '2147483647';
    this.overlay.setAttribute('fill', 'none');

    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.root.addEventListener('pointermove', this.boundOnPointerMove);
    this.root.appendChild(this.overlay);
  }

  setTheme(theme: CursorTheme): void {
    this.registry.reset();
    this.registry.registerTheme(theme);
    this.colors = theme.colors;
    if (this.currentAsset) {
      this.set(this.currentAsset.id);
    }
  }

  setSize(size: number): void {
    this.size = Math.max(1, size);
    this.render();
  }

  set(id: CursorId): void {
    this.currentAsset = this.registry.resolve(id);
    this.render();
  }

  reset(): void {
    this.set('default');
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.currentAsset) return;
    const scale = this.size / this.currentAsset.viewBox;
    const x = event.clientX - this.currentAsset.hotspotX * scale;
    const y = event.clientY - this.currentAsset.hotspotY * scale;
    this.overlay.style.left = `${x}px`;
    this.overlay.style.top = `${y}px`;
  }

  private render(): void {
    if (!this.currentAsset) return;

    const asset = this.currentAsset;

    this.overlay.setAttribute('viewBox', `0 0 ${asset.viewBox} ${asset.viewBox}`);
    this.overlay.setAttribute('width', String(this.size));
    this.overlay.setAttribute('height', String(this.size));

    this.overlay.replaceChildren();

    for (const l of asset.layers) {
      const path = document.createElementNS(SVG_NAMESPACE, 'path');
      const color = colorForRole(l.role, this.colors);
      path.setAttribute('d', l.d);
      path.setAttribute('fill', l.fill ? color : 'none');
      if (l.stroke) {
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(l.strokeWidth));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
      }
      this.overlay.appendChild(path);
    }

    this.overlay.style.transform = '';
  }

  destroy(): void {
    this.root.removeEventListener('pointermove', this.boundOnPointerMove);
    this.overlay.remove();
  }
}

function colorForRole(role: string, tokens: CursorColorTokens): string {
  if (role === 'outline') return tokens.outline;
  if (role === 'body') return tokens.body;
  if (role === 'accent') return tokens.accent;
  if (role === 'danger') return tokens.danger;
  if (role === 'disabled') return tokens.disabled;
  return tokens.body;
}
