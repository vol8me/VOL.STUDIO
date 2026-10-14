import type { GameServices } from '@/app/GameServices';
import { SettingsScreen } from '@/menu/SettingsScreen';
import { ScreenScene, type ScreenPanel } from './ScreenScene';

/** Ayarlar: dil, kalite, ses, titreşim, ekran ve alıştırma senaryosu. */
export class SettingsScene extends ScreenScene {
  constructor(services: GameServices) {
    super('Settings', services);
  }

  protected override createScreen(): ScreenPanel {
    return new SettingsScreen({
      settings: this.services.settings,
      displayAvailable: this.services.displayAvailable,
      onBack: () => this.goto('Menu'),
    });
  }

  protected override onBack(): boolean {
    this.goto('Menu');
    return true;
  }
}
