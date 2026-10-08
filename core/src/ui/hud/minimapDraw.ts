import { VOL_COLORS } from '../colors';

/**
 * MinimapPanel'in çizim yardımcıları. Saf çizimdir: durum tutmaz, DOM'a dokunmaz (yalnız `resolveMinimapPalette`
 * tema tokenlarını okur). Renkler tema tokenlarından gelir; böylece steel/aurum kaplaması haritayı da boyar.
 * Çizim kuralı (HUD bütçesi): bulanık gölge ve gradyan yok, yalnız düz renk ve ince çizgi.
 */

export interface MinimapPalette {
  well: string;
  grid: string;
  gridMajor: string;
  bounds: string;
  frustum: string;
  rim: string;
  text: string;
  accent: string;
  cursor: string;
  font: string;
}

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dünya → canvas (CSS pikseli) dönüşümü; her çizimde görünür dünya dikdörtgeninden kurulur. */
export interface MinimapView {
  visible: MinimapRect;
  width: number;
  height: number;
}

export type MinimapShape = 'dot' | 'arrow' | 'square' | 'diamond';

export interface DrawableMarker {
  worldX: number;
  worldY: number;
  color: string;
  radius: number;
  shape: MinimapShape;
  rotation: number;
  outline: boolean;
  edge: boolean;
}

const TOKENS: ReadonlyArray<readonly [keyof MinimapPalette, string, string]> = [
  ['well', '--vol-ui-well', VOL_COLORS.uiBgSubtle],
  ['grid', '--vol-ui-frame-divider', VOL_COLORS.uiBorderSoft],
  ['gridMajor', '--vol-ui-border-strong', VOL_COLORS.uiBorderSoft],
  ['bounds', '--vol-ui-brand-solid', VOL_COLORS.supportSolid],
  ['frustum', '--vol-ui-text', '#ffffff'],
  ['rim', '--vol-ui-bg', '#000000'],
  ['text', '--vol-ui-text-secondary', '#b5c1cc'],
  ['accent', '--vol-ui-brand-solid', VOL_COLORS.supportSolid],
  ['cursor', '--vol-ui-focus-ring', '#ffd37a'],
];

/** Tema tokenlarını elemandan okur; eksik token (ayrık/DOM'suz ortam) çekirdek varsayılanına düşer. */
export function resolveMinimapPalette(element: Element): MinimapPalette {
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
  const read = (name: string, fallback: string): string => {
    const value = style?.getPropertyValue(name).trim();
    return value ? value : fallback;
  };
  const palette = { font: read('--vol-font-family', 'sans-serif') } as MinimapPalette;
  for (const [key, token, fallback] of TOKENS) palette[key] = read(token, fallback);
  return palette;
}

export function worldToCanvas(view: MinimapView, worldX: number, worldY: number) {
  return {
    x: ((worldX - view.visible.x) / view.visible.width) * view.width,
    y: ((worldY - view.visible.y) / view.visible.height) * view.height,
  };
}

/**
 * Dünya ızgarası: ince çizgiler + her `majorEvery`'de belirgin çizgi. İnce çizgiler aralık 9 px'in altına
 * inince bırakılır (sıkışık ağ okunurluğu bozar), belirgin çizgiler 4 px'e kadar kalır.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  origin: { x: number; y: number },
  step: number,
  majorEvery: number,
): void {
  const pxPerUnit = view.width / view.visible.width;
  const minorVisible = step * pxPerUnit >= 9;
  if (majorEvery > 0 ? step * majorEvery * pxPerUnit < 4 : !minorVisible) return;
  const first = (axisMin: number, axisOrigin: number): number =>
    axisOrigin + Math.ceil((axisMin - axisOrigin) / step) * step;
  const endX = view.visible.x + view.visible.width;
  const endY = view.visible.y + view.visible.height;
  ctx.lineWidth = 1;
  for (const major of [false, true]) {
    if (!major && !minorVisible) continue;
    ctx.strokeStyle = major ? palette.gridMajor : palette.grid;
    ctx.beginPath();
    for (let x = first(view.visible.x, origin.x); x <= endX; x += step) {
      const index = Math.round((x - origin.x) / step);
      if ((majorEvery > 0 && index % majorEvery === 0) !== major) continue;
      const px = Math.round(worldToCanvas(view, x, 0).x) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, view.height);
    }
    for (let y = first(view.visible.y, origin.y); y <= endY; y += step) {
      const index = Math.round((y - origin.y) / step);
      if ((majorEvery > 0 && index % majorEvery === 0) !== major) continue;
      const py = Math.round(worldToCanvas(view, 0, y).y) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(view.width, py);
    }
    ctx.stroke();
  }
}

/** Dünya sınırı: kapalı ince çerçeve (dünyanın nerede bittiği görünür). */
export function drawBounds(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  world: MinimapRect,
): void {
  const a = worldToCanvas(view, world.x, world.y);
  const b = worldToCanvas(view, world.x + world.width, world.y + world.height);
  ctx.strokeStyle = palette.bounds;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.75;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.globalAlpha = 1;
}

