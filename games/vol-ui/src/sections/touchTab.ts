import {
  ActionBar,
  Button,
  ChargeButton,
  DirectionButton,
  DPad,
  DualAxisScrollPanel,
  Joystick,
  LongPressButton,
  MultiTouchZone,
  PauseResumeButton,
  PinchZoomController,
  PullToRefresh,
  RadialMenu,
  SlotGrid,
  type SlotItem,
  SquareJoystick,
  SwipeableCardStack,
  SwipeGestureZone,
  Text,
  TouchButton,
  i18n,
  i18next,
} from '@volstudio/core';
import { card, cardGrid, svgIcon } from './shared';
import {
  ICON_DASH,
  ICON_FIRE,
  ICON_INVENTORY,
  ICON_JUMP,
  ICON_CROUCH,
  ICON_SPEED,
  ICON_TOWER,
  ICON_WAVE,
} from './icons';

interface Destroyable {
  destroy(): void;
}

/** Joystick demosu. Durum satırı joystick'in ALTINDA — yanına koyunca metin genişliği joystick'i kaydırıyordu. */
function buildJoystickDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const { element: statusRow, text: readout } = buildStatusRow('x: 0.00  y: 0.00');
  disposables.push(readout);

  const joystick = new Joystick({
    onMove: ({ x, y }) => readout.setContent(`x: ${x.toFixed(2)}  y: ${y.toFixed(2)}`),
    onRelease: () => readout.setContent('x: 0.00  y: 0.00'),
  });
  disposables.push(joystick);

  wrap.appendChild(joystick.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** SquareJoystick demosu: kare sınır — thumb köşelere ulaşır (dairesel Joystick köşegeni erken keser). Ayrı bileşen, alt sınıf değil. */
function buildSquareJoystickDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const { element: statusRow, text: readout } = buildStatusRow('x: 0.00  y: 0.00');
  disposables.push(readout);

  const squareJoystick = new SquareJoystick({
    onMove: ({ x, y }) => readout.setContent(`x: ${x.toFixed(2)}  y: ${y.toFixed(2)}`),
    onRelease: () => readout.setContent('x: 0.00  y: 0.00'),
  });
  disposables.push(squareJoystick);

  wrap.appendChild(squareJoystick.element);
  wrap.appendChild(statusRow);

  return wrap;
}

function buildTouchButtonDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-row__group';

  const status = new Text(i18next.t('volui:touch.released'), { variant: 'muted' });
  disposables.push(status);

  const fireButton = new TouchButton({
    shape: 'circle',
    icon: svgIcon(ICON_FIRE),
    label: i18next.t('volui:touch.fire'),
    onPress: () => status.setContent(i18next.t('volui:touch.pressedFire')),
    onRelease: () => status.setContent(i18next.t('volui:touch.released')),
  });

  const dashButton = new TouchButton({
    shape: 'square',
    icon: svgIcon(ICON_DASH),
    label: i18next.t('volui:touch.dash'),
    size: 64,
    onPress: () => status.setContent(i18next.t('volui:touch.pressedDash')),
    onRelease: () => status.setContent(i18next.t('volui:touch.released')),
  });
  disposables.push(fireButton, dashButton);

  wrap.appendChild(fireButton.element);
  wrap.appendChild(dashButton.element);
  wrap.appendChild(status.element);

  // TouchButton dokunmatiğe ÖZEL değildir: taşıdığı şey press/hold semantiği.
  // Klavye de aynı olayları üretir; showcase bunu görünür kılmalı, aksi hâlde
  // yetenek yalnızca testte var olur.
  const keyboardHint = new Text(i18next.t('volui:touch.touchButtonKeyboardHint'), {
    variant: 'muted',
  });
  disposables.push(keyboardHint);
  wrap.appendChild(keyboardHint.element);

  return wrap;
}

function buildDualAxisScrollDemo(disposables: Destroyable[]): HTMLElement {
  const panel = new DualAxisScrollPanel({ width: 320, height: 200 });
  disposables.push(panel);

  const grid = document.createElement('div');
  grid.className = 'vol-showcase-dual-scroll-grid';
  for (let i = 1; i <= 24; i++) {
    const cell = document.createElement('div');
    cell.className = 'vol-showcase-dual-scroll-cell';
    cell.textContent = String(i);
    grid.appendChild(cell);
  }
  panel.add({ element: grid });

  return panel.element;
}

