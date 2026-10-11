/**
 * BuildMenu kartı (UI-08.3): gerçek bina ikonları, kaynak yetersizliği (host kararı), uzun 6 haneli fiyat, balon + klavye
 * gezinmesi ve RTS bağlamsal imleç (UI-01.9). Kaynak defteri sunum katmanında DEĞİL burada, demo kodundadır: BuildMenu yalnız
 * host'un verdiği "kullanılamaz + neden" bilgisini gösterir.
 */
import type { DisposableScope } from '@volstudio/core/lifecycle';
import {
  CursorController,
  SegmentedControl,
  Text,
  rtsCursorFor,
  BuildMenu,
  type BuildMenuItem,
  type IconName,
  type RtsContext,
} from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { card, svgIcon } from './shared';
import { intentProbe } from './intentProbe';

type Resource = 'gold' | 'wood';

interface BuildSpec {
  id: string;
  icon: IconName;
  hotkey: string;
  price: number;
  resource: Resource;
  /** Teknoloji ağacı gereği kalıcı kapalı (neden verilmez: `disabled`). */
  disabled?: boolean;
}

/** Bina ikonları kataloğun gerçek bina setidir (`BUILDING_ICONS`). */
const BUILD_SPECS: readonly BuildSpec[] = [
  {
    id: 'turret',
    icon: 'archerTower',
    hotkey: 'Q',
    price: 50,
    resource: 'gold',
  },
  {
    id: 'wall',
    icon: 'wall',
    hotkey: 'W',
    price: 20,
    resource: 'wood',
  },
  {
    id: 'barracks',
    icon: 'barracks',
    hotkey: 'E',
    price: 100,
    resource: 'gold',
    disabled: true,
  },
  {
    id: 'fire-tower',
    icon: 'fireTower',
    hotkey: 'R',
    price: 75,
    resource: 'gold',
  },
  {
    id: 'watchtower',
    icon: 'watchtower',
    hotkey: 'T',
    price: 60,
    resource: 'wood',
  },
  {
    id: 'guard-tower',
    icon: 'guardTower',
    hotkey: 'Y',
    price: 120,
    resource: 'gold',
    disabled: true,
  },
  {
    id: 'healing-well',
    icon: 'well',
    hotkey: 'U',
    price: 60,
    resource: 'gold',
  },
  {
    id: 'ballista',
    icon: 'ballista',
    hotkey: 'I',
    price: 100,
    resource: 'gold',
  },
  {
    id: 'cannon',
    icon: 'cannon',
    hotkey: 'O',
    price: 120,
    resource: 'gold',
  },
  {
    id: 'observatory',
    icon: 'observatory',
    hotkey: 'P',
    price: 80,
    resource: 'gold',
  },
  {
    id: 'gate',
    icon: 'gate',
    hotkey: 'A',
    price: 50,
    resource: 'wood',
  },
  {
    id: 'farm',
    icon: 'farm',
    hotkey: 'S',
    price: 30,
    resource: 'wood',
  },
  {
    id: 'lumber-mill',
    icon: 'lumberMill',
    hotkey: 'D',
    price: 40,
    resource: 'wood',
  },
  {
    id: 'market',
    icon: 'market',
    hotkey: 'F',
    price: 100,
    resource: 'gold',
    disabled: true,
  },
  {
    id: 'shrine',
    icon: 'shrine',
    hotkey: 'G',
    price: 150,
    resource: 'gold',
  },
  {
    id: 'stable',
    icon: 'stable',
    hotkey: 'H',
    price: 80,
    resource: 'gold',
  },
  {
    id: 'siege-workshop',
    icon: 'siegeWorkshop',
    hotkey: 'J',
    price: 120,
    resource: 'gold',
  },
  {
    id: 'mage-tower',
    icon: 'mageTower',
    hotkey: 'K',
    price: 150,
    resource: 'gold',
  },
  {
    id: 'bunker',
    icon: 'bunker',
    hotkey: 'L',
    price: 90,
    resource: 'gold',
  },
  {
    id: 'lighthouse',
    icon: 'lighthouse',
    hotkey: ';',
    price: 110,
    resource: 'gold',
    disabled: true,
  },
  // Uzun fiyat: 6 haneli tutar maliyet satırında kutuyu ve kısayol rozetini taşırmamalı.
  {
    id: 'castle',
    icon: 'castle',
    hotkey: 'Z',
    price: 123456,
    resource: 'gold',
  },
];

