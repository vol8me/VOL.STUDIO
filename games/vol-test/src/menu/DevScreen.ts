import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { SettingsForm } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { ScenarioPanel } from '@/hud/ScenarioPanel';
import { ScreenFrame } from './ScreenFrame';

export interface DevScreenOptions {
  readonly settings: GameSettings;
  readonly onBack: () => void;
}

/**
 * Geliştirici ayarları (ana menü ve duraklatmayla aynı sol şerit): oyuncuya ait olmayan test girdileri,
 * yani alıştırma senaryosu ve tohumu. Oyuncu ayarları (dil, kalite, ses) `SettingsScreen`dedir.
 */
export class DevScreen {
  private readonly frame: ScreenFrame;
  private readonly scope = new DisposableScope();
  private readonly scenarios: ScenarioPanel;

  constructor(options: DevScreenOptions) {
    this.frame = new ScreenFrame({ testid: 'dev', variant: 'sheet', onBack: options.onBack });
    this.scenarios = this.scope.addDestroyable(new ScenarioPanel(options.settings));
    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vt-settings__form' }));
    for (const element of this.scenarios.elements) form.element.append(element);
    this.frame.body.add(form);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  get element(): HTMLElement {
    return this.frame.element;
  }

  focus(): void {
    this.frame.focusFirst('button, input, select, [role="combobox"]');
  }

  refreshLabels(): void {
    this.frame.setTitle(i18next.t('voltest:dev.title'));
    this.frame.setBackLabel(i18next.t('voltest:settings.back'));
    this.scenarios.refreshLabels();
  }

  destroy(): void {
    this.scope.dispose();
    this.frame.destroy();
  }
}
