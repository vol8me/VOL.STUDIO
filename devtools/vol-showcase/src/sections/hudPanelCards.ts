/**
 * HUD sekmesinin PANEL kartları — CORE `ui/hud/` ailesi.
 * Bölme gerekçesi için bkz. `hudFeedbackCards.ts`.
 */
import type { CancellableDisposable, DisposableScope } from '@volstudio/core/lifecycle';
import {
  Button,
  FpsMeter,
  MinimapPanel,
  SegmentedControl,
  SelectionInfoPanel,
  StatsPanel,
  Text,
  VOL_COLORS,
  RoundCounter,
  type FpsMeterPosition,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, svgIcon } from './shared';
import { ICON_AMMO, ICON_FIRE, ICON_SPEED, ICON_SWORD, ICON_TURRET } from './icons';

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
  // Seçili öğenin canı; "hasar" düşük durumu (desen + okuyucu metni) göstermek için gerçek değeri izler.
  let health = 80;

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const selectButton = new Button(i18next.t('volui:hud.selectTower'), {
    variant: 'primary',
    onClick: () => {
      health = 80;
      panel.show({
        name: i18next.t('volui:hud.arrowTowerLv2'),
        portrait: svgIcon(ICON_TURRET),
        health: { max: 100, value: health, lowThreshold: 0.3 },
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
            onClick: () => {
              health = 100;
              panel.setHealth(health);
            },
          },
        ],
      });
    },
  });
  const hurtButton = new Button(i18next.t('volui:hud.damageSelected'), {
    variant: 'danger',
    onClick: () => {
      health = Math.max(0, health - 30);
      panel.setHealth(health);
    },
  });
  const clearButton = new Button(i18next.t('volui:hud.clearSelection'), {
    onClick: () => panel.clear(),
  });
  disposables.addDestroyables(selectButton, hurtButton, clearButton);

  controls.appendChild(selectButton.element);
  controls.appendChild(hurtButton.element);
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
    width: 240,
    height: 240,
    backgroundImage: buildMinimapBackgroundTexture(),
    // Orijini merkezde olan dünya örneği: -1000..1000 aralığı, sol-üst köşeye offsetli.
    worldWidth: 2000,
    worldHeight: 2000,
    worldOffsetX: -1000,
    worldOffsetY: -1000,
    grid: { step: 100, majorEvery: 5 },
    scaleBar: { unitsPerMetre: 10, unit: 'm' },
    north: true,
    wheelZoom: true,
    controls: true,
    maxZoom: 6,
    onClick: (worldX, worldY) => {
      result.setContent(
        i18next.t('volui:hud.cameraJumped', { x: Math.round(worldX), y: Math.round(worldY) }),
      );
    },
    onNavigate: (worldX, worldY) => {
      result.setContent(
        i18next.t('volui:hud.cameraJumped', { x: Math.round(worldX), y: Math.round(worldY) }),
      );
    },
    describe: (counts, zoom) =>
      i18next.t('volui:hud.minimapSummary', {
        enemies: counts.enemy ?? 0,
        structures: counts.structure ?? 0,
        zoom,
      }),
  });
  disposables.addDestroyables(minimap);
  minimap.element.style.alignSelf = 'center';

  // Canlı örnek: düşmanlar yörüngede döner (durağan harita çizim istemez; hareket yalnız değişen kareyi çizdirir).
  const enemies = [
    { id: 'enemy-1', radius: 650, speed: 0.4, phase: 0 },
    { id: 'enemy-2', radius: 820, speed: -0.3, phase: 2 },
    { id: 'enemy-3', radius: 380, speed: 0.7, phase: 4 },
  ];
  let playerTurn = 0;
  const frame = (time: number): void => {
    playerTurn = time / 4000;
    minimap.batch(() => {
      minimap.setMarker('player', {
        worldX: Math.cos(playerTurn) * 220,
        worldY: Math.sin(playerTurn) * 220,
        color: VOL_COLORS.brandHover,
        radius: 5,
        shape: 'arrow',
        rotation: playerTurn + Math.PI / 2,
        kind: 'player',
        priority: 10,
      });
      for (const enemy of enemies) {
        const angle = enemy.phase + (time / 1000) * enemy.speed;
        minimap.setMarker(enemy.id, {
          worldX: Math.cos(angle) * enemy.radius,
          worldY: Math.sin(angle) * enemy.radius,
          color: VOL_COLORS.dangerSolid,
          radius: 3.5,
          kind: 'enemy',
          edge: true,
        });
      }
    });
  };
  minimap.setMarker('base', {
    worldX: -700,
    worldY: -600,
    color: VOL_COLORS.supportSolid,
    shape: 'square',
    radius: 4.5,
    kind: 'structure',
    label: i18next.t('volui:hud.minimapLabelBase'),
  });
  minimap.setMarker('objective', {
    worldX: 650,
    worldY: 700,
    color: VOL_COLORS.warningSolid,
    shape: 'diamond',
    radius: 4,
    kind: 'structure',
    priority: 5,
    label: i18next.t('volui:hud.minimapLabelObjective'),
  });
  minimap.setViewport(-300, -300, 600, 600);
  const started = performance.now();
  frame(0);
  const animation = disposables.addInterval(() => frame(performance.now() - started), 100);
  disposables.add({ dispose: () => animation.cancel() });

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

  let following = false;
  const followButton = new Button(i18next.t('volui:hud.minimapFollow'), {
    onClick: () => {
      following = !following;
      followButton.element.setAttribute('aria-pressed', String(following));
      if (following && minimap.getZoom() === 1) minimap.setZoom(3);
      minimap.follow(following ? 'player' : null);
    },
  });
  followButton.element.setAttribute('aria-pressed', 'false');
  disposables.addDestroyables(followButton);
  controls.appendChild(followButton.element);

  const pingButton = new Button(i18next.t('volui:hud.minimapPing'), {
    onClick: () => {
      minimap.ping(Math.cos(2) * 820, Math.sin(2) * 820, VOL_COLORS.dangerSolid);
    },
  });
  disposables.addDestroyables(pingButton);
  controls.appendChild(pingButton.element);
  wrap.appendChild(controls);

  wrap.appendChild(result.element);

  return card(i18next.t('volui:hud.minimap'), wrap);
}