/**
 * Ad ve maliyet metinleri çeviriden, DEĞİŞMEZ anahtarlarla (kullanılmayan/eksik anahtar kapısı görebilsin); kart dil değişince
 * yeniden kurulduğundan çağrı anında çevrilir.
 */
function buildTexts(): Record<string, { label: string; cost: string }> {
  return {
    turret: {
      label: i18next.t('volui:hud.arrowTower'),
      cost: i18next.t('volui:hud.cost50Gold'),
    },
    wall: {
      label: i18next.t('volui:hud.wall'),
      cost: i18next.t('volui:hud.cost20Wood'),
    },
    barracks: {
      label: i18next.t('volui:hud.barracks'),
      cost: i18next.t('volui:hud.cost100Gold'),
    },
    'fire-tower': {
      label: i18next.t('volui:hud.fireTower'),
      cost: i18next.t('volui:hud.cost75Gold'),
    },
    watchtower: {
      label: i18next.t('volui:hud.watchtower'),
      cost: i18next.t('volui:hud.cost60Wood'),
    },
    'guard-tower': {
      label: i18next.t('volui:hud.guardTower'),
      cost: i18next.t('volui:hud.cost120Gold'),
    },
    'healing-well': {
      label: i18next.t('volui:hud.healingWell'),
      cost: i18next.t('volui:hud.cost60Gold'),
    },
    ballista: {
      label: i18next.t('volui:hud.ballista'),
      cost: i18next.t('volui:hud.cost100Gold'),
    },
    cannon: {
      label: i18next.t('volui:hud.cannon'),
      cost: i18next.t('volui:hud.cost120Gold'),
    },
    observatory: {
      label: i18next.t('volui:hud.observatory'),
      cost: i18next.t('volui:hud.cost80Gold'),
    },
    gate: {
      label: i18next.t('volui:hud.gate'),
      cost: i18next.t('volui:hud.cost50Wood'),
    },
    farm: {
      label: i18next.t('volui:hud.farm'),
      cost: i18next.t('volui:hud.cost30Wood'),
    },
    'lumber-mill': {
      label: i18next.t('volui:hud.lumberMill'),
      cost: i18next.t('volui:hud.cost40Wood'),
    },
    market: {
      label: i18next.t('volui:hud.market'),
      cost: i18next.t('volui:hud.cost100Gold'),
    },
    shrine: {
      label: i18next.t('volui:hud.shrine'),
      cost: i18next.t('volui:hud.cost150Gold'),
    },
    stable: {
      label: i18next.t('volui:hud.stable'),
      cost: i18next.t('volui:hud.cost80Gold'),
    },
    'siege-workshop': {
      label: i18next.t('volui:hud.siegeWorkshop'),
      cost: i18next.t('volui:hud.cost120Gold'),
    },
    'mage-tower': {
      label: i18next.t('volui:hud.mageTower'),
      cost: i18next.t('volui:hud.cost150Gold'),
    },
    bunker: {
      label: i18next.t('volui:hud.bunker'),
      cost: i18next.t('volui:hud.cost90Gold'),
    },
    lighthouse: {
      label: i18next.t('volui:hud.lighthouse'),
      cost: i18next.t('volui:hud.cost110Gold'),
    },
    castle: {
      label: i18next.t('volui:hud.castle'),
      cost: i18next.t('volui:hud.costLongGold'),
    },
  };
}

/** Kaynak durumu host'un kararıdır: kıt kaynakta pahalı yapılar "yetersiz" olur, bol kaynakta hepsi açılır. */
const STOCK: Record<'scarce' | 'plenty', Record<Resource, number>> = {
  scarce: { gold: 90, wood: 35 },
  plenty: { gold: 999999, wood: 999999 },
};

