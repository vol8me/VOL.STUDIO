import {
  Checkbox,
  DisposableScope,
  SegmentedControl,
  Select,
  Text,
  i18next,
  observeHapticsCapability,
  vibrate,
  type SegmentedControlOption,
} from '@volstudio/core';
import type { DisplayMode, ScreenOrientation } from '@volstudio/tauri-v2';

interface ValueOption<T> {
  readonly value: T;
  readonly onSelect: (value: T) => void;
}

export interface LifeOptionsPanelOptions {
  readonly orientation: ValueOption<ScreenOrientation> & { readonly interactive: boolean };
  readonly language: ValueOption<string>;
  readonly showFps: ValueOption<boolean>;
  readonly haptics: ValueOption<boolean>;
  readonly displayMode?: ValueOption<DisplayMode>;
}

/** Değerleri çizip kullanıcı niyetini bildiren, kural taşımayan seçenek içeriği. */
export class LifeOptionsPanel {
  readonly element: HTMLDivElement;
  private readonly scope = new DisposableScope();
  private readonly labels = new Map<'language' | 'orientation' | 'display', Text>();
  private readonly orientationControl: SegmentedControl;
  private readonly languageControl: Select;
  private readonly fpsControl: Checkbox;
  private readonly hapticsControl: Checkbox;
  private readonly hapticsRow: HTMLDivElement;
  private readonly displayControl: SegmentedControl | null;
  private readonly onLanguageChanged = (): void => this.refreshLabels();

  constructor(options: LifeOptionsPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'vol-life-options';

    this.languageControl = this.scope.addDestroyable(
      new Select({
        options: languageOptions(),
        value: options.language.value,
        onCommit: (value) => this.commit(() => options.language.onSelect(value)),
      }),
    );
    this.appendLabeledRow('language', this.languageControl);

    this.fpsControl = this.scope.addDestroyable(
      new Checkbox({
        checked: options.showFps.value,
        label: i18next.t('life:options.showFps'),
        onCommit: (value) => this.commit(() => options.showFps.onSelect(value)),
      }),
    );
    this.appendControlRow('fps', this.fpsControl.element);

    this.hapticsControl = this.scope.addDestroyable(
      new Checkbox({
        checked: options.haptics.value,
        label: i18next.t('life:options.haptics'),
        onCommit: (value) => this.commit(() => options.haptics.onSelect(value)),
      }),
    );
    this.hapticsRow = this.appendControlRow('haptics', this.hapticsControl.element);
    this.hapticsRow.hidden = true;
    this.scope.addSubscription(
      observeHapticsCapability((capability) => {
        this.hapticsRow.hidden = !capability.supported;
      }),
    );

    this.orientationControl = this.scope.addDestroyable(
      new SegmentedControl({
        options: orientationOptions(),
        value: options.orientation.value,
        disabled: !options.orientation.interactive,
        ariaLabel: i18next.t('life:options.orientation'),
        onCommit: (value) => {
          if (isScreenOrientation(value)) {
            this.commit(() => options.orientation.onSelect(value));
          }
        },
      }),
    );
    this.appendLabeledRow('orientation', this.orientationControl);

    if (options.displayMode) {
      const displayMode = options.displayMode;
      this.displayControl = this.scope.addDestroyable(
        new SegmentedControl({
          options: displayModeOptions(),
          value: displayMode.value,
          ariaLabel: i18next.t('life:options.displayMode'),
          onCommit: (value) => {
            if (isDisplayMode(value)) this.commit(() => displayMode.onSelect(value));
          },
        }),
      );
      this.appendLabeledRow('display', this.displayControl);
    } else {
      this.displayControl = null;
    }

    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  setOrientation(value: ScreenOrientation): void {
    this.orientationControl.setValue(value);
  }

  setOrientationInteractive(interactive: boolean): void {
    this.orientationControl.setDisabled(!interactive);
  }

  setDisplayMode(value: DisplayMode): void {
    this.displayControl?.setValue(value);
  }

  setLanguage(value: string): void {
    this.languageControl.setValue(value);
  }

  setShowFps(value: boolean): void {
    this.fpsControl.setChecked(value);
  }

  setHapticsEnabled(value: boolean): void {
    this.hapticsControl.setChecked(value);
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private appendLabeledRow(
    key: 'language' | 'orientation' | 'display',
    control: { element: HTMLElement },
  ): void {
    const label = this.scope.addDestroyable(new Text(this.labelFor(key), { variant: 'muted' }));
    this.labels.set(key, label);
    const row = this.appendControlRow(key, label.element, control.element);
    row.classList.add('vol-life-options__row--stacked');
  }

  private appendControlRow(key: string, ...children: HTMLElement[]): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'vol-life-options__row';
    row.dataset.option = key;
    row.append(...children);
    this.element.appendChild(row);
    return row;
  }

  private commit(callback: () => void): void {
    callback();
    vibrate('select');
  }

  private refreshLabels(): void {
    for (const [key, label] of this.labels) label.setContent(this.labelFor(key));
    this.languageControl.setOptions(languageOptions());
    this.orientationControl.setAriaLabel(i18next.t('life:options.orientation'));
    this.orientationControl.setOptions(orientationOptions());
    this.displayControl?.setAriaLabel(i18next.t('life:options.displayMode'));
    this.displayControl?.setOptions(displayModeOptions());
    this.fpsControl.setLabel(i18next.t('life:options.showFps'));
    this.hapticsControl.setLabel(i18next.t('life:options.haptics'));
  }

  private labelFor(key: 'language' | 'orientation' | 'display'): string {
    const translation = {
      language: 'life:options.language',
      orientation: 'life:options.orientation',
      display: 'life:options.displayMode',
    } as const;
    return i18next.t(translation[key]);
  }
}

function languageOptions() {
  return [
    { value: 'tr', label: i18next.t('life:options.turkish') },
    { value: 'en', label: i18next.t('life:options.english') },
  ];
}

function orientationOptions(): SegmentedControlOption[] {
  return [
    { value: 'portrait', label: i18next.t('life:options.portrait') },
    { value: 'landscape', label: i18next.t('life:options.landscape') },
  ];
}

function displayModeOptions(): SegmentedControlOption[] {
  return [
    { value: 'windowed', label: i18next.t('life:options.windowed') },
    { value: 'fullscreen', label: i18next.t('life:options.fullscreen') },
  ];
}

function isScreenOrientation(value: string): value is ScreenOrientation {
  return value === 'portrait' || value === 'landscape';
}

function isDisplayMode(value: string): value is DisplayMode {
  return value === 'windowed' || value === 'fullscreen';
}
