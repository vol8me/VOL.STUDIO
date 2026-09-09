/**
 * ADVANCED sekmesinin VERİ ve YERLEŞİM kartları — ağaç, akordiyon, tablo,
 * sanallaştırma, olay günlüğü ve Kanban.
 *
 * Bölme gerekçesi boyut: sekme tek dosyada 1132 satıra çıkmıştı ve sert sınır
 * 1000'dir. Kurucular birbirini çağırmaz, yani ayrım bir bağımlılık değil bir
 * okuma kolaylığıdır (bkz. `hudPanelCards.ts` ile aynı desen).
 */
import type { DisposableScope } from '@volstudio/core/lifecycle';
import { Accordion, Button, DataTable, EventLog, Kanban, Text, Tree } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';

/** DialogueBox demosu: showControls:true ile dallı diyalog ve ileri saralama. */

export function buildTreeDemo(disposables: DisposableScope): HTMLElement {
  const tree = new Tree(
    [
      {
        id: 'weapons',
        label: i18next.t('volui:advanced.weapons'),
        expanded: true,
        children: [
          { id: 'pistol', label: i18next.t('volui:advanced.pistol') },
          { id: 'rifle', label: i18next.t('volui:advanced.rifle') },
        ],
      },
      {
        id: 'armor',
        label: i18next.t('volui:advanced.armor'),
        children: [
          { id: 'helmet', label: i18next.t('volui:advanced.helmet') },
          { id: 'vest', label: i18next.t('volui:advanced.vest') },
        ],
      },
      { id: 'consumables', label: i18next.t('volui:advanced.consumables') },
    ],
    { selectableFolders: true },
  );
  disposables.addDestroyables(tree);
  return tree.element;
}

export function buildAccordionDemo(disposables: DisposableScope): HTMLElement {
  const graphicsText = new Text(i18next.t('volui:advanced.graphicsDesc'), {
    variant: 'muted',
  });
  const audioText = new Text(i18next.t('volui:advanced.audioDesc'), {
    variant: 'muted',
  });
  const controlsText = new Text(i18next.t('volui:advanced.controlsDesc'), {
    variant: 'muted',
  });
  disposables.addDestroyables(graphicsText, audioText, controlsText);

  const graphics = document.createElement('div');
  graphics.appendChild(graphicsText.element);

  const audio = document.createElement('div');
  audio.appendChild(audioText.element);

  const controls = document.createElement('div');
  controls.appendChild(controlsText.element);

  const accordion = new Accordion(
    [
      {
        id: 'graphics',
        title: i18next.t('volui:advanced.graphics'),
        content: { element: graphics },
      },
      { id: 'audio', title: i18next.t('volui:advanced.audio'), content: { element: audio } },
      {
        id: 'controls',
        title: i18next.t('volui:advanced.controls'),
        content: { element: controls },
      },
    ],
    { defaultOpen: ['graphics'] },
  );
  disposables.addDestroyables(accordion);
  return accordion.element;
}

interface UnitRow {
  id: string;
  name: string;
  type: string;
  power: number;
  hp: number;
}

/** DataTable demosu: sıralanabilir sütunlar, seçilebilir satırlar. */

export function buildDataTableDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const unitRows: UnitRow[] = [
    {
      id: 'u1',
      name: i18next.t('volui:advanced.archerUnit'),
      type: i18next.t('volui:advanced.ranged'),
      power: 42,
      hp: 120,
    },
    {
      id: 'u2',
      name: i18next.t('volui:advanced.armoredKnight'),
      type: i18next.t('volui:advanced.melee'),
      power: 68,
      hp: 340,
    },
    {
      id: 'u3',
      name: i18next.t('volui:advanced.siegeTrebuchet'),
      type: i18next.t('volui:advanced.siege'),
      power: 95,
      hp: 80,
    },
    {
      id: 'u4',
      name: i18next.t('volui:advanced.healer'),
      type: i18next.t('volui:advanced.support'),
      power: 12,
      hp: 150,
    },
    {
      id: 'u5',
      name: i18next.t('volui:advanced.darkCavalry'),
      type: i18next.t('volui:advanced.melee'),
      power: 71,
      hp: 260,
    },
  ];

  const result = new Text(i18next.t('volui:advanced.clickUnitHint'), { variant: 'muted' });
  disposables.addDestroyables(result);

  const table = new DataTable<UnitRow>({
    columns: [
      { key: 'name', header: i18next.t('volui:advanced.unit') },
      { key: 'type', header: i18next.t('volui:advanced.type') },
      { key: 'power', header: i18next.t('volui:advanced.power'), align: 'right' },
      { key: 'hp', header: i18next.t('volui:advanced.hp'), align: 'right' },
    ],
    rows: unitRows,
    selectable: true,
    initialSort: { key: 'power', direction: 'desc' },
    onRowClick: (row) =>
      result.setContent(
        i18next.t('volui:advanced.selectedUnit', { name: row.name, power: row.power, hp: row.hp }),
      ),
  });
  disposables.addDestroyables(table);

  wrap.appendChild(table.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Pencerelemeli DataTable demosu için büyük veri seti. */

export function buildLargeUnitRows(count: number): UnitRow[] {
  const types = [
    i18next.t('volui:advanced.ranged'),
    i18next.t('volui:advanced.melee'),
    i18next.t('volui:advanced.siege'),
    i18next.t('volui:advanced.support'),
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `bulk-${i}`,
    name: i18next.t('volui:advanced.unitN', { n: i + 1 }),
    type: types[i % types.length],
    power: (i * 7) % 100,
    hp: 60 + ((i * 13) % 300),
  }));
}