/** Zemin: üzerinde inşa seçiliyken imleç `build`, su bölgesinde `blocked` olur; seçim yokken `idle`. */
function buildGround(
  disposables: DisposableScope,
  onPlace: () => void,
  onBlockedPlace: () => void,
): { elements: HTMLElement[]; setPlacing: (placing: boolean) => void } {
  const arena = document.createElement('div');
  arena.className = 'vol-showcase-arena vol-showcase-arena--build';
  arena.dataset.arena = 'build';
  const water = document.createElement('div');
  water.className = 'vol-showcase-arena__thing vol-showcase-arena__thing--blocked';
  water.dataset.ctx = 'blocked';
  water.style.left = '62%';
  water.style.top = '18%';
  water.style.width = '30%';
  water.style.height = '56%';
  water.textContent = i18next.t('volui:hud.water');
  arena.appendChild(water);

  const controller = new CursorController({ chrome: false, mode: 'rts', target: arena });
  disposables.add(controller);
  const readout = document.createElement('div');
  readout.className = 'vol-showcase-ses__readout';
  readout.dataset.probe = 'build-cursor';

  let placing = false;
  const update = (context: RtsContext): void => {
    controller.setContext(context);
    const choice = rtsCursorFor(context);
    readout.textContent = i18next.t('volui:hud.cursorState', { state: context, cursor: choice.id });
    readout.dataset.value = `${context}/${choice.id}`;
  };
  const contextAt = (event: PointerEvent): RtsContext => {
    if (!placing) return 'idle';
    return (event.target as HTMLElement).closest('[data-ctx="blocked"]') ? 'blocked' : 'build';
  };
  disposables.addListener(arena, 'pointermove', (event) =>
    update(contextAt(event as PointerEvent)),
  );
  disposables.addListener(arena, 'pointerleave', () => update('idle'));
  disposables.addListener(arena, 'click', (event) => {
    if (!placing) return;
    if (contextAt(event as PointerEvent) === 'blocked') onBlockedPlace();
    else onPlace();
  });
  update('idle');

  return {
    elements: [arena, readout],
    setPlacing: (next) => {
      placing = next;
      update(next ? 'build' : 'idle');
    },
  };
}

/** BuildMenu: RTS/TD inşa menüsü — ikon+ad+maliyet+kısayol ızgarası, kaynak yetersizliği nedeni, balon ve RTS imleci. */
export function buildBuildMenuCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:hud.awaitingSelection'), { variant: 'muted' });
  disposables.addDestroyables(result);

  let stock = STOCK.scarce;
  let selectedName = '';
  const texts = buildTexts();
  const nameOf = (spec: BuildSpec): string => texts[spec.id].label;
  const reasonFor = (spec: BuildSpec): string | null =>
    spec.price > stock[spec.resource]
      ? i18next.t('volui:hud.notEnough', { resource: i18n.tDynamic(`volui:hud.${spec.resource}`) })
      : null;

  const items: BuildMenuItem[] = BUILD_SPECS.map((spec) => ({
    id: spec.id,
    icon: svgIcon(spec.icon),
    label: nameOf(spec),
    cost: texts[spec.id].cost,
    hotkey: spec.hotkey,
    disabled: spec.disabled,
    unavailableReason: spec.disabled ? undefined : (reasonFor(spec) ?? undefined),
    onSelect: () => {
      selectedName = nameOf(spec);
      result.setContent(i18next.t('volui:hud.selected', { name: selectedName }));
      ground.setPlacing(true);
    },
    onDeselect: () => {
      result.setContent(i18next.t('volui:hud.selectionCancelled'));
      ground.setPlacing(false);
    },
  }));

  const buildMenu = new BuildMenu({
    items,
    showTooltips: true,
    onBlocked: (id, reason) => {
      const spec = BUILD_SPECS.find((candidate) => candidate.id === id);
      result.setContent(`${spec ? nameOf(spec) : id}: ${reason}`);
    },
  });
  disposables.addDestroyables(buildMenu);

  const ground = buildGround(
    disposables,
    () => {
      result.setContent(i18next.t('volui:hud.placed', { name: selectedName }));
      buildMenu.clearSelection();
      ground.setPlacing(false);
    },
    () => result.setContent(i18next.t('volui:hud.placeBlocked')),
  );

  const stockControl = new SegmentedControl({
    ariaLabel: i18next.t('volui:hud.resourcesLabel'),
    value: 'scarce',
    options: [
      { value: 'scarce', label: i18next.t('volui:hud.resourcesScarce') },
      { value: 'plenty', label: i18next.t('volui:hud.resourcesPlenty') },
    ],
    onCommit: (value) => {
      stock = STOCK[value as 'scarce' | 'plenty'];
      // Kaynak değişince host nedenleri yeniden hesaplar; seçili öğe yetersiz kaldıysa seçim sessizce bırakılır.
      for (const spec of BUILD_SPECS) {
        if (!spec.disabled) buildMenu.setItemUnavailable(spec.id, reasonFor(spec));
      }
    },
  });
  disposables.addDestroyables(stockControl);

  const probe = intentProbe(wrap, disposables);
  const hint = new Text(i18next.t('volui:hud.placeHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);

  wrap.append(
    stockControl.element,
    buildMenu.element,
    result.element,
    hint.element,
    ...ground.elements,
    probe,
  );
  return card(i18next.t('volui:hud.buildMenu'), wrap, { spanAll: true });
}
