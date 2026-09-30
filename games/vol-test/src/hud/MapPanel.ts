import { i18next } from '@volstudio/core/i18n';
import { MinimapPanel, VOL_COLORS } from '@volstudio/core/ui';
import { formatMetres } from './format';
import type { HudFrame } from './HudFrame';

const SIZE = 168;

/**
 * Harita: CORE `MinimapPanel` üzerinde oyuncu oku ve kameranın görünen alanı.
 * Konum (metre) E2E ve teşhis için `data-position` olarak da yazılır.
 */
export class MapPanel {
  readonly element: HTMLElement;
  private readonly minimap: MinimapPanel;

  constructor(
    worldWidth: number,
    worldHeight: number,
    private readonly metre: number,
  ) {
    this.minimap = new MinimapPanel({
      width: SIZE,
      height: SIZE,
      worldWidth,
      worldHeight,
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
