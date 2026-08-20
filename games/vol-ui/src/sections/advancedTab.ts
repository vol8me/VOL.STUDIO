import {
  Accordion,
  Button,
  Checkbox,
  CommandPalette,
  DataTable,
  DialogueBox,
  EventLog,
  Kanban,
  RadioGroup,
  RichTooltip,
  SkillTree,
  resolveSkillStates,
  Text,
  Tree,
  Wizard,
  i18next,
} from '@volstudio/core';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

/** DialogueBox demosu: showControls:true ile dallı diyalog ve ileri saralama. */
function buildDialogueDemo(uiRootElement: HTMLElement, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const dialogue = new DialogueBox({ typeSpeedMs: 18, showControls: true });
  uiRootElement.appendChild(dialogue.element);
  disposables.push(dialogue);

  const decisions: string[] = [];
  const result = new Text(i18next.t('volui:advanced.dialogueHint'), {
    variant: 'muted',
  });
  disposables.push(result);

  const renderDecisions = (): void => {
    result.setContent(
      decisions.length
        ? i18next.t('volui:advanced.yourDecisions', { decisions: decisions.join(' → ') })
        : i18next.t('volui:advanced.dialogueHint'),
    );
  };

  const startButton = new Button(i18next.t('volui:advanced.startDialogue'), {
    variant: 'primary',
    onClick: () => {
      decisions.length = 0;
      renderDecisions();
      dialogue.show([
        {
          speaker: i18next.t('volui:advanced.oracle'),
          text: i18next.t('volui:advanced.dialogue1Text'),
        },
        {
          speaker: i18next.t('volui:advanced.oracle'),
          text: i18next.t('volui:advanced.dialogue2Text'),
          choices: [
            {
              label: i18next.t('volui:advanced.choiceYesRelease'),
              onSelect: () => {
                decisions.push(i18next.t('volui:advanced.decisionReleasedPower'));
                renderDecisions();
              },
            },
            {
              label: i18next.t('volui:advanced.choiceNoSleep'),
              onSelect: () => {
                decisions.push(i18next.t('volui:advanced.decisionDidNotAwaken'));
                renderDecisions();
              },
            },
          ],
        },
        {
          speaker: i18next.t('volui:advanced.oracle'),
          text: i18next.t('volui:advanced.dialogue3Text'),
          choices: [
            {
              label: i18next.t('volui:advanced.choiceGold'),
              onSelect: () => {
                decisions.push(i18next.t('volui:advanced.decisionPaidGold'));
                renderDecisions();
              },
            },
            {
              label: i18next.t('volui:advanced.choiceMemory'),
              onSelect: () => {
                decisions.push(i18next.t('volui:advanced.decisionSacrificedMemory'));
                renderDecisions();
              },
            },
          ],
        },
        {
          speaker: i18next.t('volui:advanced.oracle'),
          text: i18next.t('volui:advanced.dialogue4Text'),
        },
        {
          speaker: i18next.t('volui:advanced.you'),
          text: i18next.t('volui:advanced.dialogue5Text'),
        },
      ]);
    },
  });
  disposables.push(startButton);

  wrap.appendChild(startButton.element);
  wrap.appendChild(result.element);

  return wrap;
}

function buildTreeDemo(disposables: Destroyable[]): HTMLElement {
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
  disposables.push(tree);
  return tree.element;
}

