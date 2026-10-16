import { DisposableScope, getHapticsCapability } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { Checkbox, SegmentedControl, Select, SettingsRow, Slider } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import {
  fittingWindowSizes,
  isRenderScaleChoice,
  isWindowSizeChoice,
  RENDER_SCALES,
  RESOLUTION_AUTO,
  windowSizeOf,
} from '@/config/resolution';

/** Ses, titreşim, ekran kipi, çözünürlük ve pencere boyutu satırları; senaryo ve tohum geliştirici ayarıdır (`ScenarioPanel`). */
export class SettingsPanel {
  readonly elements: readonly HTMLElement[];
  private readonly scope = new DisposableScope();
  private readonly volume: Slider;
  private readonly haptics: Checkbox;
  private readonly grid: Checkbox;
  private readonly display: SegmentedControl | null;
  private readonly displayRow: SettingsRow | null;
  private readonly resolution: Select;
  private readonly resolutionRow: SettingsRow;
  private readonly windowSize: Select | null;
  private readonly windowSizeRow: SettingsRow | null;
  private readonly rows: readonly SettingsRow[];

  constructor(settings: GameSettings, displayAvailable: boolean) {
    const value = settings.get();
    this.volume = this.scope.addDestroyable(
      new Slider({
        label: i18next.t('voltest:pause.volume'),
        min: 0,
        max: 1,
        step: 0.05,
        value: value.volume,
        formatValue: (volume) => `${Math.round(volume * 100)}%`,
        // Sürüklerken canlı: ses bırakmayı beklemez (CORE `Slider.onInput`).
        onInput: (volume) => void settings.update({ volume }),
      }),
    );
    this.volume.element.dataset.testid = 'settings-volume';
    this.haptics = this.scope.addDestroyable(
      new Checkbox({
        checked: value.haptics,
        label: i18next.t('voltest:pause.haptics'),
        onCommit: (haptics) => void settings.update({ haptics }),
      }),
    );
    this.haptics.element.dataset.testid = 'settings-haptics';
    this.grid = this.scope.addDestroyable(
      new Checkbox({
        checked: value.grid,
        label: i18next.t('voltest:pause.grid'),
        onCommit: (grid) => void settings.update({ grid }),
      }),
    );
    this.grid.element.dataset.testid = 'settings-grid';
    this.display = displayAvailable
      ? this.scope.addDestroyable(
          new SegmentedControl({
            options: this.displayOptions(),
            value: value.display,
            onCommit: (display) => {
              if (display === 'windowed' || display === 'fullscreen')
                void settings.update({ display });
            },
          }),
        )
      : null;
    if (this.display) this.display.element.dataset.testid = 'settings-display';
    this.displayRow = this.display
      ? this.scope.addDestroyable(
          new SettingsRow({
            label: i18next.t('voltest:pause.display'),
            control: this.display,
            stackOnNarrow: true,
          }),
        )
      : null;
    this.resolution = this.scope.addDestroyable(
      new Select({
        options: this.resolutionOptions(),
        value: String(value.resolution),
        onCommit: (choice) => {
          const parsed = choice === RESOLUTION_AUTO ? RESOLUTION_AUTO : Number(choice);
          if (isRenderScaleChoice(parsed)) void settings.update({ resolution: parsed });
        },
      }),
    );
    this.resolution.element.dataset.testid = 'settings-resolution';
    this.resolutionRow = this.scope.addDestroyable(
      new SettingsRow({
        label: i18next.t('voltest:pause.resolution'),
        control: this.resolution,
        stackOnNarrow: true,
      }),
    );
    // Pencere boyutu yalnız native pencerede ve pencereli kipte anlamlıdır.
    this.windowSize = displayAvailable
      ? this.scope.addDestroyable(
          new Select({
            options: this.windowSizeOptions(value.windowSize),
            value: value.windowSize,
            onCommit: (choice) => {
              if (isWindowSizeChoice(choice)) void settings.update({ windowSize: choice });
            },
          }),
        )
      : null;
    if (this.windowSize) this.windowSize.element.dataset.testid = 'settings-window-size';
    this.windowSizeRow = this.windowSize
      ? this.scope.addDestroyable(
          new SettingsRow({
            label: i18next.t('voltest:pause.windowSize'),
            control: this.windowSize,
            stackOnNarrow: true,
          }),
        )
      : null;
    if (this.windowSizeRow) this.windowSizeRow.element.hidden = value.display === 'fullscreen';
    // Kaydırıcı ve onay kutusu kendi etiketini taşır; satır yalnız ritmi ve ayırıcıyı verir.
    this.rows = [
      this.scope.addDestroyable(new SettingsRow({ control: this.volume })),
      this.scope.addDestroyable(new SettingsRow({ control: this.haptics })),
      this.scope.addDestroyable(new SettingsRow({ control: this.grid })),
    ];
    // Titreşim satırı yalnız titreşim üretebilen cihazda görünür (Android, Deck/kol); masaüstü tarayıcıda
    // `navigator.vibrate` var ama hiçbir şey yapmaz. Kol oyun ortasında takılabilir: yetenek canlı ölçülür.
    const syncHaptics = (): void => {
      this.rows[1].element.hidden = !getHapticsCapability().supported;
    };
    syncHaptics();
    for (const event of ['gamepadconnected', 'gamepaddisconnected'])
      this.scope.addListener(window, event, syncHaptics);
    this.elements = [
      ...this.rows.map((row) => row.element),
      ...(this.displayRow ? [this.displayRow.element] : []),
      ...(this.windowSizeRow ? [this.windowSizeRow.element] : []),
      this.resolutionRow.element,
    ];
    this.scope.addSubscription(
      settings.subscribe((next) => {
        if (this.volume.getValue() !== next.volume) this.volume.setValue(next.volume);
        this.haptics.setChecked(next.haptics);
        this.grid.setChecked(next.grid);
        this.display?.setValue(next.display);
        this.resolution.setValue(String(next.resolution));
        this.windowSize?.setOptions(this.windowSizeOptions(next.windowSize));
        this.windowSize?.setValue(next.windowSize);
        if (this.windowSizeRow) this.windowSizeRow.element.hidden = next.display === 'fullscreen';
      }),
    );
    this.refreshLabels();
  }

