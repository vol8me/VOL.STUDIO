import { i18next } from '@volstudio/core/i18n';
import { Text } from '@volstudio/core/ui';
import type { WeatherFrame } from '@/sim/weather/types';

export type ClimateFrame = Pick<WeatherFrame, 'season' | 'kind'>;

export class ClimateStatus {
  readonly element: HTMLElement;
  private readonly text = new Text('', { variant: 'muted', tag: 'p' });
  private climate: ClimateFrame | undefined;
  private lastText = '';

  constructor() {
    this.element = this.text.element;
    this.element.classList.add('vt-hud__climate');
    this.element.dataset.testid = 'climate';
    this.element.hidden = true;
  }

  update(climate: ClimateFrame | undefined): void {
    this.climate = climate;
    this.element.hidden = climate === undefined;
    if (!climate) return;
    const text = i18next.t('voltest:hud.climate', {
      season: i18next.t(`voltest:season.${climate.season}`),
      weather: i18next.t(`voltest:weather.${climate.kind}`),
    });
    if (text !== this.lastText) {
      this.text.setContent(text);
      this.lastText = text;
    }
  }

  refreshLabels(): void {
    this.lastText = '';
    this.update(this.climate);
  }

  destroy(): void {
    this.text.destroy();
  }
}
