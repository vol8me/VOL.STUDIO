/**
 * ADVANCED sekmesinin AKIŞ ve KATMAN kartları — diyalog, sihirbaz, komut
 * paleti, yetenek ağacı ve zengin ipucu.
 *
 * Bölme gerekçesi için bkz. `advancedDataCards.ts`.
 */
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Button,
  Checkbox,
  CommandPalette,
  DialogueBox,
  RadioGroup,
  RichTooltip,
  SkillTree,
  resolveSkillStates,
  Text,
  Wizard,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';

/** DialogueBox demosu: showControls:true ile dallı diyalog ve ileri saralama. */

export function buildDialogueDemo(
  uiRootElement: HTMLElement,
  disposables: DisposableScope,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const dialogue = new DialogueBox({ typeSpeedMs: 18, showControls: true });
  uiRootElement.appendChild(dialogue.element);
  disposables.addDestroyables(dialogue);

  const decisions: string[] = [];
  const result = new Text(i18next.t('volui:advanced.dialogueHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(result);

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
  disposables.addDestroyables(startButton);

  wrap.appendChild(startButton.element);
  wrap.appendChild(result.element);

  return wrap;
}

export function buildWizardDemo(disposables: DisposableScope): HTMLElement {
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
    onCommit: (checked) => {
      advancedSetup = checked;
      mountWizard();
    },
  });
  disposables.addDestroyables(advancedToggle);

  const wizardSlot = document.createElement('div');

  let currentWizard: Wizard | null = null;
  let wizardScope: DisposableScope | null = null;

  const mountWizard = (): void => {
    wizardScope?.dispose();
    wizardScope = new DisposableScope();
    currentWizard = null;

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
    wizardScope.addListener(nameInput, 'input', onNameInput);
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
      onCommit: (value) => {
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
      onCommit: (value) => {
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
      onCommit: (value) => {
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
    wizardScope.addDestroyable(currentWizard);

    wizardSlot.replaceChildren(currentWizard.element);
  };

  mountWizard();

  disposables.addDestroyables({
    destroy: () => {
      wizardScope?.dispose();
      wizardScope = null;
      currentWizard = null;
    },
  });

  wrap.appendChild(advancedToggle.element);
  wrap.appendChild(wizardSlot);

  return wrap;
}

/** CommandPalette demosu: butonla açılır, kısayol tüketiciye bırakılmıştır. Yazarken fuzzy çoklu-kelime eşleşmesi, kategoriye göre gruplanır. */

export function buildCommandPaletteDemo(
  uiRootElement: HTMLElement,
  disposables: DisposableScope,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:advanced.awaitingCommand'), { variant: 'muted' });
  disposables.addDestroyables(result);

  const palette = new CommandPalette({
    placeholder: i18next.t('volui:advanced.commandPlaceholder'),
    noMatchText: i18next.t('volui:advanced.noMatchText'),
  });
  uiRootElement.appendChild(palette.element);
  disposables.addDestroyables(palette);

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
  disposables.addDestroyables(openButton);

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

export function buildSkillTreeDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  let skillPoints = 5;
  const pointsText = new Text(i18next.t('volui:advanced.skillPoints', { n: skillPoints }), {
    variant: 'body',
  });
  disposables.addDestroyables(pointsText);

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
  disposables.addDestroyables(skillTree);

  // `resolveSkillStates` CORE'un OPSİYONEL tarifi: klasik "tüm önkoşullar
  // açık olmalı" kuralı. Farklı bir kural isteyen oyun kendi eşlemesini yazar.
  skillTree.setStates(resolveSkillStates(skillTree.getNodes(), unlockedIds));
  skillTree.element.style.height = '360px';

  const resetButton = new Button(i18next.t('volui:advanced.resetView'), {
    onClick: () => skillTree.resetView(),
  });
  disposables.addDestroyables(resetButton);

  wrap.appendChild(pointsText.element);
  wrap.appendChild(skillTree.element);
  wrap.appendChild(resetButton.element);

  return wrap;
}

/** EventLog demosu: filtreler, yinelenenleri birleştirme (×N) ve satır sabitleme. "Sonraki Dalga" bilerek zamansız eklenir — hizalama bozulmaz. */

export function buildRichTooltipDemo(
  disposables: DisposableScope,
  uiRootElement: HTMLElement,
): HTMLElement {
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
  disposables.addDestroyables(itemName);
  itemCard.appendChild(itemName.element);

  const itemDesc = new Text(i18next.t('volui:advanced.hoverForStats'), { variant: 'muted' });
  disposables.addDestroyables(itemDesc);
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
  disposables.addDestroyables({ destroy: () => tooltip.destroy() });

  return wrap;
}
