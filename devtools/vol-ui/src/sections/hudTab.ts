import { DisposableScope, type CancellableDisposable } from '@volstudio/core/lifecycle';
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
  RoundCounter,
  XPBar,
  applyXpGain,
} from '@volstudio/core/ui';
import type { BarVariant } from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { card, cardGrid, svgIcon } from './shared';
import {
  ICON_AMMO,
  ICON_COIN,
  ICON_FIRE,
  ICON_GOLD,
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

const VARIANT_KEYS: Record<BarVariant, string> = {
  health: 'volui:hud.health',
  stamina: 'volui:hud.stamina',
  cooldown: 'volui:hud.cooldown',
};

function buildBarVariantCard(variant: BarVariant, disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({ variant, max: 100, value: 100, label: (v, m) => `${v} / ${m}` });
  disposables.addDestroyables(bar);
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
  disposables.addDestroyables(decButton, incButton);

  controls.appendChild(decButton.element);
  controls.appendChild(incButton.element);
  wrap.appendChild(controls);

  return card(i18n.tDynamic(VARIANT_KEYS[variant]), wrap);
}

/** lowThreshold altında kırmızıya döner. Varsayılan %25, burada %50. */
function buildLowThresholdCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({
    variant: 'health',
    max: 100,
    value: 100,
    lowThreshold: 0.5,
    label: (v, m) => `${v} / ${m}`,
  });
  disposables.addDestroyables(bar);
  wrap.appendChild(bar.element);

  const hint = new Text(i18next.t('volui:hud.lowThresholdHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(hint);
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
  disposables.addDestroyables(decButton, resetButton);

  controls.appendChild(decButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.criticalThreshold'), wrap);
}

function buildCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({ value: 0 });
  counter.element.style.fontSize = '32px';
  disposables.addDestroyables(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addScore'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 10, { pulse: true }),
  });
  disposables.addDestroyables(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counter'), wrap);
}

/** Özel format (binlik ayraç + para birimi) örneği. */
function buildFormattedCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({
    value: 0,
    format: (v) => `${Math.round(v).toLocaleString('tr-TR')} ₺`,
  });
  counter.element.style.fontSize = '32px';
  disposables.addDestroyables(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addGold'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 500, { pulse: true }),
  });
  disposables.addDestroyables(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counterFormatted'), wrap);
}

/**
 * XPBar: saf görüntü. İlerleme KURALI (taşan XP sonraki seviyeye devreder)
 * bileşende değil, CORE'un opsiyonel `applyXpGain` tarifindedir — bar yalnızca
 * `setState()` ile eşitlenir. Farklı bir kural isteyen oyun tarifi çağırmaz.
 */
function buildXPBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const xpForLevel = (level: number): number => 50 + level * 25;
  let progress = { level: 1, xp: 0 };

  const xpBar = new XPBar({ level: progress.level, xp: progress.xp, xpForLevel });

  const gainXp = (amount: number): void => {
    const next = applyXpGain(progress.level, progress.xp, amount, xpForLevel);
    progress = { level: next.level, xp: next.xp };
    xpBar.setState(progress.level, progress.xp);
  };
  disposables.addDestroyables(xpBar);
  wrap.appendChild(xpBar.element);

  const hint = new Text(i18next.t('volui:hud.xpHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const addSmallButton = new Button(i18next.t('volui:hud.add20XP'), {
    onClick: () => gainXp(20),
  });
  const addBigButton = new Button(i18next.t('volui:hud.add150XP'), {
    variant: 'primary',
    onClick: () => gainXp(150),
  });
  disposables.addDestroyables(addSmallButton, addBigButton);

  controls.appendChild(addSmallButton.element);
  controls.appendChild(addBigButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.xpBar'), wrap);
}

function buildResourceCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const ammo = new ResourceCounter({
    icon: svgIcon(ICON_AMMO),
    label: i18next.t('volui:hud.ammo'),
    value: 30,
  });
  ammo.element.style.fontSize = '24px';
  disposables.addDestroyables(ammo);

  const mana = new ResourceCounter({
    icon: svgIcon(ICON_MANA),
    label: i18next.t('volui:hud.mana'),
    value: 80,
  });
  mana.element.style.fontSize = '24px';
  disposables.addDestroyables(mana);

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
  disposables.addDestroyables(fireButton, spellButton);

  controls.appendChild(fireButton.element);
  controls.appendChild(spellButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceCounter'), wrap);
}

/**
 * FloatingTextManager: kayıp/kazanç/vurgu sayıları belirli x/y'de belirir, yukarı süzülür ve kaybolur.
 *
 * Varyant adları GÖRSELDİR (negative/positive/emphasis); oyun anlamını çağıran
 * eşler — bu demoda hasar/iyileşme/kritik vuruş olarak gösteriliyor.
 */
function buildFloatingTextCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage vol-showcase-panel-stage--wide';
  wrap.appendChild(stage);

  const manager = new FloatingTextManager(stage, { anchor: 'absolute' });
  disposables.addDestroyables({ destroy: () => manager.destroy() });

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
      manager.spawn(x, y, `-${Math.ceil(Math.random() * 30) + 5}`, { variant: 'negative' });
    },
  });
  const healButton = new Button(i18next.t('volui:hud.heal'), {
    variant: 'primary',
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `+${Math.ceil(Math.random() * 20) + 5}`, { variant: 'positive' });
    },
  });
  const criticalButton = new Button(i18next.t('volui:hud.critical'), {
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(
        x,
        y,
        i18next.t('volui:hud.floatingCritical', { value: Math.ceil(Math.random() * 50) + 40 }),
        { variant: 'emphasis' },
      );
    },
  });
  disposables.addDestroyables(damageButton, healButton, criticalButton);

  controls.appendChild(damageButton.element);
  controls.appendChild(healButton.element);
  controls.appendChild(criticalButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.floatingText'), wrap, { spanAll: true });
}

