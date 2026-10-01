import { DisposableScope } from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { Checkbox, SegmentedControl, Slider, Text } from '@volstudio/core/ui';
import { ScenarioPanel } from './ScenarioPanel';
import type { GameSettings } from '@/app/GameSettings';

export class SettingsPanel {
  readonly elements: readonly HTMLElement[];
  private readonly scope = new DisposableScope();
  private readonly scenarios: ScenarioPanel;
  private readonly volume: Slider;
  private readonly haptics: Checkbox;
  private readonly display: SegmentedControl | null;
  private readonly displayLabel: Text | null;

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
        onCommit: (volume) => void settings.update({ volume }),
      }),
    );
    this.volume.element.dataset.testid = 'pause-volume';
    this.haptics = this.scope.addDestroyable(
      new Checkbox({
        checked: value.haptics,
        label: i18next.t('voltest:pause.haptics'),
        onCommit: (haptics) => void settings.update({ haptics }),
      }),
    );
    this.haptics.element.dataset.testid = 'pause-haptics';
    this.displayLabel = displayAvailable
      ? this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'span' }))
      : null;
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
    if (this.display) this.display.element.dataset.testid = 'pause-display';
    this.scenarios = this.scope.addDestroyable(new ScenarioPanel(settings));
    this.elements = [
      this.volume.element,
      this.haptics.element,
      ...this.scenarios.elements,
      ...(this.displayLabel && this.display
        ? [this.displayLabel.element, this.display.element]
        : []),
    ];
    this.scope.addSubscription(
      settings.subscribe((next) => {
        this.volume.setValue(next.volume);
        this.haptics.setChecked(next.haptics);
        this.display?.setValue(next.display);
      }),
    );
    this.refreshLabels();
  }

  refreshLabels(): void {
    this.scenarios.refreshLabels();
    this.volume.setLabel(i18next.t('voltest:pause.volume'));
    this.haptics.setLabel(i18next.t('voltest:pause.haptics'));
    this.displayLabel?.setContent(i18next.t('voltest:pause.display'));
    this.display?.setOptions(this.displayOptions());
    this.display?.setAriaLabel(i18next.t('voltest:pause.display'));
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