  refreshLabels(): void {
    this.volume.setLabel(i18next.t('voltest:pause.volume'));
    this.haptics.setLabel(i18next.t('voltest:pause.haptics'));
    this.grid.setLabel(i18next.t('voltest:pause.grid'));
    this.displayRow?.setLabel(i18next.t('voltest:pause.display'));
    this.display?.setOptions(this.displayOptions());
    this.resolutionRow.setLabel(i18next.t('voltest:pause.resolution'));
    this.resolution.setOptions(this.resolutionOptions());
    this.windowSizeRow?.setLabel(i18next.t('voltest:pause.windowSize'));
    this.windowSize?.setOptions(
      this.windowSizeOptions(this.windowSize.getValue() ?? RESOLUTION_AUTO),
    );
  }

  private resolutionOptions(): Array<{ value: string; label: string }> {
    return [
      { value: RESOLUTION_AUTO, label: i18next.t('voltest:pause.resolutionOption.auto') },
      ...RENDER_SCALES.map((scale) => ({
        value: String(scale),
        label: i18next.t('voltest:pause.resolutionOption.scale', {
          percent: Math.round(scale * 100),
        }),
      })),
    ];
  }

  /** Ekrana sığan ön ayarlar; kayıtlı seçim sığmasa da (başka ekrandan kalan) listede kalır ki seçim kaybolmasın. */
  private windowSizeOptions(current: string): Array<{ value: string; label: string }> {
    const fitting = fittingWindowSizes({ width: screen.availWidth, height: screen.availHeight });
    const choices =
      isWindowSizeChoice(current) && !fitting.includes(current) ? [...fitting, current] : fitting;
    return choices.map((choice) => {
      const size = windowSizeOf(choice);
      return {
        value: choice,
        label: size
          ? i18next.t('voltest:pause.windowSizeOption.size', size)
          : i18next.t('voltest:pause.windowSizeOption.auto'),
      };
    });
  }

  private displayOptions(): Array<{ value: string; label: string }> {
    return ['windowed', 'fullscreen'].map((value) => ({
      value,
      label: i18next.t(
        `voltest:pause.displayMode.${value === 'fullscreen' ? 'fullscreen' : 'windowed'}`,
      ),
    }));
  }
  destroy(): void {
    this.scope.dispose();
  }
}