/** ResourceBar: RTS/otomasyon için sabit çoklu-kaynak şeridi. */
function buildResourceBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const resourceBar = new ResourceBar({
    resources: [
      { key: 'gold', icon: svgIcon(ICON_GOLD), label: i18next.t('volui:hud.gold'), value: 250 },
      { key: 'wood', icon: svgIcon(ICON_WOOD), label: i18next.t('volui:hud.wood'), value: 120 },
    ],
  });
  disposables.addDestroyables(resourceBar);
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
  disposables.addDestroyables(gatherButton, spendButton);

  controls.appendChild(gatherButton.element);
  controls.appendChild(spendButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceBar'), wrap);
}

/** RoundCounter saf görüntüdür; demo akışı yalnız bu builder içinde tutulur. */
function buildRoundCounterCard(disposables: DisposableScope): HTMLElement {
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
function buildSelectionInfoPanelCard(disposables: DisposableScope): HTMLElement {
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

/** BuildMenu: RTS/TD inşa menüsü — ikon+ad+maliyet+kısayol grid'i. */
function buildBuildMenuCard(disposables: DisposableScope): HTMLElement {
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
function buildMinimapCard(disposables: DisposableScope): HTMLElement {
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

export function buildHudTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();

  const cards = [
    buildBarVariantCard('health', disposables),
    buildBarVariantCard('stamina', disposables),
    buildBarVariantCard('cooldown', disposables),
    buildLowThresholdCard(disposables),
    buildXPBarCard(disposables),
    buildCounterCard(disposables),
    buildFormattedCounterCard(disposables),
    buildResourceCounterCard(disposables),
    // Minimap eskiden FloatingText'in yerinde (tekli sütun). FloatingText
    // BuildMenu'nün hemen altına, tam satır olarak taşındı (bkz. aşağıda).
    buildMinimapCard(disposables),
    buildResourceBarCard(disposables),
    buildRoundCounterCard(disposables),
    buildSelectionInfoPanelCard(disposables),
    buildBuildMenuCard(disposables),
    buildFloatingTextCard(disposables),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.dispose(),
  };
}