/** Kamera görüş alanı: hafif dolgu + ince çizgi + çerçeve dilindeki köşe ayraçları. */
export function drawFrustum(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  rect: MinimapRect,
): void {
  const a = worldToCanvas(view, rect.x, rect.y);
  const b = worldToCanvas(view, rect.x + rect.width, rect.y + rect.height);
  const w = b.x - a.x;
  const h = b.y - a.y;
  ctx.fillStyle = palette.frustum;
  ctx.globalAlpha = 0.08;
  ctx.fillRect(a.x, a.y, w, h);
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = palette.frustum;
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x + 0.5, a.y + 0.5, w, h);
  const arm = Math.min(6, Math.abs(w) / 3, Math.abs(h) / 3);
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [
    [a.x, a.y, 1, 1],
    [b.x, a.y, -1, 1],
    [a.x, b.y, 1, -1],
    [b.x, b.y, -1, -1],
  ] as const) {
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function shapePath(
  ctx: CanvasRenderingContext2D,
  marker: DrawableMarker,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  if (marker.shape === 'arrow') {
    const size = radius * 1.8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(marker.rotation);
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, size * 0.6);
    ctx.lineTo(-size * 0.6, -size * 0.6);
    ctx.closePath();
    ctx.restore();
    return;
  }
  if (marker.shape === 'square') {
    ctx.moveTo(x - radius, y - radius);
    ctx.lineTo(x + radius, y - radius);
    ctx.lineTo(x + radius, y + radius);
    ctx.lineTo(x - radius, y + radius);
    ctx.closePath();
    return;
  }
  if (marker.shape === 'diamond') {
    ctx.moveTo(x, y - radius * 1.3);
    ctx.lineTo(x + radius * 1.3, y);
    ctx.lineTo(x, y + radius * 1.3);
    ctx.lineTo(x - radius * 1.3, y);
    ctx.closePath();
    return;
  }
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

/** Tek işaret: koyu kenar (zemin ne olursa olsun okunur) + dolgu. */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  marker: DrawableMarker,
): void {
  const { x, y } = worldToCanvas(view, marker.worldX, marker.worldY);
  if (x < -12 || y < -12 || x > view.width + 12 || y > view.height + 12) return;
  shapePath(ctx, marker, x, y, marker.radius);
  if (marker.outline) {
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = marker.color;
  ctx.fill();
}

/** Görünür alanın dışındaki işaretli öğe: kenara sıkıştırılmış, dışa bakan küçük üçgen. */
export function drawEdgeMarker(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  marker: DrawableMarker,
): void {
  const { x, y } = worldToCanvas(view, marker.worldX, marker.worldY);
  if (x >= 0 && y >= 0 && x <= view.width && y <= view.height) return;
  const margin = 7;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const scale = Math.min(
    (cx - margin) / Math.max(Math.abs(dx), 1e-6),
    (cy - margin) / Math.max(Math.abs(dy), 1e-6),
  );
  const px = cx + dx * scale;
  const py = cy + dy * scale;
  const angle = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, 4);
  ctx.lineTo(-4, -4);
  ctx.closePath();
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = marker.color;
  ctx.fill();
  ctx.restore();
}

/** Halka dalgası (uyarı/işaretleme): `t` 0..1; hareket azaltılmışta yarıçap sabit, yalnız solar. */
export function drawPing(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  worldX: number,
  worldY: number,
  color: string,
  t: number,
  expand: boolean,
): void {
  const { x, y } = worldToCanvas(view, worldX, worldY);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.beginPath();
  ctx.arc(x, y, expand ? 4 + 16 * t : 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Klavye imleci: artı işareti + halka. */
export function drawCursor(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  worldX: number,
  worldY: number,
): void {
  const { x, y } = worldToCanvas(view, worldX, worldY);
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.stroke();
  ctx.strokeStyle = palette.cursor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 7, y);
  ctx.lineTo(x + 7, y);
  ctx.moveTo(x, y - 7);
  ctx.lineTo(x, y + 7);
  ctx.moveTo(x + 4, y);
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

/** 1-2-5 dizisinden, `maxPx` pikseli aşmayan en büyük "güzel" uzunluk (metre). */
export function niceScaleMetres(maxMetres: number): number {
  if (!(maxMetres > 0)) return 0;
  const exponent = Math.floor(Math.log10(maxMetres));
  const base = 10 ** exponent;
  for (const factor of [5, 2, 1]) if (factor * base <= maxMetres) return factor * base;
  return base;
}

/** Ölçek çubuğu (sol alt): uçlarında çentik, üstünde uzunluk metni. */
export function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
  unitsPerMetre: number,
  unit: string,
): void {
  const pxPerMetre = (view.width / view.visible.width) * unitsPerMetre;
  const metres = niceScaleMetres(56 / pxPerMetre);
  if (metres <= 0) return;
  const length = metres * pxPerMetre;
  const x = 8;
  const y = view.height - 8;
  ctx.strokeStyle = palette.rim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y - 3);
  ctx.lineTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.lineTo(x + length, y - 3);
  ctx.stroke();
  ctx.strokeStyle = palette.text;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = palette.text;
  ctx.font = `600 10px ${palette.font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${metres} ${unit}`, x, y - 4);
}

/** Kuzey işareti (sağ üst): "N" ve yukarı bakan ok. */
export function drawNorth(
  ctx: CanvasRenderingContext2D,
  view: MinimapView,
  palette: MinimapPalette,
): void {
  const x = view.width - 12;
  ctx.fillStyle = palette.text;
  ctx.font = `700 10px ${palette.font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', x, 15);
  ctx.beginPath();
  ctx.moveTo(x, 4);
  ctx.lineTo(x - 4, 12);
  ctx.lineTo(x + 4, 12);
  ctx.closePath();
  ctx.fillStyle = palette.accent;
  ctx.fill();
}
