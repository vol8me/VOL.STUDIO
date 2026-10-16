import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { SegmentedControl, SettingsForm, SettingsRow } from '@volstudio/core/ui';
import { applyLanguage } from '@/app/language';
import { LANGUAGES, type GameSettings, type LanguagePreference } from '@/app/GameSettings';
import { EFFECT_LEVELS, type EffectLevel } from '@/config/quality';
import type { MessageKey } from '@/i18n/keys';
import { SettingsPanel } from '@/hud/SettingsPanel';
import { ScreenFrame } from './ScreenFrame';

const LEVELS = Object.keys(EFFECT_LEVELS) as EffectLevel[];

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
 * Ayarlar ekranı (ana menü ve duraklatmayla aynı sağ şerit): dil, efekt kalitesi,
 * ses, titreşim ve ekran satırları; senaryo ve tohum `DevScreen`dedir. Satırların hepsi CORE `SettingsRow`dur; değerler aynı
 * `GameSettings` kaydına yazılır, menüden değişen değer oyunda geçerlidir.
 */
export class SettingsScreen {
  private readonly frame: ScreenFrame;
  private readonly scope = new DisposableScope();
  private readonly language: SegmentedControl;
  private readonly languageRow: SettingsRow;
  private readonly quality: SegmentedControl;
  private readonly qualityRow: SettingsRow;
  private readonly panel: SettingsPanel;

  constructor(private readonly options: SettingsScreenOptions) {
    const { settings } = options;
    this.frame = new ScreenFrame({ testid: 'settings', onBack: options.onBack });
    this.language = this.scope.addDestroyable(
      new SegmentedControl({
        options: this.languageOptions(),
        value: settings.get().language,
        onCommit: (value) => {
          const language = LANGUAGES.find((candidate) => candidate === value);
          if (!language) return;
          void settings.update({ language });
          void applyLanguage(language);
        },
      }),
    );
    this.language.element.dataset.testid = 'settings-language';
    this.quality = this.scope.addDestroyable(
      new SegmentedControl({
        options: this.qualityOptions(),
        value: settings.get().quality,
        onCommit: (value) => {
          const quality = LEVELS.find((candidate) => candidate === value);
          if (quality) void settings.update({ quality });
        },
      }),
    );
    this.quality.element.dataset.testid = 'settings-quality';
    this.languageRow = this.scope.addDestroyable(
      new SettingsRow({
        label: i18next.t('voltest:settings.language'),
        control: this.language,
        stackOnNarrow: true,
      }),
    );
    this.qualityRow = this.scope.addDestroyable(
      new SettingsRow({ label: i18next.t('voltest:pause.quality'), control: this.quality }),
    );
    this.panel = this.scope.addDestroyable(new SettingsPanel(settings, options.displayAvailable));
    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vt-settings__form' }));
    form.add(this.languageRow);
    form.add(this.qualityRow);
    for (const element of this.panel.elements) form.element.append(element);
    this.frame.body.add(form);

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

  get element(): HTMLElement {
    return this.frame.element;
  }

  focus(): void {
    this.language.element
      .querySelector<HTMLElement>('button, input')
      ?.focus({ preventScroll: true });
  }

  refreshLabels(): void {
    this.frame.setTitle(i18next.t('voltest:settings.title'));
    this.frame.setBackLabel(i18next.t('voltest:settings.back'));
    this.languageRow.setLabel(i18next.t('voltest:settings.language'));
    this.language.setOptions(this.languageOptions());
    this.language.setValue(this.options.settings.get().language);
    this.qualityRow.setLabel(i18next.t('voltest:pause.quality'));
    this.quality.setOptions(this.qualityOptions());
    this.quality.setValue(this.options.settings.get().quality);
    this.panel.refreshLabels();
  }

  destroy(): void {
    this.scope.dispose();
    this.frame.destroy();
  }

  private languageOptions(): Array<{ value: string; label: string }> {
    return LANGUAGES.map((value) => ({ value, label: i18next.t(LANGUAGE_KEYS[value]) }));
  }

  private qualityOptions(): Array<{ value: string; label: string }> {
    return LEVELS.map((value) => ({ value, label: i18next.t(QUALITY_KEYS[value]) }));
  }
}
