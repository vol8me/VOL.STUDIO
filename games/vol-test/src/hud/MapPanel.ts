import { i18next } from '@volstudio/core/i18n';
import { MinimapPanel, VOL_COLORS, type MinimapMarker } from '@volstudio/core/ui';
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
  private readonly player: MinimapMarker = {
    worldX: 0,
    worldY: 0,
    color: VOL_COLORS.brandHover,
    shape: 'arrow',
    rotation: 0,
    radius: 5,
    kind: 'player',
    priority: 10,
  };
  private readonly others = new Map<number, { key: string; seen: number; marker: MinimapMarker }>();
  private generation = 0;
  /** Konum yazısının son yazıldığı konum: ilk güncelleme her zaman yazar. */
  private shownX = Number.POSITIVE_INFINITY;
  private shownY = Number.POSITIVE_INFINITY;

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
      label: () => i18next.t('voltest:hud.map'),
      describe: (counts, zoom) =>
        i18next.t('voltest:hud.mapSummary', { vehicles: counts.vehicle ?? 0, zoom }),
    });
    this.element = this.minimap.element;
    this.element.classList.add('vt-hud__map');
  }

  /**
   * Her çizilen karede çağrılabilir: işaretler yerinde güncellenir (nesne üretilmez), piksel altı
   * değişim çizim istemez. Konum yazısı (E2E ve teşhis) yalnız bir metre ilerleyince tazelenir.
   */
  update(frame: HudFrame): void {
    this.minimap.batch(() => {
      const player = this.player;
      player.worldX = frame.x;
      player.worldY = frame.y;
      player.rotation = frame.hull;
      this.generation += 1;
      this.minimap.syncMarkers((set) => {
        set('player', player);
        for (const vehicle of frame.vehicles?.() ?? []) {
          if (vehicle.player) continue;
          let entry = this.others.get(vehicle.id);
          if (!entry) {
            entry = {
              key: `v${vehicle.id}`,
              seen: 0,
              marker: {
                worldX: 0,
                worldY: 0,
                color: VOL_COLORS.uiTextSecondary,
                shape: 'arrow',
                radius: 3.5,
                kind: 'vehicle',
                edge: true,
              },
            };
            this.others.set(vehicle.id, entry);
          }
          entry.seen = this.generation;
          entry.marker.worldX = vehicle.x;
          entry.marker.worldY = vehicle.y;
          entry.marker.rotation = vehicle.hull;
          set(entry.key, entry.marker);
        }
      });
      for (const [id, entry] of this.others)
        if (entry.seen !== this.generation) this.others.delete(id);
      this.minimap.follow('player');
      this.minimap.setViewport(frame.view.x, frame.view.y, frame.view.width, frame.view.height);
    });
    if (Math.hypot(frame.x - this.shownX, frame.y - this.shownY) >= this.metre) {
      this.shownX = frame.x;
      this.shownY = frame.y;
      this.element.dataset.position = `${formatMetres(frame.x, this.metre)},${formatMetres(
        frame.y,
        this.metre,
      )}`;
    }
  }

  destroy(): void {
    this.minimap.destroy();
  }
}