/** PullToRefresh demosu: lider tablosu. Yukarıdan aşağı çek onRefresh tetikler, 900ms yapay bekleme sonra sıralama karışır. scrollTop > 0'da pasif. */
function buildPullToRefreshDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const list = document.createElement('div');
  list.className = 'vol-showcase-leaderboard';

  let names = [
    'Kaan',
    'Elif',
    'Aldric',
    'Meriel',
    'Toren',
    'Draven',
    'Sena',
    'Baran',
    'Nil',
    'Emir',
  ];

  const renderList = (): void => {
    list.replaceChildren();
    names.forEach((name, index) => {
      const row = document.createElement('div');
      row.className = 'vol-showcase-leaderboard__row';
      row.textContent = `${index + 1}. ${name}`;
      list.appendChild(row);
    });
  };
  renderList();

  const status = new Text(i18next.t('volui:touch.pullToRefreshHint'), { variant: 'muted' });
  disposables.push(status);

  const pullToRefresh = new PullToRefresh({
    content: list,
    label: i18next.t('volui:touch.refreshing'),
    onRefresh: async () => {
      status.setContent(i18next.t('volui:touch.updatingRanking'));
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      names = [...names].sort(() => Math.random() - 0.5);
      renderList();
      status.setContent(i18next.t('volui:touch.rankingUpdated'));
    },
  });
  disposables.push(pullToRefresh);
  pullToRefresh.element.style.height = '220px';

  wrap.appendChild(pullToRefresh.element);
  wrap.appendChild(status.element);

  return wrap;
}

