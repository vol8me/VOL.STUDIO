import {
  Bar,
  BuildMenu,
  Button,
  Counter,
  FloatingTextManager,
  MinimapPanel,
  ResourceBar,
  ResourceCounter,
  SelectionInfoPanel,
  Text,
  VOL_COLORS,
  WaveCounter,
  XPBar,
  i18n,
  i18next,
} from '@volstudio/core';
import type { BarVariant } from '@volstudio/core';
import { card, cardGrid, svgIcon } from './shared';
import {
  ICON_AMMO,
  ICON_FIRE,
  ICON_GOLD,
  ICON_GUARD,
  ICON_MANA,
  ICON_SWORD,
  ICON_TOWER,
  ICON_TURRET,
  ICON_WALL,
  ICON_WOOD,
} from './icons';

interface Destroyable {
  destroy(): void;
}

const VARIANT_KEYS: Record<BarVariant, string> = {
  health: 'volui:hud.health',
  stamina: 'volui:hud.stamina',
  cooldown: 'volui:hud.cooldown',
};

function buildBarVariantCard(variant: BarVariant, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({ variant, max: 100, value: 100, label: (v, m) => `${v} / ${m}` });
  disposables.push(bar);
  wrap.appendChild(bar.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const decButton = new Button('-20', {
    onClick: () => {
      const next = Math.max(0, bar.getValue() - 20);
      bar.setValue(next);
    },
  });
  const incButton = new Button('+20', {
    variant: 'primary',
    onClick: () => {
      const next = Math.min(100, bar.getValue() + 20);
      bar.setValue(next);
    },
  });
  disposables.push(decButton, incButton);

  controls.appendChild(decButton.element);
  controls.appendChild(incButton.element);
  wrap.appendChild(controls);

  return card(i18n.tDynamic(VARIANT_KEYS[variant]), wrap);
}

/** lowThreshold altında kırmızıya döner. Varsayılan %25, burada %50. */
function buildLowThresholdCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({
    variant: 'health',
    max: 100,
    value: 100,
    lowThreshold: 0.5,
    label: (v, m) => `${v} / ${m}`,
  });
  disposables.push(bar);
  wrap.appendChild(bar.element);

  const hint = new Text(i18next.t('volui:hud.lowThresholdHint'), {
    variant: 'muted',
  });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const decButton = new Button('-10', {
    variant: 'danger',
    onClick: () => bar.setValue(Math.max(0, bar.getValue() - 10)),
  });
  const resetButton = new Button(i18next.t('volui:hud.reset'), {
    onClick: () => bar.setValue(100),
  });
  disposables.push(decButton, resetButton);

  controls.appendChild(decButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.criticalThreshold'), wrap);
}

function buildCounterCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({ value: 0 });
  counter.element.style.fontSize = '32px';
  disposables.push(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addScore'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 10, { pulse: true }),
  });
  disposables.push(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counter'), wrap);
}

/** Özel format (binlik ayraç + para birimi) örneği. */
function buildFormattedCounterCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({
    value: 0,
    format: (v) => `${Math.round(v).toLocaleString('tr-TR')} ₺`,
  });
  counter.element.style.fontSize = '32px';
  disposables.push(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addGold'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 500, { pulse: true }),
  });
  disposables.push(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counterFormatted'), wrap);
}

/** XPBar: eşiği aşan XP sonraki seviyeye taşınır, level-up vurgusu oynar. */
function buildXPBarCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const xpBar = new XPBar({
    level: 1,
    xp: 0,
    xpForLevel: (level) => 50 + level * 25,
  });
  disposables.push(xpBar);
  wrap.appendChild(xpBar.element);

  const hint = new Text(i18next.t('volui:hud.xpHint'), {
    variant: 'muted',
  });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const addSmallButton = new Button(i18next.t('volui:hud.add20XP'), {
    onClick: () => xpBar.addXP(20),
  });
  const addBigButton = new Button(i18next.t('volui:hud.add150XP'), {
    variant: 'primary',
    onClick: () => xpBar.addXP(150),
  });
  disposables.push(addSmallButton, addBigButton);

  controls.appendChild(addSmallButton.element);
  controls.appendChild(addBigButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.xpBar'), wrap);
}

function buildResourceCounterCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const ammo = new ResourceCounter({
    icon: svgIcon(ICON_AMMO),
    label: i18next.t('volui:hud.ammo'),
    value: 30,
  });
  ammo.element.style.fontSize = '24px';
  disposables.push(ammo);

  const mana = new ResourceCounter({
    icon: svgIcon(ICON_MANA),
    label: i18next.t('volui:hud.mana'),
    value: 80,
  });
  mana.element.style.fontSize = '24px';
  disposables.push(mana);

  const row = document.createElement('div');
  row.className = 'vol-showcase-panel-demo__controls';
  row.appendChild(ammo.element);
  row.appendChild(mana.element);
  wrap.appendChild(row);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const fireButton = new Button(i18next.t('volui:hud.fire'), {
    variant: 'danger',
    onClick: () => ammo.setValue(Math.max(0, ammo.getValue() - 1), { pulse: true }),
  });
  const spellButton = new Button(i18next.t('volui:hud.castSpell'), {
    variant: 'primary',
    onClick: () => mana.setValue(Math.max(0, mana.getValue() - 15), { pulse: true }),
  });
  disposables.push(fireButton, spellButton);

  controls.appendChild(fireButton.element);
  controls.appendChild(spellButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceCounter'), wrap);
}

/** FloatingTextManager: hasar/iyileşme/kritik sayıları belirli x/y'de belirir, yukarı süzülür ve kaybolur. */
function buildFloatingTextCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage';
  wrap.appendChild(stage);

  const manager = new FloatingTextManager(stage, { anchor: 'absolute' });
  disposables.push({ destroy: () => manager.destroy() });

  const spawnAt = (): { x: number; y: number } => {
    const rect = stage.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  };

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const damageButton = new Button(i18next.t('volui:hud.damage'), {
    variant: 'danger',
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `-${Math.ceil(Math.random() * 30) + 5}`, { variant: 'damage' });
    },
  });
  const healButton = new Button(i18next.t('volui:hud.heal'), {
    variant: 'primary',
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `+${Math.ceil(Math.random() * 20) + 5}`, { variant: 'heal' });
    },
  });
  const criticalButton = new Button(i18next.t('volui:hud.critical'), {
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `-${Math.ceil(Math.random() * 50) + 40} KRİTİK!`, {
        variant: 'critical',
      });
    },
  });
  disposables.push(damageButton, healButton, criticalButton);

  controls.appendChild(damageButton.element);
  controls.appendChild(healButton.element);
  controls.appendChild(criticalButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.floatingText'), wrap);
}

