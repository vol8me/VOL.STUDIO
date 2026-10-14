import { LAKE } from '@/config/lakes';
import type { LakeField } from '@/sim/world/LakeField';

/** Harita dokusunun uzun kenarı (px): göller büyük lekelerdir, ince ayrıntı gerekmez. */
const SIZE = 384;

const BANK = 'rgba(96, 150, 170, 0.34)';
const WATER = 'rgba(52, 118, 160, 0.72)';
const DEEP = 'rgba(30, 78, 122, 0.82)';
/** Derin su, kıyı çizgisinin bu oranı kadar içeridedir. */
const DEEP_SCALE = 0.62;

function fillOutline(
  ctx: CanvasRenderingContext2D,
  outline: Float64Array,
  scaleX: number,
  scaleY: number,
  color: string,
): void {
  ctx.beginPath();
  for (let index = 0; index < outline.length; index += 2) {
    const x = outline[index] * scaleX;
    const y = outline[index + 1] * scaleY;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Göllerin harita dokusu: dünya boyunca saydam bir tuval, üstüne kıyı şeridi, su ve derin su.
 * Çizimler `LakeField.outline` çokgenidir, yani haritadaki kıyı fizik ve sahne kıyısıyla aynıdır.
 * Tuval alınamazsa (örn. canvas desteklemeyen ortam) `undefined` döner ve harita gölsüz çizilir.
 */
export function bakeLakeMap(
  lakes: LakeField,
  worldWidth: number,
  worldHeight: number,
): HTMLCanvasElement | undefined {
  if (lakes.isEmpty || typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  const longest = Math.max(worldWidth, worldHeight);
  canvas.width = Math.max(2, Math.round((worldWidth / longest) * SIZE));
  canvas.height = Math.max(2, Math.round((worldHeight / longest) * SIZE));
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  const scaleX = canvas.width / worldWidth;
  const scaleY = canvas.height / worldHeight;
  for (const lake of lakes.lakes) {
    fillOutline(ctx, lakes.outline(lake, 1 + LAKE.bank), scaleX, scaleY, BANK);
    fillOutline(ctx, lakes.outline(lake), scaleX, scaleY, WATER);
    fillOutline(ctx, lakes.outline(lake, DEEP_SCALE), scaleX, scaleY, DEEP);
  }
  return canvas;
}
