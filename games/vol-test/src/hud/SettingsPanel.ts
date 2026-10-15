import { DisposableScope, getHapticsCapability } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { Checkbox, SegmentedControl, SettingsRow, Slider } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';

/** Ses, titreşim ve ekran kipi satırları; senaryo ve tohum geliştirici ayarıdır (`ScenarioPanel`). */
export class SettingsPanel {
  readonly elements: readonly HTMLElement[];
  private readonly scope = new DisposableScope();
  private readonly volume: Slider;
  private readonly haptics: Checkbox;
  private readonly grid: Checkbox;
  private readonly display: SegmentedControl | null;
  private readonly displayRow: SettingsRow | null;
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
    ];
    this.scope.addSubscription(
      settings.subscribe((next) => {
        if (this.volume.getValue() !== next.volume) this.volume.setValue(next.volume);
        this.haptics.setChecked(next.haptics);
        this.grid.setChecked(next.grid);
        this.display?.setValue(next.display);
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