/** ResourceBar: RTS/otomasyon için sabit çoklu-kaynak şeridi. */
function buildResourceBarCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const resourceBar = new ResourceBar({
    resources: [
      { key: 'gold', icon: svgIcon(ICON_GOLD), label: i18next.t('volui:hud.gold'), value: 250 },
      { key: 'wood', icon: svgIcon(ICON_WOOD), label: i18next.t('volui:hud.wood'), value: 120 },
    ],
  });
  disposables.push(resourceBar);
  wrap.appendChild(resourceBar.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const gatherButton = new Button(i18next.t('volui:hud.gather'), {
    onClick: () =>
      resourceBar.setResource('wood', (resourceBar.getResource('wood') ?? 0) + 10, { pulse: true }),
  });
  const spendButton = new Button(i18next.t('volui:hud.spend'), {
    variant: 'danger',
    onClick: () =>
      resourceBar.setResource('gold', Math.max(0, (resourceBar.getResource('gold') ?? 0) - 50), {
        pulse: true,
      }),
  });
  disposables.push(gatherButton, spendButton);

  controls.appendChild(gatherButton.element);
  controls.appendChild(spendButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceBar'), wrap);
}

/** WaveCounter: dalga numarası + geri sayım. startAutoLoop() otomatik ilerletir, totalWaves'te durur. */
function buildWaveCounterCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const waveCounter = new WaveCounter({ totalWaves: 10 });
  disposables.push(waveCounter);
  wrap.appendChild(waveCounter.element);

  const hint = new Text(i18next.t('volui:hud.waveCounterHint'), { variant: 'muted' });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const startLoopButton = new Button(i18next.t('volui:hud.startAutoLoop'), {
    variant: 'primary',
    onClick: () => {
      waveCounter.startAutoLoop({
        countdownSeconds: 3,
        onWaveStart: () => {
          // Gerçek oyunda düşman üretimi burada tetiklenir.
        },
      });
    },
  });
  disposables.push(startLoopButton);

  const resetButton = new Button(i18next.t('volui:hud.reset'), {
    onClick: () => {
      waveCounter.stopCountdown();
      waveCounter.setWave(1);
    },
  });
  disposables.push(resetButton);

  controls.appendChild(startLoopButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.waveCounter'), wrap);
}

/** SelectionInfoPanel: RTS birim/TD kule detay paneli. */
function buildSelectionInfoPanelCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const panel = new SelectionInfoPanel();
  disposables.push(panel);
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
  disposables.push(selectButton, clearButton);

  controls.appendChild(selectButton.element);
  controls.appendChild(clearButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.selectionInfoPanel'), wrap);
}

/** BuildMenu: RTS/TD inşa menüsü — ikon+ad+maliyet+kısayol grid'i. */
function buildBuildMenuCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:hud.awaitingSelection'), { variant: 'muted' });
  disposables.push(result);

  const buildMenu = new BuildMenu({
    items: [
      {
        id: 'turret',
        icon: svgIcon(ICON_TURRET),
        label: i18next.t('volui:hud.arrowTower'),
        cost: i18next.t('volui:hud.cost50Gold'),
        hotkey: 'Q',
        onSelect: () =>
          result.setContent(
            i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.arrowTower') }),
          ),
        onDeselect: () => result.setContent(i18next.t('volui:hud.selectionCancelled')),
      },
      {
        id: 'wall',
        icon: svgIcon(ICON_WALL),
        label: i18next.t('volui:hud.wall'),
        cost: i18next.t('volui:hud.cost20Wood'),
        hotkey: 'W',
        onSelect: () =>
          result.setContent(i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.wall') })),
        onDeselect: () => result.setContent(i18next.t('volui:hud.selectionCancelled')),
      },
      {
        id: 'barracks',
        icon: svgIcon(ICON_SWORD),
        label: i18next.t('volui:hud.barracks'),
        cost: i18next.t('volui:hud.cost100Gold'),
        hotkey: 'E',
        disabled: true,
        onSelect: () =>
          result.setContent(
            i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.barracks') }),
          ),
      },
      {
        id: 'fire-tower',
        icon: svgIcon(ICON_FIRE),
        label: i18next.t('volui:hud.fireTower'),
        cost: i18next.t('volui:hud.cost75Gold'),
        hotkey: 'R',
        onSelect: () =>
          result.setContent(
            i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.fireTower') }),
          ),
        onDeselect: () => result.setContent(i18next.t('volui:hud.selectionCancelled')),
      },
      {
        id: 'watchtower',
        icon: svgIcon(ICON_TOWER),
        label: i18next.t('volui:hud.watchtower'),
        cost: i18next.t('volui:hud.cost60Wood'),
        hotkey: 'T',
        onSelect: () =>
          result.setContent(
            i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.watchtower') }),
          ),
        onDeselect: () => result.setContent(i18next.t('volui:hud.selectionCancelled')),
      },
      {
        id: 'guard-tower',
        icon: svgIcon(ICON_GUARD),
        label: i18next.t('volui:hud.guardTower'),
        cost: i18next.t('volui:hud.cost120Gold'),
        hotkey: 'Y',
        disabled: true,
        onSelect: () =>
          result.setContent(
            i18next.t('volui:hud.selected', { name: i18next.t('volui:hud.guardTower') }),
          ),
      },
    ],
  });
  disposables.push(buildMenu);
  wrap.appendChild(buildMenu.element);
  wrap.appendChild(result.element);

  return card(i18next.t('volui:hud.buildMenu'), wrap, { span: 3 });
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
function buildMinimapCard(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:hud.minimapHint'), { variant: 'muted' });
  disposables.push(result);

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
  disposables.push(minimap);
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
  disposables.push(zoomButton);
  controls.appendChild(zoomButton.element);
  wrap.appendChild(controls);

  wrap.appendChild(result.element);

  return card(i18next.t('volui:hud.minimap'), wrap);
}

export function buildHudTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    buildBarVariantCard('health', disposables),
    buildBarVariantCard('stamina', disposables),
    buildBarVariantCard('cooldown', disposables),
    buildLowThresholdCard(disposables),
    buildXPBarCard(disposables),
    buildCounterCard(disposables),
    buildFormattedCounterCard(disposables),
    buildResourceCounterCard(disposables),
    buildFloatingTextCard(disposables),
    buildResourceBarCard(disposables),
    buildWaveCounterCard(disposables),
    buildSelectionInfoPanelCard(disposables),
    buildBuildMenuCard(disposables),
    buildMinimapCard(disposables),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