/**
 * FpsMeter GERÇEK karelerden beslenir; sahte bir sayı göstermek bileşenin
 * ölçtüğü şeyi gizlerdi. Kart içindeki örnek `position: fixed`i bir showcase
 * class'ıyla akışa alır — köşeye yapışan canlı örnek düğmeyle ayrıca açılır.
 */
export function buildFpsMeterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const inline = new FpsMeter({ className: 'vol-showcase-fps-meter' });
  disposables.addDestroyables(inline);
  wrap.appendChild(inline.element);

  const hint = new Text(i18next.t('volui:hud.fpsMeterHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  let pinned: FpsMeter | null = null;
  let corner: FpsMeterPosition = 'top-right';

  const positions = new SegmentedControl({
    options: [
      { value: 'top-left', label: i18next.t('volui:hud.fpsMeterTopLeft') },
      { value: 'top-right', label: i18next.t('volui:hud.fpsMeterTopRight') },
      { value: 'bottom-left', label: i18next.t('volui:hud.fpsMeterBottomLeft') },
      { value: 'bottom-right', label: i18next.t('volui:hud.fpsMeterBottomRight') },
    ],
    value: corner,
    onCommit: (value: string) => {
      corner = value as FpsMeterPosition;
      pinned?.setPosition(corner);
    },
  });
  disposables.addDestroyables(positions);
  controls.appendChild(positions.element);

  const toggle = new Button(i18next.t('volui:hud.fpsMeterPin'), {
    variant: 'default',
    onClick: () => {
      if (pinned) {
        pinned.destroy();
        pinned = null;
        toggle.setLabel(i18next.t('volui:hud.fpsMeterPin'));
        return;
      }
      pinned = new FpsMeter({ position: corner });
      document.body.appendChild(pinned.element);
      toggle.setLabel(i18next.t('volui:hud.fpsMeterUnpin'));
    },
  });
  disposables.addDestroyables(toggle);
  /* Kart yıkılırken köşeye tutturulmuş örnek sayfada KALMAMALI. */
  disposables.addDestroyables({ destroy: () => pinned?.destroy() });
  controls.appendChild(toggle.element);

  wrap.appendChild(controls);
  return card(i18next.t('volui:hud.fpsMeterTitle'), wrap);
}
