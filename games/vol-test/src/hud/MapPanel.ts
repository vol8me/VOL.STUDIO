import { i18next } from '@volstudio/core/i18n';
import { MinimapPanel, VOL_COLORS } from '@volstudio/core/ui';
import { formatMetres } from './format';
import type { HudFrame } from './HudFrame';

const SIZE = 168;

export interface MapPanelOptions {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly metre: number;
  /** Izgara aralığı (dünya birimi) ve kaç aralıkta bir belirgin çizgi çekildiği. */
  readonly gridStep: number;
  readonly gridMajorEvery: number;
}

/**
 * Harita: CORE `MinimapPanel` üzerinde tema renginde ızgara, dünya sınırı, ölçek çubuğu, kuzey işareti,
 * kameranın görünen alanı, oyuncunun oku ve diğer araçlar. Harita HUD'dur: yön bulmaya yeter, dikkat çekmez.
 *
 * Yakınlaştırma (tekerlek ya da köşedeki +/−) oyuncuyu ortada tutar; yakınlaşınca görüş dışındaki araçlar
 * kenarda yön oku olarak kalır. Okuyucuya "siz ve N araç, yakınlaştırma Nx" özeti verilir.
 * Konum (metre) E2E ve teşhis için `data-position` olarak da yazılır.
 */
export class MapPanel {
  readonly element: HTMLElement;
  private readonly minimap: MinimapPanel;
  private readonly metre: number;

  constructor(options: MapPanelOptions) {
    this.metre = options.metre;
    this.minimap = new MinimapPanel({
      width: SIZE,
      height: SIZE,
      worldWidth: options.worldWidth,
      worldHeight: options.worldHeight,
      grid: { step: options.gridStep, majorEvery: options.gridMajorEvery },
      scaleBar: { unitsPerMetre: options.metre, unit: 'm' },
      north: true,
      wheelZoom: true,
      controls: true,
      maxZoom: 6,
      label: i18next.t('voltest:hud.map'),
      describe: (counts, zoom) =>
        i18next.t('voltest:hud.mapSummary', { vehicles: counts.vehicle ?? 0, zoom }),
    });
    this.element = this.minimap.element;
    this.element.classList.add('vt-hud__map');
  }

  update(frame: HudFrame): void {
    this.minimap.batch(() => {
      const entries: Array<[string, Parameters<MinimapPanel['setMarker']>[1]]> = [
        [
          'player',
          {
            worldX: frame.x,
            worldY: frame.y,
            color: VOL_COLORS.brandHover,
            shape: 'arrow',
            rotation: frame.hull,
            radius: 5,
            kind: 'player',
            priority: 10,
          },
        ],
      ];
      for (const vehicle of frame.vehicles?.() ?? []) {
        if (vehicle.player) continue;
        entries.push([
          `v${vehicle.id}`,
          {
            worldX: vehicle.x,
            worldY: vehicle.y,
            color: VOL_COLORS.uiTextSecondary,
            shape: 'arrow',
            rotation: vehicle.hull,
            radius: 3.5,
            kind: 'vehicle',
            edge: true,
          },
        ]);
      }
      this.minimap.setMarkers(entries);
      this.minimap.follow('player');
      this.minimap.setViewport(frame.view.x, frame.view.y, frame.view.width, frame.view.height);
    });
    this.element.dataset.position = `${formatMetres(frame.x, this.metre)},${formatMetres(
      frame.y,
      this.metre,
    )}`;
  }

  destroy(): void {
    this.minimap.destroy();
  }
}
