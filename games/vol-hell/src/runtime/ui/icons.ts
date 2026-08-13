/**
 * HUD ikonları — `viewBox 0 0 24 24` üzerinde tanımlı SVG yolları.
 *
 * İkonlar `currentColor` ile çizilir; rengi kullanıldığı yerin CSS'i belirler,
 * böylece tema token'ları dışına çıkan sabit renk kalmaz.
 */

/** Flux para birimi — dörtgen kristal. */
export const ICON_FLUX = 'M12 2 20 12 12 22 4 12Z';

/** Verilen yoldan dekoratif (aria-hidden) bir SVG üretir. */
export function svgIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');

  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shape.setAttribute('d', path);
  svg.appendChild(shape);

  return svg;
}
