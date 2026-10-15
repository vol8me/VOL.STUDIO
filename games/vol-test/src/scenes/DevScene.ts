import type { GameServices } from '@/app/GameServices';
import { VEHICLES } from '@/config/vehicles';
import { DevScreen } from '@/menu/DevScreen';
import { ScreenScene, type ScreenPanel } from './ScreenScene';

/** Geliştirici ayarları: mevsim, hava, araç, arka plan yoğunluğu, alıştırma senaryosu, tohum ve kaos. */
export class DevScene extends ScreenScene {
  constructor(services: GameServices) {
    super('Dev', services);
  }

  protected override createScreen(): ScreenPanel {
    // Araç seçimi vitrine anında yansır.
    let shown = this.services.settings.get().vehicle;
    this.scope.addSubscription(
      this.services.settings.subscribe((value) => {
        if (value.vehicle === shown) return;
        shown = value.vehicle;
        this.setShowcase(VEHICLES[value.vehicle]);
      }),
    );
    return new DevScreen({
      settings: this.services.settings,
      onBack: () => this.goto('Menu'),
    });
  }

  protected override onBack(): boolean {
    this.goto('Menu');
    return true;
  }
}