function buildAccordionDemo(disposables: Destroyable[]): HTMLElement {
  const graphicsText = new Text(i18next.t('volui:advanced.graphicsDesc'), {
    variant: 'muted',
  });
  const audioText = new Text(i18next.t('volui:advanced.audioDesc'), {
    variant: 'muted',
  });
  const controlsText = new Text(i18next.t('volui:advanced.controlsDesc'), {
    variant: 'muted',
  });
  disposables.push(graphicsText, audioText, controlsText);

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
  disposables.push(accordion);
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
function buildDataTableDemo(disposables: Destroyable[]): HTMLElement {
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
  disposables.push(result);

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
  disposables.push(table);

  wrap.appendChild(table.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Pencerelemeli DataTable demosu için büyük veri seti. */
function buildLargeUnitRows(count: number): UnitRow[] {
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
function buildVirtualizedDataTableDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.virtualizedTableHint', { n: 5000 }), {
    variant: 'muted',
  });
  disposables.push(result);

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
  disposables.push(table);

  wrap.appendChild(table.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Wizard demosu: karakter oluşturma. validate() sınıf seçilmeden ilerlemeyi engeller. "İleri Düzey" toggle 5 adıma çıkarır. */
function buildWizardDemo(disposables: Destroyable[]): HTMLElement {
  let characterName = '';
  let characterClass = '';
  let characterAppearance = i18next.t('volui:advanced.appearanceClassic');
  let characterDifficulty = i18next.t('volui:advanced.difficultyNormal');
  let advancedSetup = false;

  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const advancedToggle = new Checkbox({
    label: i18next.t('volui:advanced.advancedSetupLabel'),
    checked: advancedSetup,
    onChange: (checked) => {
      advancedSetup = checked;
      mountWizard();
    },
  });
  disposables.push(advancedToggle);

  const wizardSlot = document.createElement('div');

  let currentWizard: Wizard | null = null;

  const mountWizard = (): void => {
    currentWizard?.destroy();

    const nameStep = document.createElement('div');
    const nameLabel = new Text(i18next.t('volui:advanced.charNameHint'), { variant: 'muted' });
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'vol-input';
    nameInput.placeholder = i18next.t('volui:advanced.charNamePlaceholder');
    nameInput.value = characterName;
    const onNameInput = (): void => {
      characterName = nameInput.value;
    };
    nameInput.addEventListener('input', onNameInput);
    disposables.push({
      destroy: () => nameInput.removeEventListener('input', onNameInput),
    });
    nameStep.appendChild(nameLabel.element);
    nameStep.appendChild(nameInput);

    const classStep = document.createElement('div');
    const classLabel = new Text(i18next.t('volui:advanced.classHint'), { variant: 'muted' });
    const classRadio = new RadioGroup({
      options: [
        { value: 'warrior', label: i18next.t('volui:advanced.warriorDesc') },
        { value: 'mage', label: i18next.t('volui:advanced.mageDesc') },
        { value: 'ranger', label: i18next.t('volui:advanced.rangerDesc') },
      ],
      value: characterClass || undefined,
      onChange: (value) => {
        characterClass = value;
      },
    });
    classStep.appendChild(classLabel.element);
    classStep.appendChild(classRadio.element);

    const appearanceStep = document.createElement('div');
    const appearanceLabel = new Text(i18next.t('volui:advanced.appearanceHint'), {
      variant: 'muted',
    });
    const appearanceRadio = new RadioGroup({
      options: [
        {
          value: i18next.t('volui:advanced.appearanceClassic'),
          label: i18next.t('volui:advanced.classicArmor'),
        },
        {
          value: i18next.t('volui:advanced.appearanceDark'),
          label: i18next.t('volui:advanced.darkCape'),
        },
        {
          value: i18next.t('volui:advanced.appearanceNature'),
          label: i18next.t('volui:advanced.natureAttire'),
        },
      ],
      value: characterAppearance,
      onChange: (value) => {
        characterAppearance = value;
      },
    });
    appearanceStep.appendChild(appearanceLabel.element);
    appearanceStep.appendChild(appearanceRadio.element);

    const difficultyStep = document.createElement('div');
    const difficultyLabel = new Text(i18next.t('volui:advanced.difficultyHint'), {
      variant: 'muted',
    });
    const difficultyRadio = new RadioGroup({
      options: [
        {
          value: i18next.t('volui:advanced.difficultyEasy'),
          label: i18next.t('volui:advanced.easyDesc'),
        },
        {
          value: i18next.t('volui:advanced.difficultyNormal'),
          label: i18next.t('volui:advanced.normalDesc'),
        },
        {
          value: i18next.t('volui:advanced.difficultyHard'),
          label: i18next.t('volui:advanced.hardDesc'),
        },
      ],
      value: characterDifficulty,
      onChange: (value) => {
        characterDifficulty = value;
      },
    });
    difficultyStep.appendChild(difficultyLabel.element);
    difficultyStep.appendChild(difficultyRadio.element);

    const summaryStep = document.createElement('div');
    const summaryText = new Text('', { variant: 'body' });
    summaryStep.appendChild(summaryText.element);

    const classDisplayName = (value: string): string =>
      value === 'warrior'
        ? i18next.t('volui:advanced.warrior')
        : value === 'mage'
        ? i18next.t('volui:advanced.mage')
        : value === 'ranger'
        ? i18next.t('volui:advanced.ranger')
        : i18next.t('volui:advanced.notSelected');

    const buildSummary = (): string => {
      const base = i18next.t('volui:advanced.summaryBase', {
        name: characterName || i18next.t('volui:advanced.namelessHero'),
        class: classDisplayName(characterClass),
      });
      return advancedSetup
        ? i18next.t('volui:advanced.summaryAdvanced', {
            base,
            appearance: characterAppearance,
            difficulty: characterDifficulty,
          })
        : i18next.t('volui:advanced.summarySimple', { base });
    };

    const steps = [
      { id: 'name', title: i18next.t('volui:advanced.stepName'), content: { element: nameStep } },
      {
        id: 'class',
        title: i18next.t('volui:advanced.stepClass'),
        content: { element: classStep },
        validate: () => {
          if (!characterClass) {
            classLabel.setContent(i18next.t('volui:advanced.selectClassWarning'));
            return false;
          }
          return true;
        },
      },
      ...(advancedSetup
        ? [
            {
              id: 'appearance',
              title: i18next.t('volui:advanced.stepAppearance'),
              content: { element: appearanceStep },
            },
            {
              id: 'difficulty',
              title: i18next.t('volui:advanced.stepDifficulty'),
              content: { element: difficultyStep },
            },
          ]
        : []),
      {
        id: 'summary',
        title: i18next.t('volui:advanced.stepSummary'),
        content: { element: summaryStep },
      },
    ];

    currentWizard = new Wizard({
      steps,
      finishLabel: i18next.t('volui:advanced.createCharacter'),
      onStepChange: (index) => {
        if (index === steps.length - 1) {
          summaryText.setContent(buildSummary());
        }
      },
      onFinish: () => {
        summaryText.setContent(
          i18next.t('volui:advanced.adventureBegins', { summary: buildSummary() }),
        );
      },
    });

    wizardSlot.replaceChildren(currentWizard.element);
  };

  mountWizard();

  disposables.push({
    destroy: () => currentWizard?.destroy(),
  });

  wrap.appendChild(advancedToggle.element);
  wrap.appendChild(wizardSlot);

  return wrap;
}

/** CommandPalette demosu: butonla açılır, kısayol tüketiciye bırakılmıştır. Yazarken fuzzy çoklu-kelime eşleşmesi, kategoriye göre gruplanır. */
function buildCommandPaletteDemo(
  uiRootElement: HTMLElement,
  disposables: Destroyable[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.awaitingCommand'), { variant: 'muted' });
  disposables.push(result);

  const palette = new CommandPalette({
    placeholder: i18next.t('volui:advanced.commandPlaceholder'),
    noMatchText: i18next.t('volui:advanced.noMatchText'),
  });
  uiRootElement.appendChild(palette.element);
  disposables.push(palette);

  palette.setItems([
    {
      id: 'build-turret',
      label: i18next.t('volui:advanced.cmdBuildTurret'),
      description: i18next.t('volui:advanced.cmdBuildTurretDesc'),
      category: i18next.t('volui:advanced.catBuild'),
      shortcut: 'Q',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdBuildTurret'),
          }),
        ),
    },
    {
      id: 'build-wall',
      label: i18next.t('volui:advanced.cmdBuildWall'),
      description: i18next.t('volui:advanced.cmdBuildWallDesc'),
      category: i18next.t('volui:advanced.catBuild'),
      shortcut: 'W',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdBuildWall'),
          }),
        ),
    },
    {
      id: 'build-barracks',
      label: i18next.t('volui:advanced.cmdBuildBarracks'),
      description: i18next.t('volui:advanced.cmdBuildBarracksDesc'),
      category: i18next.t('volui:advanced.catBuild'),
      shortcut: 'E',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdBuildBarracks'),
          }),
        ),
    },
    {
      id: 'camera-center',
      label: i18next.t('volui:advanced.cmdCameraCenter'),
      description: i18next.t('volui:advanced.cmdCameraCenterDesc'),
      category: i18next.t('volui:advanced.catCamera'),
      shortcut: 'Home',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdCameraCenter'),
          }),
        ),
    },
    {
      id: 'camera-follow',
      label: i18next.t('volui:advanced.cmdCameraFollow'),
      description: i18next.t('volui:advanced.cmdCameraFollowDesc'),
      category: i18next.t('volui:advanced.catCamera'),
      shortcut: 'F',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdCameraFollow'),
          }),
        ),
    },
    {
      id: 'start-wave',
      label: i18next.t('volui:advanced.cmdStartWave'),
      description: i18next.t('volui:advanced.cmdStartWaveDesc'),
      category: i18next.t('volui:advanced.catSystem'),
      shortcut: 'N',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdStartWave'),
          }),
        ),
    },
    {
      id: 'toggle-pause',
      label: i18next.t('volui:advanced.cmdTogglePause'),
      description: i18next.t('volui:advanced.cmdTogglePauseDesc'),
      category: i18next.t('volui:advanced.catSystem'),
      shortcut: i18next.t('volui:advanced.keySpace'),
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdTogglePause'),
          }),
        ),
    },
    {
      id: 'open-settings',
      label: i18next.t('volui:advanced.cmdOpenSettings'),
      description: i18next.t('volui:advanced.cmdOpenSettingsDesc'),
      category: i18next.t('volui:advanced.catSystem'),
      shortcut: 'Esc',
      onSelect: () =>
        result.setContent(
          i18next.t('volui:advanced.cmdExecuted', {
            cmd: i18next.t('volui:advanced.cmdOpenSettings'),
          }),
        ),
    },
  ]);

  const openButton = new Button(i18next.t('volui:advanced.commandPalette'), {
    variant: 'primary',
    onClick: () => palette.open(),
  });
  disposables.push(openButton);

  wrap.appendChild(openButton.element);
  wrap.appendChild(result.element);

  return wrap;
}

