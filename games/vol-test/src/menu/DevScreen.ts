import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { SettingsForm, Text } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { ScenarioPanel } from '@/hud/ScenarioPanel';
import type { MessageKey } from '@/i18n/keys';
import { DevWorldPanel } from './DevWorldPanel';
import { ScreenFrame } from './ScreenFrame';

export interface DevScreenOptions {
  readonly settings: GameSettings;
  readonly onBack: () => void;
}

interface Heading {
  readonly text: Text;
  readonly key: MessageKey;
}

/**
 * Geliştirici ayarları (ana menü ve duraklatmayla aynı sağ şerit): oyuncuya ait olmayan test girdileri.
 * Dünya bölümü mevsim, hava, araç ve menü arka planının yoğunluğunu verir (anında uygulanır);
 * alıştırma bölümü senaryo, tohum ve kaos kadranıdır. Oyuncu ayarları (dil, kalite, ses) `SettingsScreen`dedir.
 */
export class DevScreen {
  private readonly frame: ScreenFrame;
  private readonly scope = new DisposableScope();
  private readonly world: DevWorldPanel;
  private readonly scenarios: ScenarioPanel;
  private readonly headings: readonly Heading[];

  constructor(options: DevScreenOptions) {
    this.frame = new ScreenFrame({ testid: 'dev', onBack: options.onBack });
    this.world = this.scope.addDestroyable(new DevWorldPanel(options.settings));
    this.scenarios = this.scope.addDestroyable(new ScenarioPanel(options.settings));
    const heading = (key: MessageKey): Heading => ({
      text: this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'h2' })),
      key,
    });
    this.headings = [heading('voltest:dev.world'), heading('voltest:dev.practice')];
    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vt-settings__form' }));
    form.element.append(
      this.headings[0].text.element,
      ...this.world.elements,
      this.headings[1].text.element,
      ...this.scenarios.elements,
    );
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
    for (const { text, key } of this.headings) text.setContent(i18next.t(key));
    this.world.refreshLabels();
    this.scenarios.refreshLabels();
  }

  destroy(): void {
    this.scope.dispose();
    this.frame.destroy();
  }
}
