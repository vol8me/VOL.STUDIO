/**
 * HUD sekmesi — kart üretimi iki aileye bölündü, burada yalnız sıralama ve
 * yaşam döngüsü kalır (bkz. `hudFeedbackCards.ts`, `hudPanelCards.ts`).
 */
import { DisposableScope } from '@volstudio/core/lifecycle';
import { cardGrid } from './shared';
import {
  buildBarVariantCard,
  buildCounterCard,
  buildFloatingTextCard,
  buildFormattedCounterCard,
  buildLowThresholdCard,
  buildResourceBarCard,
  buildResourceCounterCard,
  buildXPBarCard,
} from './hudFeedbackCards';
import {
  buildBuildMenuCard,
  buildMinimapCard,
  buildRoundCounterCard,
  buildSelectionInfoPanelCard,
  buildStatsPanelCard,
} from './hudPanelCards';

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
    buildStatsPanelCard(disposables),
    buildBuildMenuCard(disposables),
    buildFloatingTextCard(disposables),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.dispose(),
  };
}
