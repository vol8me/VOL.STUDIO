import type { GameServices } from '@/app/GameServices';
import { DevScreen } from '@/menu/DevScreen';
import { ScreenScene, type ScreenPanel } from './ScreenScene';

/** Geliştirici ayarları: alıştırma senaryosu ve tohumu. */
export class DevScene extends ScreenScene {
  constructor(services: GameServices) {
    super('Dev', services);
  }

  protected override createScreen(): ScreenPanel {
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
