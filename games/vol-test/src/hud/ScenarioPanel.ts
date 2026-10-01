import { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { Input, Select, Text } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { isScenario, validSeed, SCENARIO, SCENARIOS, type ScenarioId } from '@/config/scenarios';

export class ScenarioPanel {
  readonly elements: readonly HTMLElement[];
  private readonly scope = new DisposableScope();
  private readonly label: Text;
  private readonly picker: Select;
  private readonly seedLabel: Text;
  private readonly seed: Input;

  constructor(settings: GameSettings) {
    this.label = this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'label' }));
    this.picker = this.scope.addDestroyable(
      new Select({
        options: this.options(),
        value: settings.get().scenario,
        onCommit: (scenario) => {
          if (isScenario(scenario)) void settings.update({ scenario });
        },
      }),
    );
    this.picker.element.dataset.testid = 'pause-scenario';
    this.seedLabel = this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'label' }));
    this.seed = this.scope.addDestroyable(
      new Input({
        type: 'number',
        value: String(settings.get().seed),
        onCommit: (input) => {
          const seed = input.trim() ? Number(input) : NaN;
          if (validSeed(seed)) void settings.update({ seed });
          else this.seed.setValue(String(settings.get().seed));
        },
      }),
    );
    this.seed.element.inputMode = 'numeric';
    this.seed.element.min = '0';
    this.seed.element.max = String(SCENARIO.maxSeed);
    this.seed.element.step = '1';
    this.seed.element.dataset.testid = 'pause-seed';
    this.elements = [
      this.label.element,
      this.picker.element,
      this.seedLabel.element,
      this.seed.element,
    ];
    this.scope.addSubscription(
      settings.subscribe((next) => {
        this.picker.setValue(next.scenario);
        this.seed.setValue(String(next.seed));
      }),
    );
    this.refreshLabels();
  }

  refreshLabels(): void {
    const scenario = i18next.t('voltest:pause.scenario');
    const seed = i18next.t('voltest:pause.seed');
    this.label.setContent(scenario);
    this.picker.element.setAttribute('aria-label', scenario);
    this.picker.setOptions(this.options());
    this.seedLabel.setContent(seed);
    this.seed.element.setAttribute('aria-label', seed);
  }

  destroy(): void {
    this.scope.dispose();
  }

  private options(): Array<{ value: ScenarioId; label: string }> {
    return (Object.keys(SCENARIOS) as ScenarioId[]).map((value) => ({
      value,
      label: i18next.t(`voltest:pause.scenarioMode.${value}`),
    }));
  }
}
