import { i18next } from '@volstudio/core/i18n';
import { MinimapPanel, VOL_COLORS } from '@volstudio/core/ui';
import { formatMetres } from './format';
import type { HudFrame } from './HudFrame';

const SIZE = 168;
/** Izgara dokusu harita boyunun bu katı çizilir: yüksek DPR'de de ince kalır. */
const GRID_RESOLUTION = 2;

/**
 * Harita: CORE `MinimapPanel` üzerinde soluk ızgara, oyuncu oku ve kameranın
 * görünen alanı. Harita HUD'dur: ızgara oyun paletiyle değil UI tokenıyla
 * çizilir ve yön bulmaya yeter, dikkat çekmez.
 * Konum (metre) E2E ve teşhis için `data-position` olarak da yazılır.
 */
export class MapPanel {
  readonly element: HTMLElement;
  private readonly minimap: MinimapPanel;

  constructor(
    worldWidth: number,
    worldHeight: number,
    private readonly metre: number,
    gridStep: number,
  ) {
    this.minimap = new MinimapPanel({
      width: SIZE,
      height: SIZE,
      worldWidth,
      worldHeight,
      backgroundImage: gridImage(worldWidth, worldHeight, gridStep),
      label: i18next.t('voltest:hud.map'),
    });
    this.element = this.minimap.element;
    this.element.classList.add('vt-hud__map');
  }

  update(frame: HudFrame): void {
    this.minimap.setMarker('player', {
      worldX: frame.x,
      worldY: frame.y,
      color: VOL_COLORS.supportSolid,
      shape: 'arrow',
      rotation: frame.hull,
      radius: 5,
    });
    this.minimap.setViewport(frame.view.x, frame.view.y, frame.view.width, frame.view.height);
    this.element.dataset.position = `${formatMetres(frame.x, this.metre)},${formatMetres(
      frame.y,
      this.metre,
    )}`;
  }

  destroy(): void {
    this.minimap.destroy();
  }
}

/** Dünyayı `step` aralıkla bölen soluk ızgara; dünya kenarları çizilmez. */
export function gridImage(
  worldWidth: number,
  worldHeight: number,
  step: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE * GRID_RESOLUTION;
  canvas.height = SIZE * GRID_RESOLUTION;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.strokeStyle = VOL_COLORS.uiBorderSoft;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = step; x < worldWidth; x += step) {
    const px = Math.round((x / worldWidth) * canvas.width) + 0.5;
    g.moveTo(px, 0);
    g.lineTo(px, canvas.height);
  }
  for (let y = step; y < worldHeight; y += step) {
    const py = Math.round((y / worldHeight) * canvas.height) + 0.5;
    g.moveTo(0, py);
    g.lineTo(canvas.width, py);
  }
  g.stroke();
  return canvas;
}