/**
 * SkillTree demosu: üç dallı beceri ağacı, tooltip'li, zoom/pan destekli.
 *
 * Kilit açma KURALI burada, bileşende değil: `onNodeClick` yalnızca niyeti
 * bildirir, puan kontrolü ve durum güncellemesi çağıranın işidir. Klasik
 * "tüm önkoşullar açık olmalı" kuralı için CORE'un opsiyonel
 * `resolveSkillStates` tarifi kullanılır.
 */
function buildSkillTreeDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  let skillPoints = 5;
  const pointsText = new Text(i18next.t('volui:advanced.skillPoints', { n: skillPoints }), {
    variant: 'body',
  });
  disposables.push(pointsText);

  const costs: Record<string, number> = {
    atk1: 1,
    atk2: 2,
    def1: 1,
    def2: 2,
    sup1: 1,
    sup2: 3,
  };

  const unlockedIds = new Set<string>(['root']);

  const skillTree = new SkillTree({
    showTooltips: true,
    zoomable: true,
    nodes: [
      { id: 'root', label: i18next.t('volui:advanced.basicTraining'), x: 2, y: 0 },
      {
        id: 'atk1',
        label: i18next.t('volui:advanced.swordMastery'),
        x: 0,
        y: 1,
        requires: ['root'],
        branch: 'primary',
        description: i18next.t('volui:advanced.swordMasteryDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.atk1 }],
      },
      {
        id: 'atk2',
        label: i18next.t('volui:advanced.deadlyStrike'),
        x: 0,
        y: 2,
        requires: ['atk1'],
        branch: 'primary',
        description: i18next.t('volui:advanced.deadlyStrikeDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.atk2 }],
      },
      {
        id: 'def1',
        label: i18next.t('volui:advanced.shieldMastery'),
        x: 2,
        y: 1,
        requires: ['root'],
        branch: 'support',
        description: i18next.t('volui:advanced.shieldMasteryDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.def1 }],
      },
      {
        id: 'def2',
        label: i18next.t('volui:advanced.ironStance'),
        x: 2,
        y: 2,
        requires: ['def1'],
        branch: 'support',
        description: i18next.t('volui:advanced.ironStanceDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.def2 }],
      },
      {
        id: 'sup1',
        label: i18next.t('volui:advanced.potionKnowledge'),
        x: 4,
        y: 1,
        requires: ['root'],
        branch: 'accent',
        description: i18next.t('volui:advanced.potionKnowledgeDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.sup1 }],
      },
      {
        id: 'sup2',
        label: i18next.t('volui:advanced.fastRecovery'),
        x: 4,
        y: 2,
        requires: ['sup1', 'def1'],
        branch: 'accent',
        description: i18next.t('volui:advanced.fastRecoveryDesc'),
        cost: [{ label: i18next.t('volui:advanced.skillPointCost'), amount: costs.sup2 }],
      },
    ],
    // Bileşen hiçbir şey açmaz, yalnızca NİYET bildirir. Maliyet kontrolü,
    // puan düşme ve durum güncellemesi tamamen burada — CORE bir oyunun
    // beceri ağacının nasıl açıldığına karar vermez.
    onNodeClick: (id, state) => {
      if (state !== 'available') return;
      const cost = costs[id] ?? 1;
      if (skillPoints < cost) return;

      skillPoints -= cost;
      unlockedIds.add(id);
      pointsText.setContent(i18next.t('volui:advanced.skillPoints', { n: skillPoints }));
      skillTree.setStates(resolveSkillStates(skillTree.getNodes(), unlockedIds));
    },
  });
  disposables.push(skillTree);

  // `resolveSkillStates` CORE'un OPSİYONEL tarifi: klasik "tüm önkoşullar
  // açık olmalı" kuralı. Farklı bir kural isteyen oyun kendi eşlemesini yazar.
  skillTree.setStates(resolveSkillStates(skillTree.getNodes(), unlockedIds));
  skillTree.element.style.height = '360px';

  const resetButton = new Button(i18next.t('volui:advanced.resetView'), {
    onClick: () => skillTree.resetView(),
  });
  disposables.push(resetButton);

  wrap.appendChild(pointsText.element);
  wrap.appendChild(skillTree.element);
  wrap.appendChild(resetButton.element);

  return wrap;
}

/** EventLog demosu: filtreler, yinelenenleri birleştirme (×N) ve satır sabitleme. "Sonraki Dalga" bilerek zamansız eklenir — hizalama bozulmaz. */
function buildEventLogDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const pinResult = new Text(i18next.t('volui:advanced.eventLogPinHint'), {
    variant: 'muted',
  });
  disposables.push(pinResult);

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
  disposables.push(eventLog);

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
  disposables.push(pushButton);

  const criticalButton = new Button(i18next.t('volui:advanced.criticalAlert'), {
    variant: 'danger',
    onClick: () => pushCriticalEvent(),
  });
  disposables.push(criticalButton);

  const nextWaveButton = new Button(i18next.t('volui:advanced.nextWave'), {
    onClick: () => {
      wave += 1;
      // Bilerek zamansız — hizalamanın bozulmadığını gösterir.
      eventLog.push({ text: i18next.t('volui:advanced.waveStarted', { n: wave }), tone: 'info' });
    },
  });
  disposables.push(nextWaveButton);

  const clearButton = new Button(i18next.t('volui:advanced.clear'), {
    onClick: () => eventLog.clear(),
  });
  disposables.push(clearButton);

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
function buildKanbanDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.kanbanHint'), { variant: 'muted' });
  disposables.push(result);

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
  disposables.push(kanban);

  wrap.appendChild(kanban.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** Pencerelemeli Kanban: sütun başına 300 kart, DOM'da yalnızca görünenler. virtualizeCards sabit kart yüksekliği varsayar. */
function buildVirtualizedKanbanDemo(
  disposables: Destroyable[],
  uiRootElement: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.virtualizedKanbanHint'), {
    variant: 'muted',
  });
  disposables.push(result);

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
  disposables.push(kanban);

  wrap.appendChild(kanban.element);
  wrap.appendChild(result.element);

  return wrap;
}

/** RichTooltip demosu: silah kartında hover ile istatistik gösterimi. */
function buildRichTooltipDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const itemCard = document.createElement('div');
  itemCard.style.display = 'flex';
  itemCard.style.flexDirection = 'column';
  itemCard.style.gap = 'var(--vol-space-sm)';
  itemCard.style.padding = 'var(--vol-space-md)';
  itemCard.style.background = 'var(--vol-ui-surface-2)';
  itemCard.style.border = '1px solid var(--vol-ui-border-soft)';
  itemCard.style.borderRadius = 'var(--vol-radius-md)';
  itemCard.style.cursor = 'help';

  const itemName = new Text(i18next.t('volui:advanced.flameSword'), { variant: 'heading' });
  disposables.push(itemName);
  itemCard.appendChild(itemName.element);

  const itemDesc = new Text(i18next.t('volui:advanced.hoverForStats'), { variant: 'muted' });
  disposables.push(itemDesc);
  itemCard.appendChild(itemDesc.element);

  wrap.appendChild(itemCard);

  const tooltip = new RichTooltip(
    itemCard,
    {
      title: i18next.t('volui:advanced.flameSword'),
      description: i18next.t('volui:advanced.flameSwordDesc'),
      stats: [
        { label: i18next.t('volui:advanced.statDamage'), value: '42', tone: 'danger' },
        { label: i18next.t('volui:advanced.statRange'), value: '4' },
        { label: i18next.t('volui:advanced.statFireDamage'), value: '+8/s', tone: 'warning' },
        { label: i18next.t('volui:advanced.statDurability'), value: '120/120', tone: 'success' },
      ],
    },
    { placement: 'top', container: uiRootElement },
  );
  disposables.push({ destroy: () => tooltip.destroy() });

  return wrap;
}

export function buildAdvancedTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    card(i18next.t('volui:advanced.dialogue'), buildDialogueDemo(uiRootElement, disposables)),
    card(i18next.t('volui:advanced.richTooltip'), buildRichTooltipDemo(disposables, uiRootElement)),
    card(i18next.t('volui:advanced.tree'), buildTreeDemo(disposables)),
    card(
      i18next.t('volui:advanced.commandPalette'),
      buildCommandPaletteDemo(uiRootElement, disposables),
    ),
    card(i18next.t('volui:advanced.accordion'), buildAccordionDemo(disposables), { span: 2 }),
    card(i18next.t('volui:advanced.dataTable'), buildDataTableDemo(disposables), { span: 2 }),
    card(
      i18next.t('volui:advanced.dataTableVirtualized'),
      buildVirtualizedDataTableDemo(disposables),
      {
        span: 2,
      },
    ),
    card(i18next.t('volui:advanced.wizard'), buildWizardDemo(disposables), { span: 2 }),
    card(i18next.t('volui:advanced.skillTree'), buildSkillTreeDemo(disposables), { spanAll: true }),
    card(i18next.t('volui:advanced.eventLog'), buildEventLogDemo(disposables), { spanAll: true }),
    card(i18next.t('volui:advanced.kanban'), buildKanbanDemo(disposables, uiRootElement), {
      spanAll: true,
    }),
    card(
      i18next.t('volui:advanced.kanbanVirtualized'),
      buildVirtualizedKanbanDemo(disposables, uiRootElement),
      {
        spanAll: true,
      },
    ),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
