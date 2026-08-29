/**
 * HUD sekmesinin PANEL kartları — CORE `ui/hud/` ailesi.
 * Bölme gerekçesi için bkz. `hudFeedbackCards.ts`.
 */
import type { CancellableDisposable, DisposableScope } from '@volstudio/core/lifecycle';
import {
  BuildMenu,
  Button,
  MinimapPanel,
  SelectionInfoPanel,
  StatsPanel,
  Text,
  VOL_COLORS,
  RoundCounter,
} from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { card, svgIcon } from './shared';
import {
  ICON_AMMO,
  ICON_COIN,
  ICON_FIRE,
  ICON_GUARD,
  ICON_MANA,
  ICON_SPEED,
  ICON_SWORD,
  ICON_TOWER,
  ICON_TURRET,
  ICON_WALL,
  ICON_WOOD,
  ICON_ZOOM_IN,
  ICON_ZOOM_OUT,
} from './icons';

/** RoundCounter saf görüntüdür; demo akışı yalnız bu builder içinde tutulur. */
export function buildRoundCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const roundCounter = new RoundCounter({ totalRounds: 10 });
  disposables.addDestroyables(roundCounter);
  wrap.appendChild(roundCounter.element);

  const hint = new Text(i18next.t('volui:hud.waveCounterHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const breakMs = 3000;
  const totalRounds = 10;
  let running = false;
  let round = 1;
  let remainingMs = breakMs;
  let roundFrame: CancellableDisposable | null = null;
  let lastFrame = 0;

  const tick = (now: number): void => {
    const delta = lastFrame === 0 ? 0 : now - lastFrame;
    lastFrame = now;
    remainingMs = Math.max(0, remainingMs - delta);
    if (remainingMs === 0) {
      round += 1;
      if (round > totalRounds) {
        stopLoop();
        return;
      }
      remainingMs = breakMs;
      roundCounter.setRound(round);
    }
    roundCounter.setRemainingSeconds(remainingMs / 1000);
    if (running) {
      roundFrame = disposables.addAnimationFrame(tick);
    }
  };

  const stopLoop = (): void => {
    running = false;
    lastFrame = 0;
    roundFrame?.cancel();
    roundFrame = null;
  };

  const startLoopButton = new Button(i18next.t('volui:hud.startAutoLoop'), {
    variant: 'primary',
    onClick: () => {
      stopLoop();
      running = true;
      round = 1;
      remainingMs = breakMs;
      roundCounter.setRound(round);
      roundCounter.setRemainingSeconds(remainingMs / 1000);
      lastFrame = 0;
      roundFrame = disposables.addAnimationFrame(tick);
    },
  });
  disposables.addDestroyables(startLoopButton);

  const resetButton = new Button(i18next.t('volui:hud.reset'), {
    onClick: () => {
      stopLoop();
      roundCounter.stopCountdown();
      round = 1;
      remainingMs = breakMs;
      roundCounter.setRound(round);
    },
  });
  disposables.addDestroyables(resetButton);

  controls.appendChild(startLoopButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.waveCounter'), wrap);
}

/** SelectionInfoPanel: RTS birim/TD kule detay paneli. */
export function buildSelectionInfoPanelCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const panel = new SelectionInfoPanel();
  disposables.addDestroyables(panel);
  wrap.appendChild(panel.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const selectButton = new Button(i18next.t('volui:hud.selectTower'), {
    variant: 'primary',
    onClick: () => {
      panel.show({
        name: i18next.t('volui:hud.arrowTowerLv2'),
        portrait: svgIcon(ICON_TURRET),
        health: { max: 100, value: 80, lowThreshold: 0.3 },
        stats: [
          { label: i18next.t('volui:hud.statDamage'), value: '12' },
          { label: i18next.t('volui:hud.statRange'), value: '4' },
          { label: i18next.t('volui:hud.statFireRate'), value: '1.2/s' },
        ],
        actions: [
          {
            icon: svgIcon(ICON_SWORD),
            label: i18next.t('volui:hud.upgrade'),
            variant: 'primary',
            onClick: () => panel.setHealth(100),
          },
        ],
      });
    },
  });
  const clearButton = new Button(i18next.t('volui:hud.clearSelection'), {
    onClick: () => panel.clear(),
  });
  disposables.addDestroyables(selectButton, clearButton);

  controls.appendChild(selectButton.element);
  controls.appendChild(clearButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.selectionInfoPanel'), wrap);
}

/** StatsPanel: mobilde sağdan açılan, modal arka planlı jenerik stat çekmecesi. */
export function buildStatsPanelCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const statsPanel = new StatsPanel({
    title: i18next.t('volui:hud.statsPanelTitle'),
    closeLabel: i18next.t('volui:hud.closeStatsPanel'),
  });
  statsPanel.setGroups([
    {
      id: 'player',
      label: i18next.t('volui:hud.playerStats'),
      icon: svgIcon(ICON_TURRET),
      entries: [
        {
          id: 'health',
          label: i18next.t('volui:hud.statHealth'),
          value: '120 / 120',
          icon: svgIcon(ICON_AMMO),
        },
        {
          id: 'damage',
          label: i18next.t('volui:hud.statDamage'),
          value: '18',
          icon: svgIcon(ICON_SWORD),
        },
        {
          id: 'speed',
          label: i18next.t('volui:hud.statSpeed'),
          value: '240 px/s',
          icon: svgIcon(ICON_SPEED),
        },
        {
          id: 'fireRate',
          label: i18next.t('volui:hud.statFireRate'),
          value: '3.6/s',
          icon: svgIcon(ICON_FIRE),
        },
      ],
    },
  ]);
  const openButton = new Button(i18next.t('volui:hud.openStatsPanel'), {
    variant: 'primary',
    onClick: () => statsPanel.open(),
  });
  disposables.addDestroyables(statsPanel, openButton);
  wrap.append(openButton.element, statsPanel.element);

  return card(i18next.t('volui:hud.statsPanel'), wrap, { spanAll: true });
}

/** BuildMenu: RTS/TD inşa menüsü — ikon+ad+maliyet+kısayol grid'i. */
export function buildBuildMenuCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:hud.awaitingSelection'), { variant: 'muted' });
  disposables.addDestroyables(result);

  const buildMenuItems = [
    {
      id: 'turret',
      icon: ICON_TURRET,
      label: 'volui:hud.arrowTower',
      cost: 'volui:hud.cost50Gold',
      hotkey: 'Q',
    },
    {
      id: 'wall',
      icon: ICON_WALL,
      label: 'volui:hud.wall',
      cost: 'volui:hud.cost20Wood',
      hotkey: 'W',
    },
    {
      id: 'barracks',
      icon: ICON_SWORD,
      label: 'volui:hud.barracks',
      cost: 'volui:hud.cost100Gold',
      hotkey: 'E',
      disabled: true,
    },
    {
      id: 'fire-tower',
      icon: ICON_FIRE,
      label: 'volui:hud.fireTower',
      cost: 'volui:hud.cost75Gold',
      hotkey: 'R',
    },
    {
      id: 'watchtower',
      icon: ICON_TOWER,
      label: 'volui:hud.watchtower',
      cost: 'volui:hud.cost60Wood',
      hotkey: 'T',
    },
    {
      id: 'guard-tower',
      icon: ICON_GUARD,
      label: 'volui:hud.guardTower',
      cost: 'volui:hud.cost120Gold',
      hotkey: 'Y',
      disabled: true,
    },
    {
      id: 'healing-well',
      icon: ICON_MANA,
      label: 'volui:hud.healingWell',
      cost: 'volui:hud.cost60Gold',
      hotkey: 'U',
    },
    {
      id: 'ballista',
      icon: ICON_TURRET,
      label: 'volui:hud.ballista',
      cost: 'volui:hud.cost100Gold',
      hotkey: 'I',
    },
    {
      id: 'cannon',
      icon: ICON_FIRE,
      label: 'volui:hud.cannon',
      cost: 'volui:hud.cost120Gold',
      hotkey: 'O',
    },
    {
      id: 'observatory',
      icon: ICON_ZOOM_IN,
      label: 'volui:hud.observatory',
      cost: 'volui:hud.cost80Gold',
      hotkey: 'P',
    },
    {
      id: 'gate',
      icon: ICON_WALL,
      label: 'volui:hud.gate',
      cost: 'volui:hud.cost50Wood',
      hotkey: 'A',
    },
    {
      id: 'farm',
      icon: ICON_WOOD,
      label: 'volui:hud.farm',
      cost: 'volui:hud.cost30Wood',
      hotkey: 'S',
    },
    {
      id: 'lumber-mill',
      icon: ICON_WOOD,
      label: 'volui:hud.lumberMill',
      cost: 'volui:hud.cost40Wood',
      hotkey: 'D',
    },
    {
      id: 'market',
      icon: ICON_COIN,
      label: 'volui:hud.market',
      cost: 'volui:hud.cost100Gold',
      hotkey: 'F',
      disabled: true,
    },
    {
      id: 'shrine',
      icon: ICON_MANA,
      label: 'volui:hud.shrine',
      cost: 'volui:hud.cost150Gold',
      hotkey: 'G',
    },
    {
      id: 'stable',
      icon: ICON_SPEED,
      label: 'volui:hud.stable',
      cost: 'volui:hud.cost80Gold',
      hotkey: 'H',
    },
    {
      id: 'siege-workshop',
      icon: ICON_SWORD,
      label: 'volui:hud.siegeWorkshop',
      cost: 'volui:hud.cost120Gold',
      hotkey: 'J',
    },
    {
      id: 'mage-tower',
      icon: ICON_TOWER,
      label: 'volui:hud.mageTower',
      cost: 'volui:hud.cost150Gold',
      hotkey: 'K',
    },
    {
      id: 'bunker',
      icon: ICON_GUARD,
      label: 'volui:hud.bunker',
      cost: 'volui:hud.cost90Gold',
      hotkey: 'L',
    },
    {
      id: 'lighthouse',
      icon: ICON_ZOOM_OUT,
      label: 'volui:hud.lighthouse',
      cost: 'volui:hud.cost110Gold',
      hotkey: ';',
      disabled: true,
    },
  ];

  const buildMenu = new BuildMenu({
    items: buildMenuItems.map((item) => ({
      ...item,
      icon: svgIcon(item.icon),
      label: i18n.tDynamic(item.label),
      cost: i18n.tDynamic(item.cost),
      onSelect: () =>
        result.setContent(i18next.t('volui:hud.selected', { name: i18n.tDynamic(item.label) })),
      onDeselect: () => result.setContent(i18next.t('volui:hud.selectionCancelled')),
    })),
  });
  disposables.addDestroyables(buildMenu);
  wrap.appendChild(buildMenu.element);
  wrap.appendChild(result.element);

  return card(i18next.t('volui:hud.buildMenu'), wrap, { spanAll: true });
}

/** MinimapPanel.backgroundImage için basit arazi dokusu üretir. */
function buildMinimapBackgroundTexture(): HTMLCanvasElement {
  const size = 256;
  const texture = document.createElement('canvas');
  texture.width = size;
  texture.height = size;
  const ctx = texture.getContext('2d');
  if (!ctx) return texture;

  // Canvas CSS custom property okuyamaz, VOL_COLORS doğrudan kullanılır.
  ctx.fillStyle = VOL_COLORS.uiBgSubtle;
  ctx.fillRect(0, 0, size, size);

  // Yamalar grid hücresine göre dağıtılır — Math.random() boş bölgeler bırakabilir.
  ctx.fillStyle = VOL_COLORS.successSubtle;
  const cellSize = 32;
  const cells = size / cellSize;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (Math.random() > 0.55) continue;
      const w = 12 + Math.random() * 14;
      const x = cx * cellSize + Math.random() * (cellSize - w);
      const y = cy * cellSize + Math.random() * (cellSize - w);
      ctx.fillRect(x, y, w, w);
    }
  }

  return texture;
}