/** SwipeableCardStack demosu: görev kabul/red, kaydırma veya butonla. onEmpty özet gösterir. */
function buildSwipeableCardStackDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const quests = [
    {
      id: 'q1',
      title: i18next.t('volui:touch.quest1Title'),
      desc: i18next.t('volui:touch.quest1Desc'),
    },
    {
      id: 'q2',
      title: i18next.t('volui:touch.quest2Title'),
      desc: i18next.t('volui:touch.quest2Desc'),
    },
    {
      id: 'q3',
      title: i18next.t('volui:touch.quest3Title'),
      desc: i18next.t('volui:touch.quest3Desc'),
    },
    {
      id: 'q4',
      title: i18next.t('volui:touch.quest4Title'),
      desc: i18next.t('volui:touch.quest4Desc'),
    },
  ];

  let accepted = 0;
  let rejected = 0;

  const result = new Text(i18next.t('volui:touch.swipeHint'), { variant: 'muted' });
  disposables.push(result);

  const cards = quests.map((q) => {
    const el = document.createElement('div');
    el.className = 'vol-showcase-quest-card';
    const title = new Text(q.title, { variant: 'body' });
    const desc = new Text(q.desc, { variant: 'muted' });
    disposables.push(title, desc);
    el.appendChild(title.element);
    el.appendChild(desc.element);
    return { id: q.id, element: el };
  });

  const stack = new SwipeableCardStack({
    cards,
    showActionButtons: true,
    onSwipe: (id, direction) => {
      const quest = quests.find((q) => q.id === id);
      if (direction === 'right') {
        accepted += 1;
        result.setContent(
          i18next.t('volui:touch.accepted', { title: quest?.title ?? '', accepted, rejected }),
        );
      } else {
        rejected += 1;
        result.setContent(
          i18next.t('volui:touch.rejected', { title: quest?.title ?? '', accepted, rejected }),
        );
      }
    },
    onEmpty: () => {
      result.setContent(i18next.t('volui:touch.allQuestsDone', { accepted, rejected }));
    },
  });
  disposables.push(stack);

  wrap.appendChild(stack.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** RadialMenu demosu: "Envanter" butonuna basılı tutarak 5 seçenekli radyal menü. Hızlı dokunuş bir şey seçmez. */
function buildRadialMenuDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  // card({ center: true }) panel-demo'yu kart içinde ortalar, çocuklarını değil — align-items:center gerekir.
  wrap.style.alignItems = 'center';

  const result = new Text(i18next.t('volui:touch.radialMenuHint'), {
    variant: 'muted',
  });
  disposables.push(result);

  const menu = new RadialMenu({
    items: [
      { id: 'sword', label: i18next.t('volui:touch.sword') },
      { id: 'shield', label: i18next.t('volui:touch.shield') },
      { id: 'potion', label: i18next.t('volui:touch.potion') },
      { id: 'bow', label: i18next.t('volui:touch.bow') },
      { id: 'scroll', label: i18next.t('volui:touch.scroll') },
    ],
    onSelect: (id) => {
      result.setContent(i18next.t('volui:touch.selected', { id }));
    },
  });
  disposables.push(menu);
  document.body.appendChild(menu.element);
  const menuElement = menu.element;

  const openButton = new TouchButton({
    shape: 'circle',
    label: i18next.t('volui:touch.inventory'),
    icon: svgIcon(ICON_INVENTORY),
    size: 72,
    onPress: () => {
      // TouchButton.onPress koordinat vermez, butonun merkezi kullanılır.
      const rect = openButton.element.getBoundingClientRect();
      menu.open(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
  });
  disposables.push(openButton);
  disposables.push({ destroy: () => menuElement.remove() });

  wrap.appendChild(openButton.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** ChargeButton demosu: basılı tutunca halka dolar. Erken bırakma yine sonuç üretir; tam dolum kritik vuruş tetikler. */
function buildChargeButtonDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  // Durum metni butonun altında — metin genişliği butonu kaydırmasın.
  const { element: statusRow, text: result } = buildStatusRow(i18next.t('volui:touch.chargeHint'));
  disposables.push(result);

  const chargeButton = new ChargeButton({
    label: i18next.t('volui:touch.hit'),
    chargeDurationMs: 1100,
    onChargeProgress: (progress) => {
      result.setContent(i18next.t('volui:touch.charging', { n: Math.round(progress * 100) }));
    },
    onCharged: () => {
      result.setContent(i18next.t('volui:touch.criticalHit'));
    },
    onRelease: (progress) => {
      if (progress >= 1) return;
      const strength =
        progress < 0.34
          ? i18next.t('volui:touch.weak')
          : progress < 0.7
          ? i18next.t('volui:touch.mediumStrength')
          : i18next.t('volui:touch.strong');
      result.setContent(
        i18next.t('volui:touch.strengthHit', { strength, n: Math.round(progress * 100) }),
      );
    },
  });
  disposables.push(chargeButton);

  wrap.appendChild(chargeButton.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** PinchZoomController demosu: küçük taktik harita. Masaüstünde tekerlek=zoom/sürükle=pan; dokunmatikte iki parmak=zoom/tek parmak=pan. */
function buildPinchZoomDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const zoomLabel = new Text(i18next.t('volui:touch.zoomPercent', { n: 100 }), {
    variant: 'muted',
  });
  disposables.push(zoomLabel);

  const map = document.createElement('div');
  map.className = 'vol-showcase-pinch-map';
  for (let i = 1; i <= 36; i++) {
    const cell = document.createElement('div');
    cell.className = 'vol-showcase-pinch-map__cell';
    cell.textContent = String(i);
    map.appendChild(cell);
  }

  const controller = new PinchZoomController({
    content: map,
    minZoom: 0.6,
    maxZoom: 2.5,
    onTransformChange: (zoom) => {
      zoomLabel.setContent(i18next.t('volui:touch.zoomPercent', { n: Math.round(zoom * 100) }));
    },
  });
  disposables.push(controller);
  controller.element.style.height = '260px';

  // TouchButton yerine Button: TouchButton etiketi aria-only, "Sıfırla" tek seferlik komut.
  const resetButton = new Button(i18next.t('volui:touch.reset'), {
    onClick: () => controller.reset(),
  });
  disposables.push(resetButton);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  controls.appendChild(resetButton.element);
  controls.appendChild(zoomLabel.element);

  wrap.appendChild(controller.element);
  wrap.appendChild(controls);

  return wrap;
}

/** SlotGrid demosu: 24 slot (6x4) envanter, sürüklenebilir 1x1/2x1/2x2 eşyalar. onSwapRequest true → 1x1 eşyalar yer değiştirebilir. */
function buildSlotGridDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:touch.slotGridHint'), {
    variant: 'muted',
  });
  disposables.push(result);

  const items: Record<number, SlotItem> = {
    0: { id: 'i1', label: i18next.t('volui:touch.sword'), rarity: 'rare' },
    2: { id: 'i2', label: i18next.t('volui:touch.shield'), rarity: 'common' },
    3: { id: 'i3', label: i18next.t('volui:touch.potion'), quantity: 5, rarity: 'common' },
    4: { id: 'i4', label: i18next.t('volui:touch.scroll'), quantity: 2, rarity: 'epic' },
    6: {
      id: 'i5',
      label: i18next.t('volui:touch.twoHandedSword'),
      rarity: 'epic',
      span: { cols: 2, rows: 1 },
    },
    9: { id: 'i6', label: i18next.t('volui:touch.arrow'), quantity: 24, rarity: 'common' },
    11: { id: 'i7', label: i18next.t('volui:touch.armor'), rarity: 'rare' },
    12: {
      id: 'i8',
      label: i18next.t('volui:touch.chest'),
      rarity: 'epic',
      span: { cols: 2, rows: 2 },
    },
  };

  const grid = new SlotGrid({
    slotCount: 24,
    columns: 6,
    items,
    onMove: (itemId, from, to) => {
      result.setContent(i18next.t('volui:touch.itemMoved', { itemId, from, to }));
    },
    onSwapRequest: () => true,
    onSlotClick: (item) => {
      result.setContent(
        i18next.t('volui:touch.itemDetail', { label: item.label, qty: item.quantity ?? 0 }),
      );
    },
  });
  disposables.push(grid);

  wrap.appendChild(grid.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Sabit yükseklikli durum satırı — metin değişince layout kaymaz. */
function buildStatusRow(initialText: string): {
  element: HTMLElement;
  text: InstanceType<typeof Text>;
} {
  const row = document.createElement('div');
  row.className = 'vol-showcase-status-row';
  const text = new Text(initialText, { variant: 'muted' });
  row.appendChild(text.element);
  return { element: row, text };
}

/** DPad demosu: dört yön bileşeni. Basılan yön buildStatusRow ile gösterilir. */
function buildDPadDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const { element: statusRow, text: status } = buildStatusRow(i18next.t('volui:touch.dpadHint'));
  disposables.push(status);

  const dpad = new DPad({
    onDirectionDown: (direction) =>
      status.setContent(i18next.t('volui:touch.pressedDir', { dir: direction })),
    onDirectionUp: () => status.setContent(i18next.t('volui:touch.dpadHint')),
  });
  disposables.push(dpad);

  wrap.appendChild(dpad.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** DirectionButton demosu ("Zıpla"): DPad ile sınıf paylaşsa da bağımsız aksiyon butonu. */
function buildJumpButtonDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const { element: statusRow, text: status } = buildStatusRow(i18next.t('volui:touch.holdHint'));
  disposables.push(status);

  const jumpButton = new DirectionButton({
    label: i18next.t('volui:touch.jump'),
    icon: svgIcon(ICON_JUMP),
    size: 68,
    onPress: () => status.setContent(i18next.t('volui:touch.jumping')),
    onRelease: () => status.setContent(i18next.t('volui:touch.holdHint')),
  });
  disposables.push(jumpButton);

  wrap.appendChild(jumpButton.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** DirectionButton demosu ("Eğil") — buildJumpButtonDemo ile aynı desen, ayrı kart. */
function buildCrouchButtonDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const { element: statusRow, text: status } = buildStatusRow(i18next.t('volui:touch.holdHint'));
  disposables.push(status);

  const crouchButton = new DirectionButton({
    label: i18next.t('volui:touch.crouch'),
    icon: svgIcon(ICON_CROUCH),
    size: 68,
    onPress: () => status.setContent(i18next.t('volui:touch.crouching')),
    onRelease: () => status.setContent(i18next.t('volui:touch.holdHint')),
  });
  disposables.push(crouchButton);

  wrap.appendChild(crouchButton.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** PauseResumeButton demosu: tek toggle buton. counter: { direction: 'up' } bileşenin kendi interval'ini yönetir. */
function buildPauseResumeDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-row__group';
  // vol-showcase-row__group'ün flex:1'i kartı doldurup ortalamayı bozar — flex:0 1 auto gerekir.
  wrap.style.flex = '0 1 auto';
  wrap.style.justifyContent = 'center';

  const status = new Text(i18next.t('volui:touch.simulationRunning'), { variant: 'muted' });
  disposables.push(status);

  const pauseResumeButton = new PauseResumeButton({
    size: 64,
    counter: { direction: 'up' },
    onToggle: (isRunning) => {
      status.setContent(
        isRunning
          ? i18next.t('volui:touch.simulationRunning')
          : i18next.t('volui:touch.simulationPaused'),
      );
    },
  });
  disposables.push(pauseResumeButton);

  wrap.appendChild(pauseResumeButton.element);
  wrap.appendChild(status.element);

  return wrap;
}

/** ActionBar demosu: sabit eylem çubuğu. "Kule İnşa Et" 3sn bekleme başlatır (rAF). shortcut 1/2/3 tuş eşleşmesi, görünür rozet yok. */
function buildActionBarDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  // Sabit yükseklikli durum satırı — metin değişimi ActionBar'ı kaydırmaz.
  const { element: _statusRow, text: result } = buildStatusRow(
    i18next.t('volui:touch.actionBarHint'),
  );
  disposables.push(result);

  const TOWER_COOLDOWN_SECONDS = 3;
  let towerCooldownEnd = 0;
  let rafHandle: number | null = null;

  const bar = new ActionBar({
    showLabels: true,
    enableKeyboardShortcuts: true,
    slots: [
      {
        id: 'tower',
        label: i18next.t('volui:touch.buildTower'),
        icon: svgIcon(ICON_TOWER),
        shortcut: '1',
      },
      {
        id: 'wave',
        label: i18next.t('volui:touch.startWave'),
        icon: svgIcon(ICON_WAVE),
        shortcut: '2',
      },
      {
        id: 'speed',
        label: i18next.t('volui:touch.speedX2'),
        icon: svgIcon(ICON_SPEED),
        shortcut: '3',
      },
    ],
    onActivate: (id) => {
      if (id === 'tower') {
        const now = performance.now();
        if (now < towerCooldownEnd) return;
        towerCooldownEnd = now + TOWER_COOLDOWN_SECONDS * 1000;
        result.setContent(i18next.t('volui:touch.towerBuilt', { n: TOWER_COOLDOWN_SECONDS }));
        tickCooldown();
      } else if (id === 'wave') {
        result.setContent(i18next.t('volui:touch.waveStarted'));
      } else {
        result.setContent(i18next.t('volui:touch.speedSetX2'));
      }
    },
  });
  disposables.push(bar);

  const tickCooldown = (): void => {
    const remaining = towerCooldownEnd - performance.now();
    const progress = Math.max(0, remaining / (TOWER_COOLDOWN_SECONDS * 1000));
    bar.setCooldown('tower', progress, TOWER_COOLDOWN_SECONDS);
    if (progress > 0) {
      rafHandle = requestAnimationFrame(tickCooldown);
    } else {
      rafHandle = null;
    }
  };
  disposables.push({
    destroy: () => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
    },
  });

  wrap.appendChild(bar.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** LongPressButton demosu: kısa dokunuş seçer (onTap), yarım saniye basılı tutma menü açar (onLongPress). Progress halkası 500ms'e dolar. */
function buildLongPressButtonDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  // Kısa ipucu — uzun metin iki satıra sarıp kartı komşularından uzun yapıyordu.
  const { element: statusRow, text: status } = buildStatusRow(
    i18next.t('volui:touch.longPressHint'),
  );
  disposables.push(status);

  // onRelease callback'indeki 1500ms'lik reset timeout'unun ID'si — sahne/sekme
  // değişiminde temizlenmezse destroyed status'a setContent çağrılır.
  let resetTimeoutId: number | null = null;

  const longPressButton = new LongPressButton({
    shape: 'square',
    label: i18next.t('volui:touch.inventoryItem'),
    icon: svgIcon(ICON_INVENTORY),
    size: 72,
    onTap: () => status.setContent(i18next.t('volui:touch.selectedItem')),
    onLongPress: () => status.setContent(i18next.t('volui:touch.contextMenuOpened')),
    onRelease: () => {
      // Kısa gecikme sonra ipucuna döner — demo tekrar denenebilsin.
      if (resetTimeoutId !== null) window.clearTimeout(resetTimeoutId);
      resetTimeoutId = window.setTimeout(() => {
        resetTimeoutId = null;
        status.setContent(i18next.t('volui:touch.longPressHint'));
      }, 1500);
    },
  });
  disposables.push(longPressButton);
  disposables.push({
    destroy: () => {
      if (resetTimeoutId !== null) {
        window.clearTimeout(resetTimeoutId);
        resetTimeoutId = null;
      }
    },
  });

  wrap.appendChild(longPressButton.element);
  wrap.appendChild(statusRow);

  return wrap;
}

/** SwipeGestureZone demosu: yön+mesafe+hız dedektörü (kart hareketi yok). onSwipeMove sürükleme sırasında canlı ipucu günceller. */
function buildSwipeGestureZoneDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const result = new Text(i18next.t('volui:touch.swipeZoneHint'), { variant: 'muted' });
  disposables.push(result);

  const surface = document.createElement('div');
  surface.className = 'vol-showcase-swipe-zone-surface';
  surface.textContent = '⇅ ⇄';

  const zone = new SwipeGestureZone({
    content: surface,
    size: { width: 220, height: 140 },
    onSwipeMove: (dx, dy) => {
      surface.style.transform = `translate(${Math.max(-16, Math.min(16, dx * 0.1))}px, ${Math.max(
        -16,
        Math.min(16, dy * 0.1),
      )}px)`;
    },
    onSwipe: (event) => {
      surface.style.transform = '';
      const dirKey = `volui:touch.dir_${event.direction}`;
      const directionLabel = i18n.tDynamic(dirKey);
      result.setContent(
        i18next.t('volui:touch.cameraPanned', {
          dir: directionLabel,
          distance: Math.round(event.distance),
          velocity: event.velocity.toFixed(2),
        }),
      );
    },
  });
  disposables.push(zone);

  wrap.appendChild(zone.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** MultiTouchZone demosu: N parmağı bağımsız izler, her biri pointerId ile ayrı nokta. */
function buildMultiTouchZoneDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const result = new Text(i18next.t('volui:touch.multiTouchHint'), { variant: 'muted' });
  disposables.push(result);

  const surface = document.createElement('div');
  surface.className = 'vol-showcase-multitouch-surface';

  const dots = new Map<number, HTMLDivElement>();

  const zone = new MultiTouchZone({
    content: surface,
    size: { width: 220, height: 140 },
    maxTouches: 5,
    onTouchStart: (point) => {
      const dot = document.createElement('div');
      dot.className = 'vol-showcase-multitouch-dot';
      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
      surface.appendChild(dot);
      dots.set(point.pointerId, dot);
      result.setContent(
        i18next.t('volui:touch.activeTouches', { n: zone.getActivePointerIds().length }),
      );
    },
    onTouchMove: (point) => {
      const dot = dots.get(point.pointerId);
      if (!dot) return;
      dot.style.left = `${point.x}px`;
      dot.style.top = `${point.y}px`;
    },
    onTouchEnd: (pointerId) => {
      dots.get(pointerId)?.remove();
      dots.delete(pointerId);
      result.setContent(
        i18next.t('volui:touch.activeTouches', { n: zone.getActivePointerIds().length }),
      );
    },
  });
  disposables.push(zone);

  wrap.appendChild(zone.element);
  wrap.appendChild(result.element);

  return wrap;
}

export function buildTouchTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    card(i18next.t('volui:touch.joystick'), buildJoystickDemo(disposables), { center: true }),
    card(i18next.t('volui:touch.squareJoystick'), buildSquareJoystickDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.touchButton'), buildTouchButtonDemo(disposables)),
    card(i18next.t('volui:touch.chargeButton'), buildChargeButtonDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.radialMenu'), buildRadialMenuDemo(disposables), { center: true }),
    card(i18next.t('volui:touch.dpad'), buildDPadDemo(disposables)),
    card(i18next.t('volui:touch.directionJump'), buildJumpButtonDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.directionCrouch'), buildCrouchButtonDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.pauseResume'), buildPauseResumeDemo(disposables), { center: true }),
    card(i18next.t('volui:touch.longPressButton'), buildLongPressButtonDemo(disposables), {
      center: true,
    }),

    // Action Bar/Dual-Axis Scroll doğal kart genişliğine uyar; span:2 boşluk ekler.
    card(i18next.t('volui:touch.actionBar'), buildActionBarDemo(disposables)),
    card(i18next.t('volui:touch.dualAxisScroll'), buildDualAxisScrollDemo(disposables)),

    // Geniş içerik span:2 — Forms'taki Timer Bar/Range Slider ile aynı mantık.
    card(i18next.t('volui:touch.pinchZoom'), buildPinchZoomDemo(disposables), { span: 2 }),
    card(i18next.t('volui:touch.pullToRefresh'), buildPullToRefreshDemo(disposables), { span: 2 }),
    card(i18next.t('volui:touch.slotGrid'), buildSlotGridDemo(disposables), { span: 2 }),

    card(i18next.t('volui:touch.swipeGestureZone'), buildSwipeGestureZoneDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.multiTouchZone'), buildMultiTouchZoneDemo(disposables), {
      center: true,
    }),
    card(i18next.t('volui:touch.swipeableCardStack'), buildSwipeableCardStackDemo(disposables), {
      spanAll: true,
    }),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
