/**
 * ADVANCED sekmesi — kart üretimi iki aileye bölündü, burada yalnız sıralama
 * ve yaşam döngüsü kalır (bkz. `advancedDataCards.ts`, `advancedFlowCards.ts`).
 */
import { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid } from './shared';
import {
  buildAccordionDemo,
  buildDataTableDemo,
  buildEventLogDemo,
  buildKanbanDemo,
  buildTreeDemo,
  buildVirtualizedDataTableDemo,
  buildVirtualizedKanbanDemo,
} from './advancedDataCards';
import {
  buildCommandPaletteDemo,
  buildDialogueDemo,
  buildRichTooltipDemo,
  buildSkillTreeDemo,
  buildWizardDemo,
} from './advancedFlowCards';

export function buildAdvancedTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables = new DisposableScope();

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
    destroy: () => disposables.dispose(),
  };
}
