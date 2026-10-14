import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, SegmentedControl, Text } from '@volstudio/core/ui';
import { applyLanguage } from '@/app/language';
import { LANGUAGES, type GameSettings, type LanguagePreference } from '@/app/GameSettings';
import { EFFECT_LEVELS, type EffectLevel } from '@/config/quality';

const LEVELS = Object.keys(EFFECT_LEVELS) as EffectLevel[];
import type { MessageKey } from '@/i18n/keys';
import { SettingsPanel } from '@/hud/SettingsPanel';
import './menu.css';

export interface SettingsScreenOptions {
  readonly settings: GameSettings;
  /** Pencere kipi seçilebilen ortam mı (Android'de değil). */
  readonly displayAvailable: boolean;
  readonly onBack: () => void;
}

const LANGUAGE_KEYS = {
  auto: 'voltest:settings.languageOption.auto',
  tr: 'voltest:settings.languageOption.tr',
  en: 'voltest:settings.languageOption.en',
} as const satisfies Record<LanguagePreference, MessageKey>;

const QUALITY_KEYS = {
  high: 'voltest:pause.qualityLevel.high',
  low: 'voltest:pause.qualityLevel.low',
} as const satisfies Record<EffectLevel, MessageKey>;

/**
 * Ayarlar ekranı: dil, efekt kalitesi ve duraklatma menüsüyle ortak ses, titreşim, ekran ve
 * senaryo satırları. Hepsi aynı `GameSettings` kaydına yazar; menüden değişen değer oyunda geçerlidir.
 */
export class SettingsScreen {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly title = new Text('', { variant: 'heading', tag: 'h2' });
  private readonly languageLabel = new Text('', { variant: 'muted', tag: 'span' });
  private readonly language: SegmentedControl;
  private readonly qualityLabel = new Text('', { variant: 'muted', tag: 'span' });
  private readonly quality: SegmentedControl;
  private readonly panel: SettingsPanel;
  private readonly back: Button;

  constructor(private readonly options: SettingsScreenOptions) {
    const { settings } = options;
    this.element = document.createElement('section');
    this.element.className = 'vt-screen vt-settings';
    this.element.dataset.testid = 'settings';

    this.language = new SegmentedControl({
      options: this.languageOptions(),
      value: settings.get().language,
      onCommit: (value) => {
        const language = LANGUAGES.find((candidate) => candidate === value);
        if (!language) return;
        void settings.update({ language });
        void applyLanguage(language);
      },
    });
    this.language.element.dataset.testid = 'settings-language';
    this.quality = new SegmentedControl({
      options: this.qualityOptions(),
      value: settings.get().quality,
      onCommit: (value) => {
        const quality = LEVELS.find((candidate) => candidate === value);
        if (quality) void settings.update({ quality });
      },
    });
    this.quality.element.dataset.testid = 'settings-quality';
    this.panel = new SettingsPanel(settings, options.displayAvailable);
    this.back = new Button('', { variant: 'primary', onClick: () => options.onBack() });
    this.back.element.dataset.testid = 'settings-back';

    const body = document.createElement('div');
    body.className = 'vt-settings__body';
    body.append(
      this.languageLabel.element,
      this.language.element,
      this.qualityLabel.element,
      this.quality.element,
      ...this.panel.elements,
    );
    const actions = document.createElement('div');
    actions.className = 'vt-screen__actions';
    actions.append(this.back.element);
    this.element.append(this.title.element, body, actions);

    this.scope.addSubscription(
      settings.subscribe((next) => {
        this.language.setValue(next.language);
        this.quality.setValue(next.quality);
      }),
    );
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  focus(): void {
    this.language.element
      .querySelector<HTMLElement>('button, input')
      ?.focus({ preventScroll: true });
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:settings.title'));
    this.languageLabel.setContent(i18next.t('voltest:settings.language'));
    this.language.setOptions(this.languageOptions());
    this.language.setValue(this.options.settings.get().language);
    this.language.setAriaLabel(i18next.t('voltest:settings.language'));
    this.qualityLabel.setContent(i18next.t('voltest:pause.quality'));
    this.quality.setOptions(this.qualityOptions());
    this.quality.setValue(this.options.settings.get().quality);
    this.quality.setAriaLabel(i18next.t('voltest:pause.quality'));
    this.panel.refreshLabels();
    this.back.setLabel(i18next.t('voltest:settings.back'));
  }

  destroy(): void {
    this.scope.dispose();
    this.panel.destroy();
    for (const part of [
      this.title,
      this.languageLabel,
      this.language,
      this.qualityLabel,
      this.quality,
      this.back,
    ])
      part.destroy();
    this.element.remove();
  }

  private languageOptions(): Array<{ value: string; label: string }> {
    return LANGUAGES.map((value) => ({ value, label: i18next.t(LANGUAGE_KEYS[value]) }));
  }

  private qualityOptions(): Array<{ value: string; label: string }> {
    return LEVELS.map((value) => ({ value, label: i18next.t(QUALITY_KEYS[value]) }));
  }
}
