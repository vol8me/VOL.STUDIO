import { LAKE } from '@/config/lakes';
import type { LakeField } from '@/sim/world/LakeField';
import type { RockField } from '@/sim/world/RockField';

/** Harita dokusunun uzun kenarı (px): göller büyük lekelerdir, ince ayrıntı gerekmez. */
const SIZE = 384;

const BANK = 'rgba(96, 150, 170, 0.34)';
const WATER = 'rgba(52, 118, 160, 0.72)';
const DEEP = 'rgba(30, 78, 122, 0.82)';
const ROCK = 'rgba(122, 116, 104, 0.9)';
const ROCK_RIM = 'rgba(40, 38, 34, 0.7)';
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
 * Göllerin ve kayaların harita dokusu: dünya boyunca saydam bir tuval, üstüne kıyı şeridi, su, derin
 * su ve kaya lobları. Göl çizimleri `LakeField.outline` çokgenidir, yani haritadaki kıyı fizik ve sahne
 * kıyısıyla aynıdır; kaya lobu fizik dairesidir. Gölsüz ve kayasız dünyada ya da tuval alınamazsa
 * (örn. canvas desteklemeyen ortam) `undefined` döner ve harita dokusuz çizilir.
 */
export function bakeLakeMap(
  lakes: LakeField,
  worldWidth: number,
  worldHeight: number,
  rocks?: RockField,
): HTMLCanvasElement | undefined {
  const hasRocks = rocks !== undefined && !rocks.isEmpty;
  if ((lakes.isEmpty && !hasRocks) || typeof document === 'undefined') return undefined;
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
  if (hasRocks) {
    for (const rock of rocks.rocks) {
      ctx.beginPath();
      ctx.ellipse(
        rock.x * scaleX,
        rock.y * scaleY,
        Math.max(1, rock.radius * scaleX),
        Math.max(1, rock.radius * scaleY),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = ROCK;
      ctx.fill();
      ctx.strokeStyle = ROCK_RIM;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  return canvas;
}
