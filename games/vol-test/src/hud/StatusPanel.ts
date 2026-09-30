import { i18next } from '@volstudio/core/i18n';
import { Bar, Text } from '@volstudio/core/ui';
import { formatHeading, formatSpeed } from './format';
import type { HudFrame } from './HudFrame';

/**
 * Oyun durumu: başlık (`Text`), hızlanma deposu (dikey `Bar`) ve telemetri
 * (`Text`: hız, rota, vites). Telemetri metni yalnız değişince yazılır.
 */
export class StatusPanel {
  readonly elements: readonly HTMLElement[];
  private readonly title: Text;
  private readonly boost: Bar;
  private readonly telemetry: Text;
  private lastTelemetry = '';

  constructor(private readonly metre: number) {
    this.title = new Text(i18next.t('voltest:app.title'), { variant: 'title', tag: 'h1' });
    this.title.element.classList.add('vt-hud__title');
    this.boost = new Bar({
      max: 1,
      value: 1,
      orientation: 'vertical',
      variant: 'boost',
      lowThreshold: 0.2,
      animateMs: 0,
      ariaLabel: i18next.t('voltest:hud.boost'),
      className: 'vt-hud__boost-bar',
    });
    this.telemetry = new Text('', { variant: 'muted', tag: 'p' });
    this.telemetry.element.classList.add('vt-hud__telemetry');
    this.telemetry.element.dataset.testid = 'telemetry';
    this.elements = [this.title.element, this.boost.element, this.telemetry.element];
  }

  update(frame: HudFrame): void {
    this.boost.setValue(frame.boost / frame.boostCapacity);
    const text = i18next.t('voltest:hud.telemetry', {
      speed: formatSpeed(frame.speed, this.metre),
      heading: formatHeading(frame.hull),
      gear: i18next.t(
        frame.braking
          ? 'voltest:hud.brake'
          : frame.reversing
          ? 'voltest:hud.reverse'
          : 'voltest:hud.forward',
      ),
    });
    if (text === this.lastTelemetry) return;
    this.lastTelemetry = text;
    this.telemetry.setContent(text);
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:app.title'));
    this.lastTelemetry = '';
  }

  destroy(): void {
    this.title.destroy();
    this.boost.destroy();
    this.telemetry.destroy();
  }
}