/** MinimapPanel: dünya koordinatlarını piksele çevirir, işaretçi + viewport çizer. */
export function buildMinimapCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:hud.minimapHint'), { variant: 'muted' });
  disposables.addDestroyables(result);

  const minimap = new MinimapPanel({
    width: 200,
    height: 200,
    backgroundImage: buildMinimapBackgroundTexture(),
    // Orijini merkezde olan dünya örneği: -1000..1000 aralığı, sol-üst köşeye offsetli.
    worldWidth: 2000,
    worldHeight: 2000,
    worldOffsetX: -1000,
    worldOffsetY: -1000,
    onClick: (worldX, worldY) => {
      result.setContent(
        i18next.t('volui:hud.cameraJumped', { x: Math.round(worldX), y: Math.round(worldY) }),
      );
    },
  });
  disposables.addDestroyables(minimap);
  minimap.element.style.alignSelf = 'center';
  minimap.setMarker('player', {
    worldX: 0,
    worldY: 0,
    color: VOL_COLORS.onSupport,
    radius: 4,
    shape: 'arrow',
    rotation: -Math.PI / 4,
  });
  minimap.setMarker('enemy-1', { worldX: -600, worldY: 600, color: VOL_COLORS.dangerSolid });
  minimap.setMarker('enemy-2', { worldX: 700, worldY: -700, color: VOL_COLORS.dangerSolid });
  minimap.setViewport(-300, -300, 600, 600);

  wrap.appendChild(minimap.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const zoomButton = new Button(i18next.t('volui:hud.zoomIn2x'), {
    // pan() bilerek çağrılmadı: zoom değişiminde merkez korunur, manuel sıfırlama gerekmez.
    onClick: () => {
      const nextZoom = minimap.getZoom() > 1 ? 1 : 2;
      minimap.setZoom(nextZoom);
    },
  });
  disposables.addDestroyables(zoomButton);
  controls.appendChild(zoomButton.element);
  wrap.appendChild(controls);

  wrap.appendChild(result.element);

  return card(i18next.t('volui:hud.minimap'), wrap);
}