/** Pencerelemeli DataTable: 5.000 satır, DOM'da yalnızca birkaç düzine. */

export function buildVirtualizedDataTableDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.virtualizedTableHint', { n: 5000 }), {
    variant: 'muted',
  });
  disposables.addDestroyables(result);

  const table = new DataTable<UnitRow>({
    columns: [
      { key: 'name', header: i18next.t('volui:advanced.unit') },
      { key: 'type', header: i18next.t('volui:advanced.type') },
      { key: 'power', header: i18next.t('volui:advanced.power'), align: 'right' },
      { key: 'hp', header: i18next.t('volui:advanced.hp'), align: 'right' },
    ],
    rows: buildLargeUnitRows(5000),
    selectable: true,
    virtualize: { rowHeight: 37, height: 260 },
    onRowClick: (row) =>
      result.setContent(
        i18next.t('volui:advanced.selectedUnitPower', { name: row.name, power: row.power }),
      ),
  });
  disposables.addDestroyables(table);

  wrap.appendChild(table.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Wizard demosu: karakter oluşturma. validate() sınıf seçilmeden ilerlemeyi engeller. "İleri Düzey" toggle 5 adıma çıkarır. */

export function buildEventLogDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const pinResult = new Text(i18next.t('volui:advanced.eventLogPinHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(pinResult);

  const eventLog = new EventLog({
    height: 220,
    showFilters: true,
    collapseDuplicates: true,
    pinnable: true,
    maxEntries: 80,
    onPinChange: (entry, pinned) => {
      pinResult.setContent(
        pinned
          ? i18next.t('volui:advanced.pinned', { text: entry.text })
          : i18next.t('volui:advanced.unpinned', { text: entry.text }),
      );
    },
  });
  disposables.addDestroyables(eventLog);

  const sampleEvents: {
    text: string;
    tone: 'default' | 'success' | 'warning' | 'danger' | 'info';
  }[] = [
    { text: i18next.t('volui:advanced.evtTowerBuilt'), tone: 'success' },
    { text: i18next.t('volui:advanced.evtWaveApproaching'), tone: 'warning' },
    { text: i18next.t('volui:advanced.evtBaseUnderAttack'), tone: 'danger' },
    { text: i18next.t('volui:advanced.evtResourceDiscovered'), tone: 'info' },
    { text: i18next.t('volui:advanced.evtWallRepaired'), tone: 'success' },
    { text: i18next.t('volui:advanced.evtEnergyLow'), tone: 'warning' },
    { text: i18next.t('volui:advanced.evtUnitLost'), tone: 'danger' },
    { text: i18next.t('volui:advanced.evtArrowHit'), tone: 'default' },
  ];
  let wave = 1;

  const formatNow = (): string => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  };

  const pushRandomEvent = (): void => {
    const sample = sampleEvents[Math.floor(Math.random() * sampleEvents.length)];
    eventLog.push({ text: sample.text, tone: sample.tone, timestamp: formatNow() });
  };

  const pushCriticalEvent = (): void => {
    eventLog.push({
      text: i18next.t('volui:advanced.evtBaseUnderAttack'),
      tone: 'danger',
      timestamp: formatNow(),
    });
  };

  eventLog.push({
    text: i18next.t('volui:advanced.waveStarted', { n: wave }),
    tone: 'info',
    timestamp: '00:00:00',
  });

  const pushButton = new Button(i18next.t('volui:advanced.randomEvent'), {
    onClick: () => pushRandomEvent(),
  });
  disposables.addDestroyables(pushButton);

  const criticalButton = new Button(i18next.t('volui:advanced.criticalAlert'), {
    variant: 'danger',
    onClick: () => pushCriticalEvent(),
  });
  disposables.addDestroyables(criticalButton);

  const nextWaveButton = new Button(i18next.t('volui:advanced.nextWave'), {
    onClick: () => {
      wave += 1;
      // Bilerek zamansız — hizalamanın bozulmadığını gösterir.
      eventLog.push({ text: i18next.t('volui:advanced.waveStarted', { n: wave }), tone: 'info' });
    },
  });
  disposables.addDestroyables(nextWaveButton);

  const clearButton = new Button(i18next.t('volui:advanced.clear'), {
    onClick: () => eventLog.clear(),
  });
  disposables.addDestroyables(clearButton);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  controls.appendChild(pushButton.element);
  controls.appendChild(criticalButton.element);
  controls.appendChild(nextWaveButton.element);
  controls.appendChild(clearButton.element);

  wrap.appendChild(eventLog.element);
  wrap.appendChild(controls);
  wrap.appendChild(pinResult.element);

  return wrap;
}

interface ProductionCard {
  id: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  assignee?: string;
}

/** Kanban demosu: 3 sütun, "Üretimde" WIP limiti 2. Aşarsa sütun kırmızı, drop reddedilir. searchable:true kart filtreler. */

export function buildKanbanDemo(
  disposables: DisposableScope,
  uiRootElement: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.kanbanHint'), { variant: 'muted' });
  disposables.addDestroyables(result);

  const cards: Record<string, ProductionCard[]> = {
    pending: [
      {
        id: 'p1',
        title: i18next.t('volui:advanced.armorPlate'),
        description: i18next.t('volui:advanced.armorPlateDesc'),
        priority: 'low',
        tags: [i18next.t('volui:advanced.tagArmor')],
        assignee: i18next.t('volui:advanced.orkSmith'),
      },
      {
        id: 'p2',
        title: i18next.t('volui:advanced.energyCell'),
        description: i18next.t('volui:advanced.energyCellDesc'),
        priority: 'high',
        tags: [i18next.t('volui:advanced.tagEnergy'), i18next.t('volui:advanced.tagUrgent')],
        assignee: i18next.t('volui:advanced.witchPriestess'),
      },
      {
        id: 'p3',
        title: i18next.t('volui:advanced.circuitBoard'),
        description: i18next.t('volui:advanced.circuitBoardDesc'),
        priority: 'medium',
        tags: [i18next.t('volui:advanced.tagElectronic')],
      },
    ],
    inProgress: [
      {
        id: 'p4',
        title: i18next.t('volui:advanced.engineBlock'),
        description: i18next.t('volui:advanced.engineBlockDesc'),
        priority: 'high',
        tags: [i18next.t('volui:advanced.tagMotor'), i18next.t('volui:advanced.tagUrgent')],
        assignee: i18next.t('volui:advanced.masterSmith'),
      },
    ],
    done: [
      {
        id: 'p5',
        title: i18next.t('volui:advanced.screwSet'),
        description: i18next.t('volui:advanced.completed'),
        priority: 'low',
        tags: [i18next.t('volui:advanced.tagSmallPart')],
      },
    ],
  };

  const kanban = new Kanban({
    searchable: true,
    dragContainer: uiRootElement,
    columns: [
      { id: 'pending', title: i18next.t('volui:advanced.colPending'), cards: cards.pending },
      {
        id: 'inProgress',
        title: i18next.t('volui:advanced.colInProgress'),
        cards: cards.inProgress,
        wipLimit: 2,
      },
      { id: 'done', title: i18next.t('volui:advanced.colDone'), cards: cards.done },
    ],
    onCardMove: (cardId, from, to) => {
      result.setContent(i18next.t('volui:advanced.cardMoved', { cardId, from, to }));
    },
    onWipLimitExceeded: (columnId) => {
      result.setContent(i18next.t('volui:advanced.wipLimitExceeded', { columnId }));
    },
    onCardClick: (card) => {
      const tagText = card.tags?.length ? ` [${card.tags.join(', ')}]` : '';
      const assigneeText = card.assignee ? ` — ${card.assignee}` : '';
      result.setContent(
        i18next.t('volui:advanced.cardDetail', {
          title: card.title,
          tags: tagText,
          assignee: assigneeText,
        }),
      );
    },
  });
  disposables.addDestroyables(kanban);

  wrap.appendChild(kanban.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Pencerelemeli Kanban: sütun başına 300 kart, DOM'da yalnızca görünenler. virtualizeCards sabit kart yüksekliği varsayar. */

export function buildVirtualizedKanbanDemo(
  disposables: DisposableScope,
  uiRootElement: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.virtualizedKanbanHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(result);

  const makeCards = (prefix: string, count: number): ProductionCard[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `${prefix}-${i}`,
      title: i18next.t('volui:advanced.kanbanJob', { prefix: prefix.toUpperCase(), n: i + 1 }),
    }));

  const kanban = new Kanban({
    virtualizeCards: { cardHeight: 46, bodyHeight: 300 },
    dragContainer: uiRootElement,
    columns: [
      { id: 'queue', title: i18next.t('volui:advanced.colQueue'), cards: makeCards('q', 300) },
      { id: 'active', title: i18next.t('volui:advanced.colActive'), cards: makeCards('a', 300) },
      { id: 'shipped', title: i18next.t('volui:advanced.colShipped'), cards: makeCards('s', 300) },
    ],
    onCardMove: (cardId, from, to, toIndex) => {
      result.setContent(
        i18next.t('volui:advanced.cardMovedIndexed', { cardId, to, index: toIndex + 1, from }),
      );
    },
  });
  disposables.addDestroyables(kanban);

  wrap.appendChild(kanban.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** RichTooltip demosu: silah kartında hover ile istatistik gösterimi. */
