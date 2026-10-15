import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { Select, SettingsRow, Slider } from '@volstudio/core/ui';
import {
  CLIMATE_AUTO,
  isSeasonChoice,
  isWeatherChoice,
  type GameSettings,
  type SeasonChoice,
  type WeatherChoice,
} from '@/app/GameSettings';
import { BACKDROP } from '@/config/backdrop';
import { SEASONS } from '@/config/seasons';
import { isVehicleId, VEHICLE_IDS } from '@/config/vehicles';
import { WEATHER, type WeatherKind } from '@/config/weather';
import type { MessageKey } from '@/i18n/keys';
import { VEHICLE_NAME_KEYS } from './vehicleNames';

const SEASON_KEYS: Readonly<Record<SeasonChoice, MessageKey>> = {
  auto: 'voltest:dev.seasonOption.auto',
  spring: 'voltest:dev.seasonOption.spring',
  summer: 'voltest:dev.seasonOption.summer',
  autumn: 'voltest:dev.seasonOption.autumn',
  winter: 'voltest:dev.seasonOption.winter',
};

const WEATHER_KEYS: Readonly<Record<WeatherChoice, MessageKey>> = {
  auto: 'voltest:dev.weatherOption.auto',
  clear: 'voltest:dev.weatherOption.clear',
  dust: 'voltest:dev.weatherOption.dust',
  rain: 'voltest:dev.weatherOption.rain',
  snow: 'voltest:dev.weatherOption.snow',
};

/** Seçim satırlarının test kimlikleri ve etiketleri tek yerde. */
interface Row {
  readonly row: SettingsRow;
  readonly label: MessageKey;
}

/**
 * Geliştirici ekranının dünya bölümü: mevsim, hava, araç ve menü arka planının yoğunluğu. Seçimler
 * `GameSettings`e yazılır ve anında uygulanır: menü arka planı ve açık alıştırma dünyası mevsimi ve havayı
 * hemen değiştirir, araç seçimi vitrine ve bir sonraki girişe geçer. Alıştırma senaryosu, tohum ve kaos
 * `ScenarioPanel`dedir.
 */
export class DevWorldPanel {
  readonly elements: readonly HTMLElement[];
  private readonly scope = new DisposableScope();
  private readonly season: Select;
  private readonly weather: Select;
  private readonly vehicle: Select;
  private readonly density: Slider;
  private readonly rows: readonly Row[];

  constructor(settings: GameSettings) {
    const value = settings.get();
    this.season = this.scope.addDestroyable(
      new Select({
        options: this.seasonOptions(),
        value: value.season,
        onCommit: (season) => {
          if (isSeasonChoice(season)) void settings.update({ season });
        },
      }),
    );
    this.season.element.dataset.testid = 'dev-season';
    this.weather = this.scope.addDestroyable(
      new Select({
        options: this.weatherOptions(),
        value: value.weather,
        onCommit: (weather) => {
          if (isWeatherChoice(weather)) void settings.update({ weather });
        },
      }),
    );
    this.weather.element.dataset.testid = 'dev-weather';
    this.vehicle = this.scope.addDestroyable(
      new Select({
        options: this.vehicleOptions(),
        value: value.vehicle,
        onCommit: (vehicle) => {
          if (isVehicleId(vehicle)) void settings.update({ vehicle });
        },
      }),
    );
    this.vehicle.element.dataset.testid = 'dev-vehicle';
    this.density = this.scope.addDestroyable(
      new Slider({
        label: i18next.t('voltest:dev.density'),
        min: BACKDROP.density.min,
        max: BACKDROP.density.max,
        step: 1,
        value: value.backdropDensity,
        formatValue: (count) => String(Math.round(count)),
        // Bırakınca uygulanır: her adımda savaş baştan kurulmasın (CORE `Slider.onCommit`).
        onCommit: (backdropDensity) => void settings.update({ backdropDensity }),
      }),
    );
    this.density.element.dataset.testid = 'dev-density';
    const row = (control: Select, label: MessageKey): Row => ({
      label,
      row: this.scope.addDestroyable(
        new SettingsRow({ label: i18next.t(label), control, stackOnNarrow: true }),
      ),
    });
    this.rows = [
      row(this.season, 'voltest:dev.season'),
      row(this.weather, 'voltest:dev.weather'),
      row(this.vehicle, 'voltest:dev.vehicle'),
    ];
    this.elements = [...this.rows.map(({ row: made }) => made.element), this.density.element];
    this.scope.addSubscription(
      settings.subscribe((next) => {
        this.season.setValue(next.season);
        this.weather.setValue(next.weather);
        this.vehicle.setValue(next.vehicle);
        this.density.setValue(next.backdropDensity);
      }),
    );
    this.refreshLabels();
  }

  refreshLabels(): void {
    for (const { row, label } of this.rows) row.setLabel(i18next.t(label));
    this.density.setLabel(i18next.t('voltest:dev.density'));
    this.season.setOptions(this.seasonOptions());
    this.weather.setOptions(this.weatherOptions());
    this.vehicle.setOptions(this.vehicleOptions());
  }

  destroy(): void {
    this.scope.dispose();
  }

  private seasonOptions(): Array<{ value: string; label: string }> {
    const choices: readonly SeasonChoice[] = [CLIMATE_AUTO, ...SEASONS.order];
    return choices.map((value) => ({ value, label: i18next.t(SEASON_KEYS[value]) }));
  }

  private weatherOptions(): Array<{ value: string; label: string }> {
    const kinds = Object.keys(WEATHER.profiles) as WeatherKind[];
    const choices: readonly WeatherChoice[] = [CLIMATE_AUTO, ...kinds];
    return choices.map((value) => ({ value, label: i18next.t(WEATHER_KEYS[value]) }));
  }

  private vehicleOptions(): Array<{ value: string; label: string }> {
    return VEHICLE_IDS.map((id) => ({ value: id, label: i18next.t(VEHICLE_NAME_KEYS[id]) }));
  }
}
